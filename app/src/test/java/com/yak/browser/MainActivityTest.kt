package com.yak.browser

import android.Manifest
import android.os.Looper
import androidx.appcompat.app.AlertDialog
import androidx.preference.PreferenceManager
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.android.controller.ActivityController
import org.robolectric.annotation.Config
import org.robolectric.shadows.ShadowDialog

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33])
class MainActivityTest {
    private var controller: ActivityController<MainActivity>? = null

    @Before
    fun prepare() {
        val application = RuntimeEnvironment.getApplication()
        PreferenceManager.getDefaultSharedPreferences(application).edit().clear().commit()
        shadowOf(application).denyPermissions(Manifest.permission.POST_NOTIFICATIONS)
    }

    @After
    fun close() {
        controller?.pause()?.stop()?.destroy()
    }

    private fun openApp(): MainActivity {
        controller = Robolectric.buildActivity(MainActivity::class.java).setup()
        shadowOf(Looper.getMainLooper()).idle()
        return controller!!.get()
    }

    @Test
    fun initialDisclaimerPrecedesPermissionsAndAcknowledgementPersistsAcrossLaunches() {
        val activity = openApp()
        val disclaimer = activity.supportFragmentManager.findFragmentByTag("startup_disclaimer") as MainActivity.StartupDisclaimerDialog
        assertFalse(AppPreferences.isDisclaimerAcknowledged(activity))
        assertFalse(AppPreferences.wasNotificationPermissionAsked(activity))
        (disclaimer.dialog as AlertDialog).getButton(AlertDialog.BUTTON_POSITIVE).performClick()
        shadowOf(Looper.getMainLooper()).idle()
        assertTrue(AppPreferences.isDisclaimerAcknowledged(activity))
        assertTrue(AppPreferences.wasNotificationPermissionAsked(activity))
        controller!!.pause().stop().destroy()
        val reopened = openApp()
        assertNull(reopened.supportFragmentManager.findFragmentByTag("startup_disclaimer"))
    }

    @Test
    fun unacknowledgedDisclaimerSurvivesRecreationWithoutDuplicating() {
        openApp()
        controller!!.recreate()
        shadowOf(Looper.getMainLooper()).idle()
        val activity = controller!!.get()
        assertEquals(1, activity.supportFragmentManager.fragments.count { it is MainActivity.StartupDisclaimerDialog })
        assertFalse(AppPreferences.isDisclaimerAcknowledged(activity))
        assertFalse(AppPreferences.wasNotificationPermissionAsked(activity))
        val disclaimer = activity.supportFragmentManager.findFragmentByTag("startup_disclaimer") as MainActivity.StartupDisclaimerDialog
        (disclaimer.dialog as AlertDialog).getButton(AlertDialog.BUTTON_POSITIVE).performClick()
        shadowOf(Looper.getMainLooper()).idle()
        assertTrue(AppPreferences.isDisclaimerAcknowledged(activity))
        assertTrue(AppPreferences.wasNotificationPermissionAsked(activity))
        assertNull(activity.supportFragmentManager.findFragmentByTag("startup_disclaimer"))
    }

    @Test
    fun updateNotesFollowDisclaimerAndPermissionsWaitForTheirDismissal() {
        AppPreferences.setLastSeenVersion(RuntimeEnvironment.getApplication(), "1.0.10")
        val activity = openApp()
        val disclaimer = activity.supportFragmentManager.findFragmentByTag("startup_disclaimer") as MainActivity.StartupDisclaimerDialog
        assertEquals("1.0.10", AppPreferences.lastSeenVersion(activity))
        (disclaimer.dialog as AlertDialog).getButton(AlertDialog.BUTTON_POSITIVE).performClick()
        shadowOf(Looper.getMainLooper()).idle()
        val updates = ShadowDialog.getLatestDialog() as AlertDialog
        assertTrue(updates.isShowing)
        assertNull(activity.supportFragmentManager.findFragmentByTag("startup_disclaimer"))
        assertFalse(AppPreferences.wasNotificationPermissionAsked(activity))
        updates.getButton(AlertDialog.BUTTON_POSITIVE).performClick()
        shadowOf(Looper.getMainLooper()).idle()
        assertTrue(AppPreferences.wasNotificationPermissionAsked(activity))
    }
}
