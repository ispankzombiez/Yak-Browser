package com.yak.browser

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.ActivityInfo
import android.graphics.Bitmap
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature

/**
 * The whole app: a single fullscreen WebView pointed at the Yakkamon game.
 *
 * Orientation note: with the orientation lock ON (default), the activity is
 * locked to **portrait** so the game can be held and played one-handed, while
 * [ORIENTATION_SCRIPT] is injected at document start to tell the site the
 * device is in **landscape**. The game refuses to run in portrait (it shows a
 * "rotate your phone" gate), so it must be told a white lie about the
 * orientation. With the lock OFF the app follows the device sensor and the
 * page receives real orientation values (no spoof is installed).
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var errorPanel: View

    /** Set when the document-start injection succeeded; enables the fallback path. */
    private var documentStartInstalled = false

    /**
     * True while an orientation lock is active: controls both the activity
     * orientation and whether the landscape spoof is injected at all. Captured
     * at onCreate and re-checked in onResume to detect settings changes.
     */
    private var orientationLockEnabled = true

    /** True when the spoof should be injected (lock on), regardless of method. */
    private var spoofDesired = false

    /** Cached copy of the orientation override script (injected per navigation as fallback). */
    private val orientationScript: String by lazy {
        assets.open(ORIENTATION_SCRIPT).bufferedReader(Charsets.UTF_8).use { it.readText() }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Let Chrome DevTools (chrome://inspect) attach to this app's WebView in
        // debug builds — used to diagnose page layout issues on a real device.
        // Never active in release builds.
        if (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0) {
            WebView.setWebContentsDebuggingEnabled(true)
        }

        // Keep the screen on while the game is in front (toggleable in
        // settings), and go immersive.
        applyKeepScreenOn()
        hideSystemBars()

        setContentView(R.layout.activity_main)
        webView = findViewById(R.id.webView)
        errorPanel = findViewById(R.id.errorPanel)

        findViewById<Button>(R.id.retryButton).setOnClickListener {
            errorPanel.visibility = View.GONE
            webView.loadUrl(HOME_URL)
        }

        val settingsButton = findViewById<ImageView>(R.id.settingsButton)
        settingsButton.setOnClickListener {
            startActivity(Intent(this, SettingsActivity::class.java))
        }
        applySettingsAccess()
        // Keep the gear clear of the camera cutout / status area: pad it by the
        // safe insets the same way the page's own HUD does.
        ViewCompat.setOnApplyWindowInsetsListener(settingsButton) { v, insets ->
            val safe = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
            )
            val margin = (10 * resources.displayMetrics.density).toInt()
            (v.layoutParams as ViewGroup.MarginLayoutParams).apply {
                setMargins(safe.left + margin, safe.top + margin, margin, margin)
            }
            v.requestLayout()
            insets
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack()
                } else {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                }
            }
        })

        configureWebView()

        // Apply the saved orientation setting, then register the document-start
        // spoof BEFORE any loadUrl() call, so the very first frame of
        // yakkamon.com already sees a landscape viewport. When the lock is off,
        // no spoof is installed and the page receives real orientation values.
        orientationLockEnabled = AppPreferences.isOrientationLockEnabled(this)
        applyOrientationLock(orientationLockEnabled)
        if (orientationLockEnabled) {
            installOrientationOverride()
        }

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState)
        } else {
            webView.loadUrl(HOME_URL)
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView() {
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            // Let the game start audio/video without a tap (autoplay).
            mediaPlaybackRequiresUserGesture = false
            useWideViewPort = true
            loadWithOverviewMode = true
            setSupportZoom(false)
            builtInZoomControls = false
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            // The app only ever loads remote web content; keep local file access off.
            allowFileAccess = false
            allowContentAccess = false
        }

        webView.webViewClient = object : WebViewClient() {

            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                super.onPageStarted(view, url, favicon)
                errorPanel.visibility = View.GONE
                // Fallback injection: if the document-start API wasn't available
                // (very old WebView provider), inject as early as we can. The
                // script is idempotent, so this is harmless otherwise.
                if (spoofDesired && !documentStartInstalled) {
                    view?.evaluateJavascript(orientationScript, null)
                }
            }

            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val uri = request?.url ?: return false
                return handleUri(uri)
            }

            override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
                super.onReceivedError(view, request, error)
                if (request?.isForMainFrame == true) {
                    errorPanel.visibility = View.VISIBLE
                }
            }

            override fun onRenderProcessGone(view: WebView?, detail: RenderProcessGoneDetail?): Boolean {
                // The renderer crashed (rare). Rebuild this screen instead of the
                // whole app dying. Returning true is mandatory here.
                recreate()
                return true
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            private var customView: View? = null
            private var customViewCallback: CustomViewCallback? = null

            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                if (newProgress >= 100 && errorPanel.visibility == View.VISIBLE) {
                    // Loading finished cleanly after an earlier error.
                    errorPanel.visibility = View.GONE
                }
            }

            override fun onShowCustomView(view: View?, callback: CustomViewCallback?) {
                if (customView != null) {
                    callback?.onCustomViewHidden()
                    return
                }
                customView = view
                customViewCallback = callback
                (webView.parent as? FrameLayout)?.addView(
                    view,
                    FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                    )
                )
                webView.visibility = View.GONE
            }

            override fun onHideCustomView() {
                (webView.parent as? FrameLayout)?.removeView(customView)
                customView = null
                customViewCallback?.onCustomViewHidden()
                customViewCallback = null
                webView.visibility = View.VISIBLE
            }
        }
    }

    /**
     * Injects the landscape override into yakkamon.com frames before any of the
     * page's own JS runs. Falls back to evaluating the script in onPageStarted
     * when the WebView provider doesn't support document-start scripts.
     */
    private fun installOrientationOverride() {
        documentStartInstalled = false
        spoofDesired = true
        documentStartInstalled = try {
            if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
                WebViewCompat.addDocumentStartJavaScript(
                    webView,
                    orientationScript,
                    setOf("https://yakkamon.com", "https://*.yakkamon.com")
                )
                true
            } else {
                false
            }
        } catch (t: Throwable) {
            false
        }
    }

    /**
     * yakkamon.com stays in the app WebView. Everything else (support links,
     * external profiles, mailto:, etc.) opens in the user's default browser via
     * a Chrome Custom Tab, so the game WebView is never navigated away.
     */
    private fun handleUri(uri: Uri): Boolean {
        when (uri.scheme) {
            "http", "https" -> {
                if (isYakkamonHost(uri.host)) {
                    return false // let the WebView load it
                }
            }
            "mailto", "tel", "sms", "market" -> {
                // Handled by the system below.
            }
            else -> {
                return true // block everything else (javascript:, file:, intent:, ...)
            }
        }
        openExternally(uri)
        return true
    }

    private fun isYakkamonHost(host: String?): Boolean {
        if (host.isNullOrBlank()) return false
        val normalized = host.lowercase()
        return normalized == YAKKAMON_HOST || normalized.endsWith(".$YAKKAMON_HOST")
    }

    private fun openExternally(uri: Uri) {
        val customTab = CustomTabsHelper.build(this, uri)
        try {
            startActivity(customTab)
        } catch (e: ActivityNotFoundException) {
            try {
                startActivity(Intent(Intent.ACTION_VIEW, uri))
            } catch (e2: ActivityNotFoundException) {
                Toast.makeText(this, R.string.no_browser_found, Toast.LENGTH_SHORT).show()
            }
        }
    }

    /**
     * Orientation lock ON (default) -> lock the app to portrait. The injected
     * script still tells the site it is in landscape, which bypasses the game's
     * "rotate your phone to landscape" gate so it is playable in portrait.
     * Orientation lock OFF -> follow the device sensor; the page then receives
     * real orientation values (no spoof is installed).
     */
    private fun applyOrientationLock(enabled: Boolean) {
        requestedOrientation = if (enabled) {
            ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
        } else {
            ActivityInfo.SCREEN_ORIENTATION_FULL_SENSOR
        }
    }

    /** Immersive mode: full-screen game view, swipe from an edge to peek at system bars. */
    private fun hideSystemBars() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowInsetsControllerCompat(window, window.decorView).apply {
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemBars() // re-hide after dialogs, keyboard, etc.
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()

        // Coming back from the settings page: if the orientation lock changed,
        // rebuild so the spoof is installed (or removed) for the next load.
        val nowEnabled = AppPreferences.isOrientationLockEnabled(this)
        if (nowEnabled != orientationLockEnabled) {
            recreate()
        }

        // The "Settings access" toggle hides/shows the floating gear; settings
        // remain reachable from the device's App info page either way.
        applySettingsAccess()

        // "Reload game" (settings row / long-press shortcut): rebuild the
        // browser screen for a clean reload with the spoof freshly installed.
        if (AppPreferences.consumeReloadRequest(this)) {
            recreate()
        }
    }

    /** Applies the "Settings access" toggle to the floating gear button. */
    private fun applySettingsAccess() {
        findViewById<ImageView>(R.id.settingsButton).visibility =
            if (AppPreferences.isSettingsAccessHidden(this)) View.GONE else View.VISIBLE
    }

    /** Applies the "Keep screen on" toggle (default ON while playing). */
    private fun applyKeepScreenOn() {
        if (AppPreferences.isKeepScreenOn(this)) {
            window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        } else {
            window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        // Long-press "Reload" shortcut while the app is already running.
        if (intent.action == ACTION_RELOAD) {
            webView.reload()
        }
    }

    override fun onPause() {
        webView.onPause()
        super.onPause()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onDestroy() {
        webView.stopLoading()
        webView.destroy()
        super.onDestroy()
    }

    companion object {
        private const val HOME_URL = "https://yakkamon.com/play"
        private const val YAKKAMON_HOST = "yakkamon.com"
        private const val ORIENTATION_SCRIPT = "orientation-override.js"
        private const val ACTION_RELOAD = "com.yak.browser.action.RELOAD"
    }
}
