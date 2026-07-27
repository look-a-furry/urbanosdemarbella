# Urbanos de Marbella — Android app

A thin native Android shell (Kotlin, zero external dependencies) around the
web app hosted at https://look-a-furry.github.io/urbanosdemarbella.

What the shell does beyond a plain browser view:

- Keeps navigation on `look-a-furry.github.io` inside the app; external links
  (Google Maps, avanzagrupo.com, OpenStreetMap attribution) open in the
  system browser / maps app.
- Bridges the browser geolocation API to Android runtime permissions so
  **Search Nearby Stops** works.
- Persists cookies (favorite stops) and localStorage (theme preference)
  across app restarts, including WebView state across rotation.
- Shows a square-theme offline page with a retry button when the site itself
  cannot be reached.

## Building

Open the `android/` folder in Android Studio, or from the command line:

```
cd android
./gradlew assembleDebug
```

The APK lands in `app/build/outputs/apk/debug/app-debug.apk`.

Every push touching `android/` also builds the debug APK on GitHub Actions
(see the **Android APK** workflow); download it from the run's artifacts.

Requirements: JDK 17+ and the Android SDK (Android Studio installs both).
`minSdk` is 24 (Android 7.0), `targetSdk`/`compileSdk` 35.
