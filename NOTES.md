# YakBrowser — Project Notes

App: **YakBrowser** (`com.yak.browser`) — a focused browser whose only in-app page
is <https://yakkamon.com/play>.

## How the app works

| Concern | Implementation |
|---|---|
| Game page | `MainActivity` hosts a single fullscreen `WebView` loading `https://yakkamon.com/play`. |
| Navigation policy | `yakkamon.com` and all subdomains load inside the app. Any other link opens in the user's default browser via a **Chrome Custom Tab**, so the game WebView never navigates away. Other schemes (`javascript:`, `file:`, `intent:`) are blocked. |
| Landscape enforcement | Two layers, active while the **orientation lock** setting is ON (default): (1) the activity is locked to **portrait** (`screenOrientation="portrait"`), so the game is played holding the phone normally; (2) `assets/orientation-override.js` is injected **at document start** (via `WebViewCompat.addDocumentStartJavaScript`) and tells the site `window.orientation`, `screen.orientation.type/.angle/.lock()` and `matchMedia('(orientation: …)')` that the device is in **landscape** — the game only runs when it believes it's landscape, so this white lie lets it play in portrait. |
| Immersive fullscreen | System bars hidden with swipe-from-edge reveal; screen kept on (`FLAG_KEEP_SCREEN_ON`). |
| Settings page | Gear overlay (**top-left corner**, kept clear of the game's currency chips and the camera cutout) opens `SettingsActivity` (AndroidX Preference). Single switch: **Lock orientation** (key `orientation_lock`, default ON). ON = app locked to portrait + landscape spoof to the site (play in portrait); OFF = app follows the device sensor and the spoof is not installed. Changing it rebuilds the browser screen on return. |
| Robustness | Error panel with Retry on main-frame load failures; WebView renderer crashes handled via `onRenderProcessGone`; DOM storage + autoplay audio enabled for the game. |

Verified facts about the origin-matching rules used for the injection
(from the androidx.webkit reference): `https://yakkamon.com` matches only the
apex host, `https://*.yakkamon.com` matches subdomains — both are registered.

## Portrait UI overlap — diagnosis (measured via chrome://inspect over adb)

Debug builds enable `WebView.setWebContentsDebuggingEnabled(true)` (gated on
`FLAG_DEBUGGABLE`, never active in release), so the live DOM can be inspected
with Chrome DevTools / raw CDP (`adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>`).
Measured on the real page at 384×832 CSS px:

| What looks overlapped | What it actually is | Handling |
|---|---|---|
| Clock timers half off the right edge, dark pills clipped at the bottom-left, the "SAFARI ZONE" sign behind the left rail | **Canvas-drawn game-world content** (`elementsFromPoint` returns the `<canvas>`) — world-space objects at the edge of the visible map slice. Identical behaviour in normal landscape play. | Inherent to the game; nothing to adjust from the app. |
| Right-side plant/chat/settings buttons + moon timer pill sitting on the item bar | **Genuine portrait-only DOM collision**: bar is `left-1/2`-centred (248 px) while the right cluster is `right-3`-anchored (148 px) — 396 px of widgets in a 384 px viewport. The timer pill is the *left-most piece of the right cluster* (anchored right), so nudging the bar alone never moved it. | Fixed in `orientation-override.js` (portrait only): bar pushed fully left (`margin-left: -64px` → left edge x=4, flush with the nav rail, per user request) **and** the right cluster zoomed to 0.78 → ~5-8 px gap between the timer and the bar. |
| `99+` count badges touching the moon `04:35` timer | The game's own bar layout — identical Tailwind base classes in landscape (the `lg:`/`xl:` variants never trigger at either width). | Their design; left untouched. |
| Our settings gear over the currency chips (and near the camera cutout) | Our overlay, anchored `top|end` under the chips. | Moved to `top|start` + inset-aware margins (padded by systemBars/cutout like the game's own HUD). |

Note: CDP `Emulation.setDeviceMetricsOverride` is ignored by this WebView
build, so landscape-baseline comparisons must be done by reasoning about the
anchoring classes (or physically rotating with the lock OFF).

## TODO — Push notifications (phase 2)

> The API at <https://api.yakkamon.com/> has no real data yet, so this whole
> section is parked. Revisit when the site owners publish the API contract.

Planned design (nothing implemented yet):

1. **Transport**: Firebase Cloud Messaging (FCM). The app registers a token and
   sends it to the Yakkamon API (`POST /devices` or similar — TBD).
2. **Delivery**: If the site can push to FCM directly → data messages handled by
   `FirebaseMessagingService`. If not → fallback to WorkManager polling the API
   every N minutes and posting local notifications.
3. **Permission**: Android 13+ requires the runtime `POST_NOTIFICATIONS` consent
   — request it on first launch only after a user action (Play policy).
4. **Click routing**: notification payload should deep-link to
   `https://yakkamon.com/play` (or a specific in-game path) via an intent-filter
   on `MainActivity`.
5. **Dependencies to add later**: `com.google.firebase:firebase-messaging`,
   Google Services Gradle plugin, `google-services.json`.

Questions to ask the Yakkamon team when the API is ready:

- [ ] Auth model: how does the app identify a user/device (account, device token, session cookie)?
- [ ] Endpoints: registration, notification feed, unread counts.
- [ ] Push transport: server-side FCM, or polling-only REST?
- [ ] Rate limits and payload schema for notifications.
- [ ] Is there a websocket/live-update option on the play page instead of native push?

## TODO — Google Play Store checklist

- [x] **Signing**: release signing wired via `signing.properties` (gitignored,
      template committed as `signing.properties.template`). Upload keystore:
      `C:\Users\caleb\Documents\keystores\yakbrowser-release.jks`
      (alias `yakbrowser`; base64 copy for CI secrets:
      `C:\Users\caleb\Documents\keystores\RELEASE_KEYSTORE.base64.txt`).
      **Never** commit either file — both are outside the repo / gitignored.
- [ ] **App identity**: package `com.yak.browser` is **immutable** once published.
- [ ] **Target API**: `targetSdk = 36` (meets current Play requirements).
- [x] **Store listing assets — icon + feature graphic**: generated from the
      owl Yakkamon pixel art into `play-store/`:
      - `play-store/icon-512.png` (512×512 icon)
      - `play-store/feature-graphic-1024x500.png` (1024×500 feature graphic)
      Source art: `C:\Users\caleb\Documents\Yakkamon Fan art\pngs\owl.png`
      (generator script: `%TEMP%\opencode\yak\make-play-assets.ps1`).
- [x] **In-app launcher icon**: also the owl now — adaptive icon with
      `drawable-nodpi/ic_launcher_foreground.png` (432×432 canvas), a purple
      gradient `drawable/ic_launcher_background.xml`, and a `monochrome`
      layer for Android 13 themed icons.
- [ ] **Screenshots + store descriptions**: still TODO (see below).
- [ ] **Privacy policy URL** (required — the app has internet access; also needed
      for the Data Safety form).
- [ ] **Data Safety form**: declare that no data is collected/shared for now
      (update when FCM lands — FCM collects device/usage data on Google's behalf).
- [ ] **Content rating questionnaire** (game-adjacent browser app).
- [ ] **Closed testing**: new personal accounts need 12 testers opted in for
      14 days before production access (current Play policy).
- [ ] **Do**: verify the app works with the site's ToS — if Yakkamon has terms
      about third-party clients, get a nod from the site owners. Also confirm
      WebView-based apps with you are fine under Play's "browser" category
      policies (ours does not wrap other apps or obscure its browsing nature).

## Distribution — GitHub + Google Play (mirrors the SFL-Browser setup)

| Piece | Where |
|---|---|
| Repo | <https://github.com/ispankzombiez/Yak-Browser> (public, `main` branch) |
| Website (GitHub Pages) | `docs/index.html`, served from **main /docs** → <https://ispankzombiez.github.io/Yak-Browser/> (also hosts the privacy policy URL for Play) |
| Release CI | `.github/workflows/android-release.yml` — manual trigger (`workflow_dispatch`); JDK 17; decodes keystore from secrets; builds `assembleRelease`; renames APK to `yakbrowser-v[version].apk`; publishes GitHub release `v[version]` **and** updates the moving `latest` release |
| Versioning | Bump `versionCode` (+1 per release) and `versionName` in `app/build.gradle.kts`; the workflow greps `versionName` for the tag + APK filename |
| CI secrets (Settings → Secrets → Actions) | `RELEASE_KEYSTORE` (base64 of the .jks — copy from `C:\Users\caleb\Documents\keystores\RELEASE_KEYSTORE.base64.txt`), `KEYSTORE_PASSWORD`, `KEY_ALIAS` (= `yakbrowser`), `KEY_PASSWORD` |
| Play upload | Build locally: `.\gradlew.bat bundleRelease` → `app\build\outputs\bundle\release\app-release.aab` (signed with the same upload key). Rename to `yakbrowser-v[version].aab` and upload in the Play Console. AAB = "Android App Bundle" (not OBB). |

Release checklist per version: bump versions → push → run the workflow →
download the APK from the `latest` release → build + upload the AAB to Play.

**Status (2026-10-19): v1.0.2 shipped.** ✅ 4 Actions secrets set; `v1.0.0`
released (v1.0.0's versionCode 1 was already taken on Play, so version codes
kept climbing per app — v1.0.1 = 2, v1.0.2 = 3). v1.0.2 fixes the wide game
windows (Workshop/Shop/Squad/Quests) in portrait: section 5 of
`orientation-override.js` reveals the game's `sm:`-hidden detail column and
fits each modal via design-width + transform. Signing cert SHA-256
`84bb69a7…d9ed4` = the local upload key everywhere. Pages live. Remaining:
the Play Console submission itself (AAB + store listing + screenshots).

## Build / run

```powershell
# From the repo root (Windows):
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
.\gradlew.bat assembleDebug        # -> app\build\outputs\apk\debug\app-debug.apk
.\gradlew.bat assembleRelease      # signed via signing.properties (if present)
.\gradlew.bat bundleRelease        # -> app\build\outputs\bundle\release\app-release.aab (Play upload)
```

Or open the project folder in **Android Studio** and press Run. Note: Android
Studio ships its own Gradle/JDK, so no extra install is needed there.
