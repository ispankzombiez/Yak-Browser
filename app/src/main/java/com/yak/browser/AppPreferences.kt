package com.yak.browser

import android.content.Context
import androidx.preference.PreferenceManager

/** Central access to the app's persisted settings. */
object AppPreferences {

    /**
     * When true, the app is locked to portrait and the site is told
     * the device is in landscape (so the game runs while held in portrait).
     * When false, the app follows the device sensor and the page gets real
     * orientation values. Default false.
     */
    const val KEY_ORIENTATION_LOCK = "orientation_lock"

    /**
     * When true, the floating settings gear on the game screen is hidden and
     * settings are reached through an entry point on the device instead.
     * Default false: the floating gear shows, as always.
     */
    const val KEY_SETTINGS_ACCESS = "settings_access"

    /**
     * When true, the game screen keeps the device awake while it is
     * in front. When false (default), normal system sleep applies.
     */
    const val KEY_KEEP_SCREEN_ON = "keep_screen_on"

    /**
     * When true, the site's clock group (clock pill + the two icons in the
     * bottom-right corner) is moved to the top-left corner — portrait
     * screens only; landscape is never affected. Default false: the clock
     * stays where the site puts it.
     */
    const val KEY_CLOCK_TOP_LEFT = "clock_top_left"

    /** Enlarges the portrait items bar independently of the clock. Default false. */
    const val KEY_ENLARGE_BOTTOM_BAR = "enlarge_bottom_bar"

    const val KEY_TOP_BOTTOM_BATTLES = "top_bottom_battles"

    /**
     * When true (default), a notification fires when new Yakkamon arrive in
     * a hunting zone, plus tentative farm-visitor reminders (scheduled
     * from the game's own times). Needs notification permission on Android 13+.
     */
    const val KEY_ZONE_NOTIFICATIONS = "zone_notifications"

    /** One alert for the next challenge refresh learned from the Battles timer. */
    const val KEY_BATTLE_NOTIFICATIONS = "battle_notifications"

    /**
     * When true, arrival and battle alarms are exact (needs the "Alarms & reminders"
     * permission on Android 12+; falls back to inexact without it). When
     * false (default), they are inexact: Android may delay them to save
     * battery, but no special permission is needed.
     */
    const val KEY_EXACT_ALARMS = "exact_alarms"

    /** Set once the notification permission prompt has been shown. */
    const val KEY_NOTIFICATION_PERMISSION_ASKED = "notification_permission_asked"

    const val KEY_DISCLAIMER_ACKNOWLEDGED = "disclaimer_acknowledged"

    /**
     * One-shot flag set by the "Reload game" actions (settings row or the
     * long-press shortcut); the browser screen peeks it on resume (to
     * rebuild) and consumes it in onCreate, which then always lands on the
     * game site — never restores whatever page the player had open.
     */
    const val KEY_PENDING_RELOAD = "pending_reload"

    /**
     * One-shot URL set by the "Login" settings row: the browser screen
     * loads it in the in-app WebView on resume (same origin as /play, so
     * the session it writes is seen by the beta-access gate).
     */
    const val KEY_PENDING_URL = "pending_url"

    /** Number of app starts; drives when the Play rating prompt fires. */
    const val KEY_SESSION_COUNT = "session_count"

    /** versionName last shown in the What's New dialog. */
    const val KEY_LAST_SEEN_VERSION = "last_seen_version"

    /**
     * Storage-hygiene schema: records that the fresh-install-only wipe
     * policy has been evaluated for this install. Bump when the wipe
     * policy itself changes — note the wipe runs on FRESH INSTALLS only;
     * upgrades are marked without wiping (the player's session and cache
     * are theirs to keep; access control belongs to the website).
     */
    const val KEY_STORAGE_SCHEMA = "storage_schema"

    fun isOrientationLockEnabled(context: Context): Boolean =
        PreferenceManager.getDefaultSharedPreferences(context)
            .getBoolean(KEY_ORIENTATION_LOCK, false)

    fun isSettingsAccessHidden(context: Context): Boolean =
        PreferenceManager.getDefaultSharedPreferences(context)
            .getBoolean(KEY_SETTINGS_ACCESS, false)

