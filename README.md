[🌐 Visit the Project Website](https://ispankzombiez.github.io/Yak-Browser/)

# YakBrowser

An unofficial Android app for [Yakkamon](https://yakkamon.com/) built with Kotlin and Android WebView. It offers **optional portrait play**, improved portrait layouts, and configurable game settings. By default, the app follows your phone's rotation; enable **Lock orientation** to play upright.

## 🚀 Features in the Current Source

- **Optional portrait mode**: Enable Lock orientation after a confirmation about possible layout issues; leave it off to follow your phone's sensor without orientation spoofing
- **Portrait-friendly layouts**: Improved menus, caught-Yakkamon popups, PvP "See all" lists, and battle framing that fits your team on screen
- **Top vs bottom battles**: An optional portrait layout places your team below the enemy team; changes apply during preparation or the next battle if combat has started
- **Tabbed settings**: Main contains display/game options; Notifications contains alert controls
- **Customizable portrait HUD**: Optional Clock top-left and Enlarge bottom bar settings
- **Independent Android bars**: Keep the status bar, navigation bar, both, or neither visible; both toggles default off, with swipe-to-reveal in fullscreen
- **Optional Keep screen on**: Prevent the screen from sleeping during play when enabled
- **Notification controls**: Arrival alerts, regular battle-challenge refresh reminders, Enable/Granted permission status, optional exact alarm timing, and a test notification
- **Smart link handling**: Yakkamon pages open in-app; any other link opens in your default browser
- **Settings access**: Use the corner gear, or the app icon's long-press Settings shortcut on Android 7.1+ with a supported launcher
- **Completely open-source and community maintained**

All Main switches default **off** on a fresh installation; previously saved choices are preserved. Notifications are controlled separately in the Notifications tab.

Before hiding the gear, confirm your device offers the Settings shortcut or an App info settings entry. The App info option depends on the device.

Open the game to learn arrival timers and open Battles to learn its next challenge refresh. Battle reminders are one-shot: open Battles again to schedule the next refresh. Farm-visitor reminders are tentative, and Android may delay alerts unless exact timing is enabled and permitted.

## 📱 Android Compatibility

- **Minimum Android version: Android 7.0 (API 24)**.
- Keep **Android System WebView** updated to the latest version available for your device.
- The game and some features depend on WebView capabilities. Older WebView versions may behave differently, and this latest build has not yet been verified on Android 7 hardware.

## 📱 Screenshots

*Screenshots coming soon*

## 🔗 Download

**Current source/build:** version **1.0.11**, Android **version code 13**.

🔗 Download the latest APK directly from GitHub Releases: **[Go to Latest Release Page](https://github.com/ispankzombiez/Yak-Browser/releases/latest)**

The APK is named <code>yakbrowser-v[version].apk</code> and is always available on the latest release page.

The published APK may lag behind the source features described above. Pushing source changes or building an AAB does not update the GitHub APK; a new APK must be published through the release workflow.

📲 Google Play release planned — watch the GitHub Releases page for announcements.

## 🛠️ Prerequisites

Before building the app, make sure you have:

- **Android Studio** (recommended) — or a JDK 17 + Android SDK setup
- **Android emulator** or physical device for testing

## 🏗️ Project Structure

```
├── app/                    # Android app source (Kotlin + WebView)
├── docs/                   # GitHub Pages website
├── .github/workflows/      # Automated release builds
└── NOTES.md                # Design notes and Play Store checklist
```

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/ispankzombiez/Yak-Browser.git
cd Yak-Browser
```

### 2. Configure Signing (for release builds)

Copy the signing template and add your credentials:

```bash
cp signing.properties.template signing.properties
```

Edit `signing.properties` with your keystore details:

```properties
RELEASE_STORE_FILE=path/to/your/keystore.jks
RELEASE_STORE_PASSWORD=your_store_password
RELEASE_KEY_ALIAS=your_key_alias
RELEASE_KEY_PASSWORD=your_key_password
```

### 3. Build and Run

```powershell
# Windows (from the repo root):
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
.\gradlew.bat assembleDebug        # -> app\build\outputs\apk\debug\app-debug.apk
.\gradlew.bat installDebug         # build + install on a connected device
```

Or open the project folder in **Android Studio** and press Run.

## 🔧 Releasing a New Version

1. Bump `versionCode` (integer, +1 every release) and `versionName` (display version) in `app/build.gradle.kts`.
2. Commit and push to `main`.
3. In GitHub, go to **Actions → Android Release Build → Run workflow**.
4. The workflow builds a signed APK and publishes:
   - A versioned release: `v[version]` with the APK `yakbrowser-v[version].apk`
   - An updated moving **`latest`** release with the newest APK

## 🛡️ Security

- Signing credentials are kept in `signing.properties` (not committed to git)
- The release keystore and its passwords live only on the maintainer's machine and in GitHub Actions secrets
- All release builds are signed with the same upload key (required for Google Play updates)

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## ⚠️ Disclaimer

This is an **unofficial** app and is not affiliated with, endorsed by, or connected to Yakkamon or its developers. Use at your own risk.

## 🐛 Issues & Support

If you encounter any issues:

1. Check the [Issues](https://github.com/ispankzombiez/Yak-Browser/issues) page
2. Create a new issue with detailed information
3. Include device info, Android version, and error logs

## 🙏 Acknowledgments

- [Yakkamon](https://yakkamon.com/) - The amazing game this app is built for
- [Android WebView](https://developer.android.com/develop/web-apps/webview) - The rendering engine that makes it possible
