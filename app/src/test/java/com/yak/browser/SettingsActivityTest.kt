package com.yak.browser

import android.Manifest
import android.app.Application
import android.app.NotificationManager
import android.os.Looper
import android.provider.Settings
import android.view.LayoutInflater
import android.view.ViewGroup
import android.widget.Button
import androidx.appcompat.app.AlertDialog
import androidx.preference.PreferenceManager
import androidx.preference.PreferenceViewHolder
import androidx.preference.SwitchPreferenceCompat
import com.google.android.material.tabs.TabLayout
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

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33])
class SettingsActivityTest {
    private lateinit var application: Application
    private var controller: ActivityController<SettingsActivity>? = null

    @Before
    fun prepare() {
        application = RuntimeEnvironment.getApplication()
        PreferenceManager.getDefaultSharedPreferences(application).edit().clear().commit()
        shadowOf(application).denyPermissions(Manifest.permission.POST_NOTIFICATIONS)
        shadowOf(application.getSystemService(NotificationManager::class.java)).setNotificationsEnabled(true)
    }

    @After
    fun close() {
        controller?.pause()?.stop()?.destroy()
    }

    private fun openSettings(notifications: Boolean = false): SettingsActivity.SettingsFragment {
        val activityController = Robolectric.buildActivity(SettingsActivity::class.java).setup()
        controller = activityController
        val activity = activityController.get()
        if (notifications) activity.findViewById<TabLayout>(R.id.settingsTabs).getTabAt(1)!!.select()
        shadowOf(Looper.getMainLooper()).idle()
        return activity.supportFragmentManager.findFragmentById(R.id.settingsContainer) as SettingsActivity.SettingsFragment
    }

    private fun permissionButton(fragment: SettingsActivity.SettingsFragment): Button {
        val preference = fragment.findPreference<NotificationPermissionPreference>("notification_permission")!!
        val inflater = LayoutInflater.from(fragment.requireContext())
        val row = inflater.inflate(preference.layoutResource, null)
        inflater.inflate(preference.widgetLayoutResource, row.findViewById<ViewGroup>(android.R.id.widget_frame))
        preference.onBindViewHolder(PreferenceViewHolder.createInstanceForTests(row))
        return row.findViewById(R.id.notificationPermissionButton)
    }

    @Test
    fun freshMainSettingsAreOffWithoutChangingExistingChoices() {
        val fragment = openSettings()
        val keys = listOf(
            AppPreferences.KEY_ORIENTATION_LOCK, AppPreferences.KEY_SETTINGS_ACCESS,
            AppPreferences.KEY_KEEP_SCREEN_ON, AppPreferences.KEY_CLOCK_TOP_LEFT,
            AppPreferences.KEY_ENLARGE_BOTTOM_BAR, AppPreferences.KEY_TOP_BOTTOM_BATTLES
        )
        for (key in keys) assertFalse(fragment.findPreference<SwitchPreferenceCompat>(key)!!.isChecked)
        assertFalse(AppPreferences.isOrientationLockEnabled(application))
        assertFalse(AppPreferences.isKeepScreenOn(application))
        PreferenceManager.getDefaultSharedPreferences(application).edit()
            .putBoolean(AppPreferences.KEY_ORIENTATION_LOCK, true)
            .putBoolean(AppPreferences.KEY_KEEP_SCREEN_ON, true).commit()
        controller!!.recreate()
        assertTrue(AppPreferences.isOrientationLockEnabled(application))
        assertTrue(AppPreferences.isKeepScreenOn(application))
        val restored = controller!!.get().supportFragmentManager.findFragmentById(R.id.settingsContainer) as SettingsActivity.SettingsFragment
        assertTrue(restored.findPreference<SwitchPreferenceCompat>(AppPreferences.KEY_ORIENTATION_LOCK)!!.isChecked)
        assertTrue(restored.findPreference<SwitchPreferenceCompat>(AppPreferences.KEY_KEEP_SCREEN_ON)!!.isChecked)
    }

