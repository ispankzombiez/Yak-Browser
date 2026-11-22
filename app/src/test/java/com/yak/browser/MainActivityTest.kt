package com.yak.browser

import android.Manifest
import android.os.Looper
import android.view.View
import android.view.ViewGroup
import androidx.appcompat.app.AlertDialog
import androidx.core.graphics.Insets
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.preference.PreferenceManager
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
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

    @Test
    @Config(sdk = [28])
    fun systemBarsDefaultToHiddenAndCanBeEnabledIndependentlyOnReturnAndFocus() {
        AppPreferences.acknowledgeDisclaimer(RuntimeEnvironment.getApplication())
        val activity = openApp()
        val decor = activity.window.decorView
        val hiddenFlags = View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
        assertEquals(hiddenFlags, decor.systemUiVisibility and hiddenFlags)
        val webView = activity.findViewById<View>(R.id.webView)
        val preferences = PreferenceManager.getDefaultSharedPreferences(activity)
        for ((status, navigation) in listOf(true to false, false to true, true to true, false to false)) {
            controller!!.pause()
            preferences.edit()
                .putBoolean(AppPreferences.KEY_KEEP_STATUS_BAR_VISIBLE, status)
                .putBoolean(AppPreferences.KEY_KEEP_NAVIGATION_BAR_VISIBLE, navigation).commit()
            controller!!.resume()
            val expected = (if (status) 0 else View.SYSTEM_UI_FLAG_FULLSCREEN) or
                (if (navigation) 0 else View.SYSTEM_UI_FLAG_HIDE_NAVIGATION)
            assertEquals(expected, decor.systemUiVisibility and hiddenFlags)
            activity.onWindowFocusChanged(false)
            activity.onWindowFocusChanged(true)
            assertEquals(expected, decor.systemUiVisibility and hiddenFlags)
            assertSame(webView, activity.findViewById<View>(R.id.webView))
        }
    }

    @Test
    fun persistentBarsReserveTheirInsetsButTransientBarsDoNotResizeTheGame() {
        AppPreferences.acknowledgeDisclaimer(RuntimeEnvironment.getApplication())
        val activity = openApp()
        val root = activity.findViewById<View>(R.id.gameRoot)
        val gear = activity.findViewById<View>(R.id.settingsButton)
        val preferences = PreferenceManager.getDefaultSharedPreferences(activity)
        val insets = WindowInsetsCompat.Builder()
            .setInsets(WindowInsetsCompat.Type.statusBars(), Insets.of(0, 24, 0, 0))
            .setInsets(WindowInsetsCompat.Type.navigationBars(), Insets.of(0, 0, 0, 48))
            .setVisible(WindowInsetsCompat.Type.systemBars(), true)
            .build()
        val margin = (10 * activity.resources.displayMetrics.density).toInt()
        for (status in listOf(false, true)) {
            for (navigation in listOf(false, true)) {
                preferences.edit()
                    .putBoolean(AppPreferences.KEY_KEEP_STATUS_BAR_VISIBLE, status)
                    .putBoolean(AppPreferences.KEY_KEEP_NAVIGATION_BAR_VISIBLE, navigation).commit()
                val remaining = ViewCompat.dispatchApplyWindowInsets(root, insets)
                assertEquals(if (status) 24 else 0, root.paddingTop)
                assertEquals(if (navigation) 48 else 0, root.paddingBottom)
                assertEquals(margin + if (status) 0 else 24, (gear.layoutParams as ViewGroup.MarginLayoutParams).topMargin)
                assertEquals(if (status) 0 else 24, remaining.getInsets(WindowInsetsCompat.Type.statusBars()).top)
                assertEquals(if (navigation) 0 else 48, remaining.getInsets(WindowInsetsCompat.Type.navigationBars()).bottom)
            }
        }
        val landscape = WindowInsetsCompat.Builder(insets)
            .setInsets(WindowInsetsCompat.Type.navigationBars(), Insets.of(0, 0, 42, 0))
            .build()
        ViewCompat.dispatchApplyWindowInsets(root, landscape)
        assertEquals(42, root.paddingRight)
        assertEquals(0, root.paddingBottom)
    }

}
