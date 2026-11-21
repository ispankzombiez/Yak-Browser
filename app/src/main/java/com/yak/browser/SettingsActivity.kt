package com.yak.browser

import android.Manifest
import android.app.Dialog
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.SharedPreferences
import android.net.Uri
import android.os.Bundle
import android.os.Build
import android.provider.Settings
import android.util.Log
import android.view.View
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.app.AlertDialog
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.fragment.app.DialogFragment
import androidx.preference.Preference
import androidx.preference.PreferenceFragmentCompat
import androidx.preference.PreferenceManager
import androidx.preference.SwitchPreferenceCompat
import com.google.android.material.tabs.TabLayout

/**
 * In-app settings page, opened from the gear overlay on the game screen.
 *
 * The app follows dark styling to match the fullscreen black game view, and
 * pads itself with system-bar insets so it works with edge-to-edge enforcement.
 */
class SettingsActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        setContentView(R.layout.activity_settings)

        val tabs = findViewById<TabLayout>(R.id.settingsTabs)
        tabs.addTab(tabs.newTab().setText(R.string.settings_main_tab))
        tabs.addTab(tabs.newTab().setText(R.string.settings_notifications_tab))
        tabs.getTabAt(savedInstanceState?.getInt(SELECTED_TAB) ?: 0)?.select()
        tabs.addOnTabSelectedListener(object : TabLayout.OnTabSelectedListener {
            override fun onTabSelected(tab: TabLayout.Tab) {
                showTab(if (tab.position == 0) MAIN_TAB else NOTIFICATIONS_TAB)
            }
            override fun onTabUnselected(tab: TabLayout.Tab) = Unit
            override fun onTabReselected(tab: TabLayout.Tab) = Unit
        })
        if (savedInstanceState == null) showTab(MAIN_TAB)

        val container = findViewById<View>(R.id.settingsRoot)
        ViewCompat.setOnApplyWindowInsetsListener(container) { v, insets ->
            val bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
            )
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }
    }

    private fun showTab(tab: String) {
        val current = supportFragmentManager.findFragmentById(R.id.settingsContainer)
        if (current?.arguments?.getString(TAB_ARGUMENT) == tab) return
        supportFragmentManager.beginTransaction()
            .replace(R.id.settingsContainer, SettingsFragment().apply {
                arguments = Bundle().apply { putString(TAB_ARGUMENT, tab) }
            })
            .commitNow()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        outState.putInt(SELECTED_TAB, findViewById<TabLayout>(R.id.settingsTabs).selectedTabPosition)
        super.onSaveInstanceState(outState)
    }

    companion object {
        private const val MAIN_TAB = "main"
        private const val NOTIFICATIONS_TAB = "notifications"
        private const val TAB_ARGUMENT = "settings_tab"
        private const val SELECTED_TAB = "selected_tab"
    }

    class OrientationWarningDialog : DialogFragment() {
        override fun onCreateDialog(savedInstanceState: Bundle?): Dialog =
            AlertDialog.Builder(requireContext())
                .setTitle(R.string.orientation_warning_title)
                .setMessage(R.string.orientation_warning_message)
                .setNegativeButton(android.R.string.cancel, null)
                .setPositiveButton(R.string.orientation_warning_continue) { _, _ ->
                    PreferenceManager.getDefaultSharedPreferences(requireContext()).edit()
                        .putBoolean(AppPreferences.KEY_ORIENTATION_LOCK, true).apply()
                }
                .create()
    }

    class SettingsFragment : PreferenceFragmentCompat(), SharedPreferences.OnSharedPreferenceChangeListener {

        private var testAfterPermission = false

        private val permissionLauncher =
            registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
                if (!granted) showBlockedMessage()
                else if (testAfterPermission) sendTestNotification()
                testAfterPermission = false
                updateNotificationSettings()
            }

        private fun enableNotifications(forTest: Boolean = false) {
            testAfterPermission = forTest
            val context = requireContext()
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                !ZoneNotifier.hasNotificationPermission(context) &&
                (!AppPreferences.wasNotificationPermissionAsked(context) ||
                    shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS))
            ) {
                AppPreferences.setNotificationPermissionAsked(context)
                permissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            } else {
                val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                        .putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
                } else {
                    Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}"))
                }
                try {
                    startActivity(intent)
                } catch (e: ActivityNotFoundException) {
                    Log.w("YakBrowser", "Could not open notification settings.", e)
                    Toast.makeText(context, R.string.notification_settings_unavailable, Toast.LENGTH_LONG).show()
                }
            }
        }

        private fun requestExactAlarmPermission() {
            val context = requireContext()
            val intent = Intent(
                Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
                Uri.parse("package:${context.packageName}")
            )
            try {
                startActivity(intent)
            } catch (e: ActivityNotFoundException) {
                Toast.makeText(context, R.string.exact_alarm_unavailable, Toast.LENGTH_LONG).show()
            }
        }

        override fun onResume() {
            super.onResume()
            PreferenceManager.getDefaultSharedPreferences(requireContext())
                .registerOnSharedPreferenceChangeListener(this)
            updateNotificationSettings()
            if (testAfterPermission && ZoneNotifier.areNotificationsAllowed(requireContext())) {
                testAfterPermission = false
                sendTestNotification()
            }
            // Back from the permission screen: if it wasn't granted, show the
            // toggle off so it never claims exact timing it can't deliver.
            val exact = findPreference<SwitchPreferenceCompat>(KEY_EXACT_ALARMS)
            if (exact?.isChecked == true && !ZoneNotifier.canUseExactAlarms(requireContext())) {
                exact.isChecked = false
            }
            ZoneNotifier.resync(requireContext().applicationContext)
        }

        override fun onPause() {
            PreferenceManager.getDefaultSharedPreferences(requireContext())
                .unregisterOnSharedPreferenceChangeListener(this)
            super.onPause()
        }

        override fun onSharedPreferenceChanged(preferences: SharedPreferences, key: String?) {
            if (key == AppPreferences.KEY_ORIENTATION_LOCK) {
                findPreference<SwitchPreferenceCompat>(key)?.isChecked =
                    AppPreferences.isOrientationLockEnabled(requireContext())
            }
            if (key == AppPreferences.KEY_ZONE_NOTIFICATIONS ||
                key == AppPreferences.KEY_BATTLE_NOTIFICATIONS || key == KEY_EXACT_ALARMS) {
                updateNotificationSettings()
                ZoneNotifier.resync(requireContext().applicationContext)
            }
        }

        private fun updateNotificationSettings() {
            findPreference<NotificationPermissionPreference>(KEY_NOTIFICATION_PERMISSION)?.refresh()
            findPreference<Preference>(KEY_EXACT_ALARMS)?.isEnabled =
                AppPreferences.isZoneNotificationsEnabled(requireContext()) ||
                    AppPreferences.isBattleNotificationsEnabled(requireContext())
        }

        override fun onSaveInstanceState(outState: Bundle) {
            outState.putBoolean("test_after_permission", testAfterPermission)
            super.onSaveInstanceState(outState)
        }

        private fun sendTestNotification() {
            val context = requireContext()
            if (ZoneNotifier.sendTest(context)) {
                Toast.makeText(context, R.string.test_notification_sent, Toast.LENGTH_SHORT).show()
            } else {
                showBlockedMessage()
            }
        }

        private fun showBlockedMessage() {
            Toast.makeText(requireContext(), R.string.test_notification_blocked, Toast.LENGTH_LONG).show()
        }

        override fun onCreatePreferences(savedInstanceState: Bundle?, rootKey: String?) {
            testAfterPermission = savedInstanceState?.getBoolean("test_after_permission") ?: false
            setPreferencesFromResource(
                if (arguments?.getString(TAB_ARGUMENT) == NOTIFICATIONS_TAB)
                    R.xml.notification_preferences else R.xml.root_preferences, rootKey
            )

            findPreference<Preference>(AppPreferences.KEY_ORIENTATION_LOCK)?.onPreferenceChangeListener =
                Preference.OnPreferenceChangeListener { _, newValue ->
                    if (newValue == true) {
                        if (childFragmentManager.findFragmentByTag(ORIENTATION_WARNING) == null) {
                            OrientationWarningDialog().show(childFragmentManager, ORIENTATION_WARNING)
                        }
                        false
                    } else true
                }

            findPreference<Preference>(KEY_NOTIFICATION_PERMISSION)?.onPreferenceClickListener =
                Preference.OnPreferenceClickListener {
                    enableNotifications()
                    true
                }

            for (key in listOf(AppPreferences.KEY_ZONE_NOTIFICATIONS, AppPreferences.KEY_BATTLE_NOTIFICATIONS)) {
                findPreference<Preference>(key)?.onPreferenceChangeListener =
                    Preference.OnPreferenceChangeListener { _, newValue ->
                        if (newValue == true && !ZoneNotifier.areNotificationsAllowed(requireContext())) {
                            enableNotifications()
                        }
                        true
                    }
            }

            // "Exact alarm timing": turning it on without the device-level
            // "Alarms & reminders" permission sends the user to that screen.
            findPreference<Preference>(KEY_EXACT_ALARMS)?.onPreferenceChangeListener =
                Preference.OnPreferenceChangeListener { _, newValue ->
                    if (newValue == true && !ZoneNotifier.canUseExactAlarms(requireContext())) {
                        requestExactAlarmPermission()
                    }
                    true
                }

            // "Send test notification": asks for the permission first if it
            // is missing (Android 13+), then posts a sample alert.
            findPreference<Preference>(KEY_TEST_NOTIFICATION)?.onPreferenceClickListener =
                Preference.OnPreferenceClickListener {
                    if (ZoneNotifier.areNotificationsAllowed(requireContext())) {
                        sendTestNotification()
                    } else {
                        enableNotifications(forTest = true)
                    }
                    true
                }

            // "Reload game": flag the browser screen and close settings; the
            // screen rebuilds on resume and — because the flag is consumed in
            // onCreate — always lands on the game site (/play), even when the
            // player had opened the sign-in page. The flag-based hand-off
            // works from every entry point (gear, App info row, long-press
            // shortcut).
            findPreference<Preference>(KEY_RELOAD)?.onPreferenceClickListener =
                Preference.OnPreferenceClickListener {
                    AppPreferences.requestReload(requireContext())
                    requireActivity().finish()
                    true
                }

            // "Login": open the site's sign-in page INSIDE the app WebView
            // (not a Custom Tab) — the session it writes must land in this
            // app's storage, same origin as /play, so the beta-access gate
            // sees it on the next launch.
            findPreference<Preference>(KEY_LOGIN)?.onPreferenceClickListener =
                Preference.OnPreferenceClickListener {
                    AppPreferences.requestOpenUrl(requireContext(), LOGIN_URL)
                    requireActivity().finish()
                    true
                }

            // Version, straight from the package (no BuildConfig needed).
            findPreference<Preference>(KEY_VERSION)?.summary = runCatching {
                requireContext().packageManager
                    .getPackageInfo(requireContext().packageName, 0).versionName
            }.getOrNull() ?: "unknown"

            findPreference<Preference>(KEY_PRIVACY)?.onPreferenceClickListener =
                Preference.OnPreferenceClickListener {
                    openUrl(PRIVACY_URL)
                    true
                }

            findPreference<Preference>(KEY_SUPPORT)?.onPreferenceClickListener =
                Preference.OnPreferenceClickListener {
                    val mail = Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:$SUPPORT_EMAIL"))
                    try {
                        startActivity(mail)
                    } catch (e: ActivityNotFoundException) {
                        Toast.makeText(requireContext(), R.string.no_email_app, Toast.LENGTH_SHORT)
                            .show()
                    }
                    true
                }

            updateNotificationSettings()
        }

        /** Opens a URL outside the game, in a Custom Tab (browser fallback). */
        private fun openUrl(url: String) {
            val uri = Uri.parse(url)
            val customTab = CustomTabsHelper.build(requireContext(), uri)
            try {
                startActivity(customTab)
            } catch (e: ActivityNotFoundException) {
                try {
                    startActivity(Intent(Intent.ACTION_VIEW, uri))
                } catch (e2: ActivityNotFoundException) {
                    Toast.makeText(requireContext(), R.string.no_browser_found, Toast.LENGTH_SHORT)
                        .show()
                }
            }
        }

        companion object {
            private const val KEY_EXACT_ALARMS = "exact_alarms"
            private const val KEY_TEST_NOTIFICATION = "test_notification"
            private const val KEY_NOTIFICATION_PERMISSION = "notification_permission"
            private const val ORIENTATION_WARNING = "orientation_warning"
            private const val KEY_RELOAD = "reload_game"
            private const val KEY_LOGIN = "login"
            private const val LOGIN_URL = "https://yakkamon.com"
            private const val KEY_VERSION = "about_version"
            private const val KEY_PRIVACY = "about_privacy"
            private const val KEY_SUPPORT = "about_support"
            private const val PRIVACY_URL = "https://ispankzombiez.github.io/Yak-Browser/privacy.html"
            private const val SUPPORT_EMAIL = "iSPANKapps@gmail.com"
        }
    }
}
