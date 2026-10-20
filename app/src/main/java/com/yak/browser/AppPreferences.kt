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

    /** Number of app starts; drives when the Play rating prompt fires. */
    const val KEY_SESSION_COUNT = "session_count"

    /** versionName last shown in the What's New dialog. */
    const val KEY_LAST_SEEN_VERSION = "last_seen_version"

    /**
     * Storage-hygiene schema: bumped when the one-time wipe policy changes so
     * every existing install runs the new wipe exactly once.
     */
    const val KEY_STORAGE_SCHEMA = "storage_schema"

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

    /** Counts one app start and returns the new total. */
    fun incrementSessionCount(context: Context): Int {
        val prefs = PreferenceManager.getDefaultSharedPreferences(context)
        val next = prefs.getInt(KEY_SESSION_COUNT, 0) + 1
        prefs.edit().putInt(KEY_SESSION_COUNT, next).apply()
        return next
    }

    fun lastSeenVersion(context: Context): String? =
        PreferenceManager.getDefaultSharedPreferences(context)
            .getString(KEY_LAST_SEEN_VERSION, null)

    fun setLastSeenVersion(context: Context, version: String) {
        PreferenceManager.getDefaultSharedPreferences(context)
            .edit().putString(KEY_LAST_SEEN_VERSION, version).apply()
    }

    fun storageSchema(context: Context): Int =
        PreferenceManager.getDefaultSharedPreferences(context)
            .getInt(KEY_STORAGE_SCHEMA, 0)

    fun setStorageSchema(context: Context, schema: Int) {
        PreferenceManager.getDefaultSharedPreferences(context)
            .edit().putInt(KEY_STORAGE_SCHEMA, schema).apply()
    }
}