    @Test
    fun portraitModeNeedsConfirmationAndCancelKeepsItOff() {
        val fragment = openSettings()
        val orientation = fragment.findPreference<SwitchPreferenceCompat>(AppPreferences.KEY_ORIENTATION_LOCK)!!
        orientation.performClick()
        fragment.childFragmentManager.executePendingTransactions()
        val warning = fragment.childFragmentManager.findFragmentByTag("orientation_warning") as SettingsActivity.OrientationWarningDialog
        assertFalse(orientation.isChecked)
        (warning.dialog as AlertDialog).getButton(AlertDialog.BUTTON_NEGATIVE).performClick()
        shadowOf(Looper.getMainLooper()).idle()
        assertFalse(AppPreferences.isOrientationLockEnabled(application))
        orientation.performClick()
        fragment.childFragmentManager.executePendingTransactions()
        val accepted = fragment.childFragmentManager.findFragmentByTag("orientation_warning") as SettingsActivity.OrientationWarningDialog
        (accepted.dialog as AlertDialog).getButton(AlertDialog.BUTTON_POSITIVE).performClick()
        shadowOf(Looper.getMainLooper()).idle()
        assertTrue(orientation.isChecked)
        assertTrue(AppPreferences.isOrientationLockEnabled(application))
        orientation.performClick()
        assertFalse(AppPreferences.isOrientationLockEnabled(application))
    }

    @Test
    fun permissionButtonChangesFromEnableToDisabledGrantedAfterPermissionReturn() {
        val fragment = openSettings(notifications = true)
        val denied = permissionButton(fragment)
        assertTrue(denied.isEnabled)
        assertTrue(denied.isClickable)
        assertEquals("Enable", denied.text.toString())
        controller!!.pause()
        shadowOf(application).grantPermissions(Manifest.permission.POST_NOTIFICATIONS)
        controller!!.resume()
        val granted = permissionButton(fragment)
        assertFalse(granted.isEnabled)
        assertFalse(granted.isClickable)
        assertTrue(granted.alpha < denied.alpha)
        assertEquals("Granted", granted.text.toString())
        granted.performClick()
        assertNull(shadowOf(controller!!.get()).nextStartedActivity)
    }

    @Test
    fun systemBlockedNotificationsOfferEnableAndOpenAppNotificationSettings() {
        shadowOf(application).grantPermissions(Manifest.permission.POST_NOTIFICATIONS)
        shadowOf(application.getSystemService(NotificationManager::class.java)).setNotificationsEnabled(false)
        val fragment = openSettings(notifications = true)
        val button = permissionButton(fragment)
        assertTrue(button.isEnabled)
        assertEquals("Enable", button.text.toString())
        button.performClick()
        val intent = shadowOf(controller!!.get()).nextStartedActivity
        assertEquals(Settings.ACTION_APP_NOTIFICATION_SETTINGS, intent.action)
        assertEquals(application.packageName, intent.getStringExtra(Settings.EXTRA_APP_PACKAGE))
    }

    @Test
    fun previouslyDeniedPermissionCanBeEnabledThroughSystemSettings() {
        AppPreferences.setNotificationPermissionAsked(application)
        val fragment = openSettings(notifications = true)
        permissionButton(fragment).performClick()
        val intent = shadowOf(controller!!.get()).nextStartedActivity
        assertEquals(Settings.ACTION_APP_NOTIFICATION_SETTINGS, intent.action)
    }

    @Test
    fun pendingPortraitWarningSurvivesActivityRecreationWithoutEnablingTheLock() {
        val fragment = openSettings()
        fragment.findPreference<SwitchPreferenceCompat>(AppPreferences.KEY_ORIENTATION_LOCK)!!.performClick()
        fragment.childFragmentManager.executePendingTransactions()
        controller!!.recreate()
        shadowOf(Looper.getMainLooper()).idle()
        val restored = controller!!.get().supportFragmentManager.findFragmentById(R.id.settingsContainer) as SettingsActivity.SettingsFragment
        assertTrue(restored.childFragmentManager.findFragmentByTag("orientation_warning") is SettingsActivity.OrientationWarningDialog)
        assertFalse(AppPreferences.isOrientationLockEnabled(application))
    }
}
