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

    /**
     * When true (default), the game screen keeps the device awake while it is
     * in front. When false, normal system sleep applies.
     */
    const val KEY_KEEP_SCREEN_ON = "keep_screen_on"

    /**
     * One-shot flag set by the "Reload game" actions (settings row or the
     * long-press shortcut); consumed by the browser screen on resume.
     */
    const val KEY_PENDING_RELOAD = "pending_reload"

    fun isOrientationLockEnabled(context: Context): Boolean =
        PreferenceManager.getDefaultSharedPreferences(context)
            .getBoolean(KEY_ORIENTATION_LOCK, true)

    fun isSettingsAccessHidden(context: Context): Boolean =
        PreferenceManager.getDefaultSharedPreferences(context)
            .getBoolean(KEY_SETTINGS_ACCESS, false)

    fun isKeepScreenOn(context: Context): Boolean =
        PreferenceManager.getDefaultSharedPreferences(context)
            .getBoolean(KEY_KEEP_SCREEN_ON, true)

    fun requestReload(context: Context) {
        PreferenceManager.getDefaultSharedPreferences(context)
            .edit().putBoolean(KEY_PENDING_RELOAD, true).apply()
    }

    /** True exactly once per request; clears the flag when observed. */
    fun consumeReloadRequest(context: Context): Boolean {
        val prefs = PreferenceManager.getDefaultSharedPreferences(context)
        if (!prefs.getBoolean(KEY_PENDING_RELOAD, false)) return false
        prefs.edit().putBoolean(KEY_PENDING_RELOAD, false).apply()
        return true
    }
}
