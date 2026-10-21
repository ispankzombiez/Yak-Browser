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
import android.webkit.CookieManager
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebStorage
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import com.google.android.play.core.review.ReviewManagerFactory

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

    /** Set when the always-on beta-guard document-start script is installed. */
    private var betaGuardInstalled = false

    /**
     * The exact portrait-state script last registered as document-start
     * (null = none). Compared by [installPortraitState] so the state is
     * re-registered only when the toggles actually change.
     */
    private var portraitStateRegistered: String? = null

    /**
     * True during the first load of a storage-purge install: that load may
     * still render from the (just-cleared) stale cache, so it is reloaded
     * once from the network, and its injected script also clears DOM storage.
     */
    private var purgeFirstLoad = false

    /**
     * True while an orientation lock is active: controls both the activity
     * orientation and whether the landscape spoof is injected at all. Captured
     * at onCreate and re-checked in onResume to detect settings changes.
     */
    private var orientationLockEnabled = true

    /** True when the spoof should be injected (lock on), regardless of method. */
    private var spoofDesired = false

    /** The currently showing What's New dialog, if any. */
    private var whatsNewDialog: AlertDialog? = null

    /** Cached copy of the orientation override script (injected per navigation as fallback). */
    private val orientationScript: String by lazy {
        assets.open(ORIENTATION_SCRIPT).bufferedReader(Charsets.UTF_8).use { it.readText() }
    }

    /**
     * Cached copy of the always-on beta guard: shims display-mode so the
     * site sees a regular browser tab (its own gate then decides who gets
     * the game). Caching after first run is left entirely to the site —
     * the guard never touches service workers or caches.
     */
    private val betaGuardScript: String by lazy {
        assets.open(BETA_GUARD_SCRIPT).bufferedReader(Charsets.UTF_8).use { it.readText() }
    }

    /**
     * Cached copy of the portrait popup readability fix: the site scales
     * its anchored info cards (the monster popup included) to 45% below
     * the md breakpoint -- every phone. This restores full scale and
     * bigger tap targets for the red buttons, portrait only.
     */
    private val portraitPopupScript: String by lazy {
        assets.open(PORTRAIT_POPUP_SCRIPT).bufferedReader(Charsets.UTF_8).use { it.readText() }
    }

    /**
     * Cached copy of the portrait bottom-bar sizing fix (see
     * assets/portrait-bottom-bar-fix.js): grows the bottom HUD items bar
     * ~18% for easier one-handed taps. Always-on and unconditional,
     * portrait only.
     */
    private val portraitBottomBarScript: String by lazy {
        assets.open(PORTRAIT_BOTTOM_BAR_SCRIPT).bufferedReader(Charsets.UTF_8).use { it.readText() }
    }

    /**
     * Cached copy of the optional clock-group move (see
     * assets/portrait-clock-fix.js): installs the dormant portrait-only
     * CSS; the app activates it by setting an attribute on <html>.
     */
    private val portraitClockScript: String by lazy {
        assets.open(PORTRAIT_CLOCK_SCRIPT).bufferedReader(Charsets.UTF_8).use { it.readText() }
    }

    /** Debug-only QA script (see assets/debug-camera-test.js); never shipped. */
    private val cameraTestScript: String by lazy {
        assets.open(CAMERA_TEST_SCRIPT).bufferedReader(Charsets.UTF_8).use { it.readText() }
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

        // Always-on site guard: must be registered before ANY load so the
        // first frame of yakkamon.com already answers display-mode like a
        // normal browser tab — otherwise the site replaces its public page
        // with the defunct game client, bypassing its own access gate.
        installBetaGuard()

        // Register the current toggle state as document-start too, so the
        // FIRST frame of yakkamon.com already carries the clock/bar
        // attributes — no wrong-position frame, no jump after load.
        installPortraitState()

        // One-time storage wipe (first run after this version): the alpha
        // test left a service worker + cache behind on testers' devices that
        // kept serving the old client from storage. Run it BEFORE the
        // orientation script is installed so the first load also carries the
        // DOM-storage clear.
        runStoragePurgeIfNeeded()

        // Apply the saved orientation setting, then register the document-start
        // spoof BEFORE any loadUrl() call, so the very first frame of
        // yakkamon.com already sees a landscape viewport. When the lock is off,
        // no spoof is installed and the page receives real orientation values.
        orientationLockEnabled = AppPreferences.isOrientationLockEnabled(this)
        applyOrientationLock(orientationLockEnabled)
        if (orientationLockEnabled) {
            installOrientationOverride()
        }

        // "Reload game" (settings row / long-press shortcut): consume the
        // flag HERE so this creation always lands on the game site (/play)
        // — even if the player had opened the sign-in page (yakkamon.com)
        // via the Login row. Saved state would resurrect that page, so a
        // pending reload skips the restore.
        val reloadPending = AppPreferences.consumeReloadRequest(this)

        if (savedInstanceState != null && !reloadPending) {
            webView.restoreState(savedInstanceState)
            // A pending purge wins over restored state: the probe load must run.
            if (purgeFirstLoad) webView.loadUrl(PURGE_PROBE_URL)
        } else {
            webView.loadUrl(if (purgeFirstLoad) PURGE_PROBE_URL else HOME_URL)

            // Fresh start: count the session, announce updates once, and
            // schedule the (Play-throttled) rating ask for after the game
            // has had time to load. A reload recreates with saved state, so
            // it never reaches this block (it isn't a new session).
            if (savedInstanceState == null) {
                val sessions = AppPreferences.incrementSessionCount(this)
                maybeShowWhatsNew()
                window.decorView.postDelayed({ maybeAskForReview(sessions) }, REVIEW_DELAY_MS)
            }
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
                // scripts are idempotent, so this is harmless otherwise.
                if (!betaGuardInstalled) {
                    view?.evaluateJavascript(betaGuardEffective(), null)
                }
                if (spoofDesired && !documentStartInstalled) {
                    view?.evaluateJavascript(effectiveScript(), null)
                }
                // Fresh document: (re-)apply the portrait toggle attributes
                // — a redundant same-value no-op when document-start state
                // is installed (it was already applied before the first
                // paint), the actual path on providers without it. The
                // script retries until <html> exists, so it can no longer
                // die silently mid-parse and strand the UI until onResume.
                applyPortraitState(view)
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                if (purgeFirstLoad) {
                    // The probe page (outside the stale service worker's
                    // scope) has loaded from the network: finish the purge
                    // in-page — unregister every service worker, delete every
                    // cache, wait for both to settle, then navigate to the
                    // home URL, which now comes straight from the network.
                    purgeFirstLoad = false
                    view?.evaluateJavascript(PURGE_FINALIZE, null)
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
     * Fresh-install-only storage wipe (policy clarified 2026-10-20):
     *
     * - FRESH INSTALL → wipe once, so the app can never start on a
     *   pre-filled cache that shows pages before the site would (backup
     *   restore is blocked separately via allowBackup=false): clears the
     *   HTTP cache, cookies and DOM storage natively, then loads
     *   robots.txt — a JS-free page where nothing can re-register a
     *   service worker — and finishes in-page by unregistering every
     *   service worker and deleting every cache before navigating to the
     *   real home URL.
     * - UPGRADE → never wipe. The player may already be signed in and
     *   hold beta access; their session and cache are theirs to keep.
     *   Access control belongs to the website (its own session +
     *   /auth/beta-access gate), not this app — the site blocks whoever
     *   it blocks; we just honor its caching either way.
     *
     * Guarded by a schema number so the policy is evaluated exactly once
     * per policy version (upgrades get marked without wiping).
     */
    private fun runStoragePurgeIfNeeded() {
        if (AppPreferences.storageSchema(this) == STORAGE_SCHEMA) return
        // Upgrade of an existing install: mark the policy as evaluated and
        // keep everything (session, cookies, cache).
        if (AppPreferences.hasPriorLaunchState(this)) {
            AppPreferences.setStorageSchema(this, STORAGE_SCHEMA)
            return
        }
        webView.clearCache(true)
        CookieManager.getInstance().removeAllCookies(null)
        CookieManager.getInstance().flush()
        WebStorage.getInstance().deleteAllData()
        purgeFirstLoad = true
        AppPreferences.setStorageSchema(this, STORAGE_SCHEMA)
    }

    /**
     * The always-on scripts actually injected: the beta guard, the
     * portrait popup fix, the dormant clock-group move, and — while a
     * purge's first load is pending — a DOM-storage clear (same origin
     * as the home URL, so it wipes the game's saved session too).
     */
    private fun betaGuardEffective(): String {
        val guard = if (purgeFirstLoad) {
            "$FIRST_RUN_WIPE\n$betaGuardScript"
        } else {
            betaGuardScript
        }
        return "$guard\n$portraitPopupScript\n$portraitBottomBarScript\n$portraitClockScript"
    }

    /**
     * The orientation script actually injected at document start (the
     * landscape spoof; the storage/display-mode concerns live in the
     * beta guard, which is installed for every launch).
     */
    private fun effectiveScript(): String = orientationScript

    /**
     * Registers the always-on beta guard as a document-start script for
     * yakkamon.com frames — runs before any of the page's own JS, on every
     * launch, with or without the orientation lock. Falls back to evaluating
     * it in onPageStarted when the provider doesn't support document-start
     * scripts.
     */
    private fun installBetaGuard() {
        betaGuardInstalled = try {
            if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
                WebViewCompat.addDocumentStartJavaScript(
                    webView,
                    betaGuardEffective(),
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
     * The portrait toggles as a self-applying script: sets or removes BOTH
     * opt-in attributes on <html>, synchronously when the document element
     * already exists (the document-start path — before the first paint) and
     * through an immediate retry loop otherwise (the onPageStarted fallback,
     * where the parser may not have created <html> yet — a bare eval there
     * used to throw silently and leave the UI in the wrong state until the
     * next onResume). The values are baked in from the prefs at build time.
     */
    private fun portraitStateScript(): String {
        val clock = AppPreferences.isClockTopLeft(this)
        val bar = AppPreferences.isEnlargeBottomBar(this)
        return (
            "(function f(){var d=document.documentElement;" +
                "if(!d){setTimeout(f,0);return;}" +
                "try{" +
                (if (clock) "d.setAttribute('data-yak-clock-tl','1');" else "d.removeAttribute('data-yak-clock-tl');") +
                (if (bar) "d.setAttribute('data-yak-bar-lg','1');" else "d.removeAttribute('data-yak-bar-lg');") +
                "}catch(e){}})();"
            )
    }

    /**
     * Registers [portraitStateScript] as document-start so every document
     * created AFTER registration loads with the attributes already applied —
     * the page simply renders in its final state, no flash or jump. Called
     * at startup and again from onResume whenever the toggles have changed
     * since the last registration (document-start scripts are registered as
     * a fixed string, so a change needs a fresh registration; the newer
     * script runs after the older ones, so the newest state wins). The
     * live flip on the CURRENT document is applyPortraitState().
     */
    private fun installPortraitState() {
        val script = portraitStateScript()
        if (script == portraitStateRegistered) return
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) return
        try {
            WebViewCompat.addDocumentStartJavaScript(
                webView,
                script,
                setOf("https://yakkamon.com", "https://*.yakkamon.com")
            )
            portraitStateRegistered = script
        } catch (t: Throwable) {
            // Stays null: retried on the next onResume; onPageStarted's
            // evaluateJavascript path still applies the state either way.
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
                    effectiveScript(),
                    setOf("https://yakkamon.com", "https://*.yakkamon.com")
                )
                if (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0) {
                    runCatching {
                        WebViewCompat.addDocumentStartJavaScript(
                            webView,
                            cameraTestScript,
                            setOf("https://yakkamon.com", "https://*.yakkamon.com")
                        )
                    }
                }
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

        // "Clock top-left" / "Enlarge bottom bar" toggles: re-register the
        // document-start state if the prefs changed (so future documents
        // load already-correct), then flip the attributes on the CURRENT
        // document live — no reloading the game.
        installPortraitState()
        applyPortraitState()

        // "Reload game" (settings row / long-press shortcut): rebuild the
        // screen; onCreate consumes the flag and lands on /play regardless
        // of what page is currently open.
        if (AppPreferences.isReloadRequested(this)) {
            recreate()
        }

        // "Login" (settings row): open the site's sign-in page here in the
        // app. The gate on /play shares this storage (same origin), so once
        // a session with beta access exists, the next launch boots the game
        // through the site's own alpha testing check. Checked AFTER the
        // reload request so a pending login survives a recreate() above.
        AppPreferences.consumeOpenUrlRequest(this)?.let { url ->
            if (url.startsWith("https://")) {
                errorPanel.visibility = View.GONE
                webView.loadUrl(url)
            }
        }
    }

    /** Applies the "Settings access" toggle to the floating gear button. */
    private fun applySettingsAccess() {
        findViewById<ImageView>(R.id.settingsButton).visibility =
            if (AppPreferences.isSettingsAccessHidden(this)) View.GONE else View.VISIBLE
    }

    /**
     * Applies BOTH portrait toggles to the current document by evaluating
     * [portraitStateScript]. Called from onPageStarted (fresh document —
     * a redundant same-value re-assert when document-start state is
     * installed, the actual path on providers without it) and from
     * onResume (the live flip when a toggle changed in Settings). The
     * script retries until <html> exists, so it can no longer die silently
     * mid-parse and strand the UI in the wrong state until the next resume.
     */
    private fun applyPortraitState(view: WebView? = webView) {
        view?.evaluateJavascript(portraitStateScript(), null)
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
        // Long-press "Reload" shortcut while the app is already running:
        // same path as the settings row — rebuild so the landing page is
        // always /play, never whatever page (e.g. the sign-in page) is open.
        if (intent.action == ACTION_RELOAD) {
            AppPreferences.requestReload(this)
            recreate()
        }
    }

    /**
     * After an update, shows a one-time "What's New" dialog listing everything
     * shipped since the version the user last saw. A fresh install just
     * records the version silently — nothing is "new" to someone just
     * arriving.
     */
    private fun maybeShowWhatsNew() {
        val current = runCatching {
            packageManager.getPackageInfo(packageName, 0).versionName
        }.getOrNull() ?: return
        val lastSeen = AppPreferences.lastSeenVersion(this)
        AppPreferences.setLastSeenVersion(this, current)
        val notes = WhatsNew.notesSince(lastSeen)
        if (notes.isEmpty()) return
        whatsNewDialog = AlertDialog.Builder(this)
            .setTitle("What's New in v$current")
            .setMessage(notes.joinToString("\n") { "•  $it" })
            .setPositiveButton(android.R.string.ok, null)
            .show()
    }

    /**
     * Asks for a Play rating on the 5th launch and every 10th after that.
     * Play throttles the actual dialog on its own; debug builds are skipped,
     * and non-Play installs fail silently (the task never succeeds).
     */
    private fun maybeAskForReview(sessions: Int) {
        if (isFinishing || isDestroyed) return
        if (whatsNewDialog?.isShowing == true) {
            // Don't stack the system review flow on top of our dialog.
            window.decorView.postDelayed({ maybeAskForReview(sessions) }, 5000L)
            return
        }
        if (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0) return
        if (sessions < REVIEW_FIRST_SESSION) return
        if ((sessions - REVIEW_FIRST_SESSION) % REVIEW_REPEAT_EVERY != 0) return
        try {
            val manager = ReviewManagerFactory.create(this)
            manager.requestReviewFlow().addOnCompleteListener { task ->
                if (task.isSuccessful && !isFinishing && !isDestroyed) {
                    manager.launchReviewFlow(this, task.result)
                }
            }
        } catch (t: Throwable) {
            // Play services / store missing — nothing to ask.
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
        private const val BETA_GUARD_SCRIPT = "beta-guard.js"
        private const val PORTRAIT_POPUP_SCRIPT = "portrait-popup-fix.js"
        private const val PORTRAIT_BOTTOM_BAR_SCRIPT = "portrait-bottom-bar-fix.js"
        private const val PORTRAIT_CLOCK_SCRIPT = "portrait-clock-fix.js"
        private const val CAMERA_TEST_SCRIPT = "debug-camera-test.js"
        private const val ACTION_RELOAD = "com.yak.browser.action.RELOAD"
        private const val REVIEW_FIRST_SESSION = 5
        private const val REVIEW_REPEAT_EVERY = 10
        private const val REVIEW_DELAY_MS = 8_000L

        /** Runs once during a purge's first load, before the page's own JS. */
        private const val FIRST_RUN_WIPE = "try { localStorage.clear(); sessionStorage.clear(); } catch (e) {}"

        /**
         * First load of a purge goes to robots.txt: same origin (so our
         * injected script and in-page eval apply), but a static text file —
         * it can execute no JS, so nothing (least of all the old alpha
         * client, which the site root still serves) can re-register a
         * service worker while the cleanup runs. The site ROOT is NOT safe
         * as a probe: it still serves the alpha shell.
         */
        private const val PURGE_PROBE_URL = "https://yakkamon.com/robots.txt"

        /**
         * Runs on the probe page to finish the purge deterministically:
         * unregister every service worker, delete every Cache Storage entry,
         * wait for both to settle, then navigate to the home URL — which now
         * (no registration left) comes straight from the network.
         */
        private const val PURGE_FINALIZE = """
            (function () {
              var go = function () { location.replace('https://yakkamon.com/play'); };
              var a = (navigator.serviceWorker && navigator.serviceWorker.getRegistrations)
                ? navigator.serviceWorker.getRegistrations().then(function (rs) {
                    return Promise.all(rs.map(function (r) { return r.unregister(); }));
                  }).catch(function () {})
                : Promise.resolve();
              var b = (window.caches && caches.keys)
                ? caches.keys().then(function (ks) {
                    return Promise.all(ks.map(function (k) { return caches.delete(k); }));
                  }).catch(function () {})
                : Promise.resolve();
              Promise.all([a, b]).then(go, go);
            })();
        """

        /**
         * Marks that the wipe policy has been evaluated (exactly once per
         * policy version). The wipe itself runs on FRESH INSTALLS ONLY —
         * upgrades are marked without wiping, keeping the player's session
         * and cache (access control belongs to the website).
         * 4: fresh-install wipe (HTTP cache + cookies + DOM storage via the
         *     robots.txt probe) + always-on display-mode guard.
         */
        private const val STORAGE_SCHEMA = 4
    }
}
