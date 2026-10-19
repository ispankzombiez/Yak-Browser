package com.yak.browser

import android.content.Context
import androidx.preference.PreferenceManager

/** Central access to the app's persisted settings. */
object AppPreferences {

    /**
     * When true (default), the app is locked to portrait and the site is told
     * the device is in landscape (so the game runs while held in portrait).
     * When false, the app follows the device sensor and the page gets real
     * orientation values.
     */
    const val KEY_ORIENTATION_LOCK = "orientation_lock"

    /**
     * When true, the floating settings gear on the game screen is hidden and
     * settings are reached through an entry point on the device instead.
     * Default false: the floating gear shows, as always.
     */
    const val KEY_SETTINGS_ACCESS = "settings_access"

    fun isOrientationLockEnabled(context: Context): Boolean =
        PreferenceManager.getDefaultSharedPreferences(context)
            .getBoolean(KEY_ORIENTATION_LOCK, true)

    fun isSettingsAccessHidden(context: Context): Boolean =
        PreferenceManager.getDefaultSharedPreferences(context)
            .getBoolean(KEY_SETTINGS_ACCESS, false)
}
