package com.yak.browser

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent

/** Builds a Chrome Custom Tab intent for opening links outside the game. */
object CustomTabsHelper {

    fun build(context: Context, uri: Uri): Intent {
        return CustomTabsIntent.Builder()
            .setShowTitle(true)
            .setUrlBarHidingEnabled(true)
            .build()
            .intent
            .apply {
                data = uri
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
    }
}