    fun isKeepScreenOn(context: Context): Boolean =
        PreferenceManager.getDefaultSharedPreferences(context)
            .getBoolean(KEY_KEEP_SCREEN_ON, false)

    fun isClockTopLeft(context: Context): Boolean =
        PreferenceManager.getDefaultSharedPreferences(context)
            .getBoolean(KEY_CLOCK_TOP_LEFT, false)

    fun isEnlargeBottomBar(context: Context): Boolean =
        PreferenceManager.getDefaultSharedPreferences(context)
            .getBoolean(KEY_ENLARGE_BOTTOM_BAR, false)

    fun isTopBottomBattles(context: Context): Boolean =
        PreferenceManager.getDefaultSharedPreferences(context)
            .getBoolean(KEY_TOP_BOTTOM_BATTLES, false)

    fun isZoneNotificationsEnabled(context: Context): Boolean =
        PreferenceManager.getDefaultSharedPreferences(context)
            .getBoolean(KEY_ZONE_NOTIFICATIONS, true)

    fun isBattleNotificationsEnabled(context: Context): Boolean =
        PreferenceManager.getDefaultSharedPreferences(context)
            .getBoolean(KEY_BATTLE_NOTIFICATIONS, false)

    fun isExactAlarms(context: Context): Boolean =
        PreferenceManager.getDefaultSharedPreferences(context)
            .getBoolean(KEY_EXACT_ALARMS, false)

    fun wasNotificationPermissionAsked(context: Context): Boolean =
        PreferenceManager.getDefaultSharedPreferences(context)
            .getBoolean(KEY_NOTIFICATION_PERMISSION_ASKED, false)

    fun setNotificationPermissionAsked(context: Context) {
        PreferenceManager.getDefaultSharedPreferences(context)
            .edit().putBoolean(KEY_NOTIFICATION_PERMISSION_ASKED, true).apply()
    }

    fun isDisclaimerAcknowledged(context: Context): Boolean =
        PreferenceManager.getDefaultSharedPreferences(context)
            .getBoolean(KEY_DISCLAIMER_ACKNOWLEDGED, false)

    fun acknowledgeDisclaimer(context: Context) {
        PreferenceManager.getDefaultSharedPreferences(context)
            .edit().putBoolean(KEY_DISCLAIMER_ACKNOWLEDGED, true).apply()
    }

    fun requestReload(context: Context) {
        PreferenceManager.getDefaultSharedPreferences(context)
            .edit().putBoolean(KEY_PENDING_RELOAD, true).apply()
    }

    /** True while a reload is pending; consumed later, in onCreate. */
    fun isReloadRequested(context: Context): Boolean =
        PreferenceManager.getDefaultSharedPreferences(context)
            .getBoolean(KEY_PENDING_RELOAD, false)

    /** True exactly once per request; clears the flag when observed. */
    fun consumeReloadRequest(context: Context): Boolean {
        val prefs = PreferenceManager.getDefaultSharedPreferences(context)
        if (!prefs.getBoolean(KEY_PENDING_RELOAD, false)) return false
        prefs.edit().putBoolean(KEY_PENDING_RELOAD, false).apply()
        return true
    }

    fun requestOpenUrl(context: Context, url: String) {
        PreferenceManager.getDefaultSharedPreferences(context)
            .edit().putString(KEY_PENDING_URL, url).apply()
    }

    /** The pending URL exactly once; clears it when observed. */
    fun consumeOpenUrlRequest(context: Context): String? {
        val prefs = PreferenceManager.getDefaultSharedPreferences(context)
        val url = prefs.getString(KEY_PENDING_URL, null) ?: return null
        prefs.edit().putString(KEY_PENDING_URL, null).apply()
        return url
    }

    /**
     * True if any earlier launch left state behind — i.e. this is an
     * upgrade of an existing install, not a fresh install. Checked before
     * the first-run session counter runs.
     */
    fun hasPriorLaunchState(context: Context): Boolean {
        val prefs = PreferenceManager.getDefaultSharedPreferences(context)
        return prefs.getInt(KEY_SESSION_COUNT, 0) > 0 ||
            prefs.getString(KEY_LAST_SEEN_VERSION, null) != null
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
