package com.yak.browser

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.preference.Preference
import androidx.preference.PreferenceFragmentCompat

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

        if (savedInstanceState == null) {
            supportFragmentManager.beginTransaction()
                .replace(R.id.settingsContainer, SettingsFragment())
                .commit()
        }

        val container = findViewById<View>(R.id.settingsContainer)
        ViewCompat.setOnApplyWindowInsetsListener(container) { v, insets ->
            val bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
            )
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }
    }

    class SettingsFragment : PreferenceFragmentCompat() {
        override fun onCreatePreferences(savedInstanceState: Bundle?, rootKey: String?) {
            setPreferencesFromResource(R.xml.root_preferences, rootKey)

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
