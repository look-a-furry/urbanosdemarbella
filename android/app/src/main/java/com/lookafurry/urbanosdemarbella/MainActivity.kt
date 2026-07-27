package com.lookafurry.urbanosdemarbella

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.webkit.CookieManager
import android.webkit.GeolocationPermissions
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient

/**
 * Thin native shell around the Urbanos de Marbella web app hosted on
 * GitHub Pages. Keeps navigation inside the app for the site itself,
 * hands external links (Google Maps, the bus company, ...) to the system,
 * and bridges the browser geolocation API to Android runtime permissions
 * so "Search Nearby Stops" works.
 */
class MainActivity : Activity() {

    companion object {
        private const val APP_HOST = "look-a-furry.github.io"
        private const val START_URL = "https://$APP_HOST/urbanosdemarbella"
        private const val LOCATION_PERMISSION_REQUEST = 1
    }

    private lateinit var webView: WebView

    // Pending geolocation request from the WebView while we ask the user
    private var pendingGeoOrigin: String? = null
    private var pendingGeoCallback: GeolocationPermissions.Callback? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        webView = WebView(this)
        setContentView(webView)

        with(webView.settings) {
            javaScriptEnabled = true          // the whole app is jQuery-driven
            domStorageEnabled = true          // theme preference uses localStorage
            setGeolocationEnabled(true)       // "Search Nearby Stops"
        }

        // Favorites are stored in cookies; make sure they stick around
        CookieManager.getInstance().setAcceptCookie(true)

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest
            ): Boolean {
                val url = request.url
                // Site pages (and CDN assets in the main frame, which never
                // happens in practice) stay inside the app; anything else -
                // Google Maps, avanzagrupo.com, OpenStreetMap attribution -
                // goes to the system browser/maps app.
                if (url.host == APP_HOST) {
                    return false
                }
                return try {
                    startActivity(Intent(Intent.ACTION_VIEW, url))
                    true
                } catch (e: Exception) {
                    // No app can handle it; let the WebView try
                    false
                }
            }

            override fun onReceivedError(
                view: WebView,
                request: WebResourceRequest,
                error: WebResourceError
            ) {
                // Only react to failures of the page itself, not of a single
                // image or of the (frequently failing) bus API calls
                if (request.isForMainFrame) {
                    showOfflinePage()
                }
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onGeolocationPermissionsShowPrompt(
                origin: String,
                callback: GeolocationPermissions.Callback
            ) {
                if (hasLocationPermission()) {
                    callback.invoke(origin, true, false)
                } else {
                    pendingGeoOrigin = origin
                    pendingGeoCallback = callback
                    requestPermissions(
                        arrayOf(
                            Manifest.permission.ACCESS_FINE_LOCATION,
                            Manifest.permission.ACCESS_COARSE_LOCATION
                        ),
                        LOCATION_PERMISSION_REQUEST
                    )
                }
            }
        }

        if (savedInstanceState == null) {
            webView.loadUrl(START_URL)
        } else {
            webView.restoreState(savedInstanceState)
        }
    }

    private fun hasLocationPermission(): Boolean {
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED ||
            checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        if (requestCode == LOCATION_PERMISSION_REQUEST) {
            val granted = grantResults.any { it == PackageManager.PERMISSION_GRANTED }
            pendingGeoCallback?.invoke(pendingGeoOrigin, granted, false)
            pendingGeoOrigin = null
            pendingGeoCallback = null
        } else {
            super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        }
    }

    /**
     * Minimal error page in the app's design language, shown when the site
     * itself cannot be reached (no connection, GitHub Pages down).
     */
    private fun showOfflinePage() {
        val html = """
            <!DOCTYPE html>
            <html>
            <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body { font-family: sans-serif; background: #f1efe9; color: #16150f;
                       display: flex; flex-direction: column; align-items: center;
                       justify-content: center; min-height: 90vh; margin: 0; padding: 20px; }
                h1 { background: #16150f; color: #f1efe9; padding: 14px 20px;
                     border-bottom: 6px solid #d81f26; text-transform: uppercase;
                     letter-spacing: .06em; font-size: 1.2em; }
                p { color: #6b665c; text-align: center; }
                a { display: inline-block; padding: 12px 20px; background: #d81f26;
                    color: #fff; border: 2px solid #16150f; box-shadow: 3px 3px 0 #16150f;
                    text-decoration: none; text-transform: uppercase; font-weight: 700;
                    letter-spacing: .08em; font-size: .8em; }
            </style>
            </head>
            <body>
                <h1>No connection</h1>
                <p>Could not reach the bus arrival service.<br>Check your connection and try again.</p>
                <a href="$START_URL">Retry</a>
            </body>
            </html>
        """.trimIndent()
        webView.loadDataWithBaseURL(START_URL, html, "text/html", "utf-8", null)
    }

    @Deprecated("Deprecated in Android 13, still the simplest correct behavior here")
    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            @Suppress("DEPRECATION")
            super.onBackPressed()
        }
    }

    override fun onPause() {
        super.onPause()
        // Persist favorite-stop cookies
        CookieManager.getInstance().flush()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }
}
