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

    fun isOrientationLockEnabled(context: Context): Boolean =
        PreferenceManager.getDefaultSharedPreferences(context)
            .getBoolean(KEY_ORIENTATION_LOCK, true)
}
