[🌐 Visit the Project Website](https://ispankzombiez.github.io/Yak-Browser/)

# YakBrowser

An unofficial Android app for [Yakkamon](https://yakkamon.com/) built with Kotlin and Android WebView. It exists for one main purpose: **letting you play Yakkamon in portrait mode** — the game normally refuses to run unless your phone is held sideways, and YakBrowser politely tells it otherwise so you can play holding your phone normally.

## 🚀 Features

- **Play in portrait**: The app locks to portrait and lets the game believe it's in landscape, so you can play Yakkamon holding your phone the normal way
- **Orientation lock toggle**: Prefer landscape? Turn the lock off in settings and the app follows your phone's sensor with zero spoofing
- **Fullscreen immersive**: System bars hidden, screen stays on — just you and the game
- **Smart link handling**: Yakkamon pages open in-app; any other link opens in your default browser
- **Settings overlay**: A small gear in the corner opens settings without leaving the game
- **Completely open-source and community maintained**

## 📱 Screenshots

*Screenshots coming soon*

## 🔗 Download

🔗 Download the latest APK directly from GitHub Releases: **[Go to Latest Release Page](https://github.com/ispankzombiez/Yak-Browser/releases/latest)**

The APK is named <code>yakbrowser-v[version].apk</code> and is always available on the latest release page.

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
