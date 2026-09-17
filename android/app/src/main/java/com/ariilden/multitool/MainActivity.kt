package com.ariilden.multitool

import android.Manifest
import android.annotation.SuppressLint
import android.app.AlarmManager
import android.app.NotificationManager
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.util.Log
import android.webkit.ConsoleMessage
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.addCallback
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import java.lang.ref.WeakReference

/**
 * The whole UI is the web app at [BuildConfig.APP_URL] inside a WebView. This
 * activity only adds what the web can't do itself: the JS bridge (see
 * [NativeBridge]), back-navigation, permission prompts and event delivery.
 */
class MainActivity : ComponentActivity() {

    companion object {
        private const val TAG = "MultiTool"
        const val EXTRA_ROUTE = "route"
        private const val REQ_NOTIFICATIONS = 1001

        /** The live activity, if any — used by receivers to push events to the page. */
        @Volatile
        private var current: WeakReference<MainActivity>? = null

        /** Tell the page that new events are waiting in the [EventQueue]. */
        fun notifyEventsAvailable() {
            current?.get()?.let { activity ->
                activity.runOnUiThread { activity.pokeWeb() }
            }
        }
    }

    lateinit var webView: WebView
        private set
    private var pageReady = false
    private var pendingRoute: String? = null
    private val appHost: String = Uri.parse(BuildConfig.APP_URL).host ?: ""

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        current = WeakReference(this)
        Notifications.ensureChannels(this)

        webView = WebView(this).apply {
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                databaseEnabled = true
                mediaPlaybackRequiresUserGesture = false
                mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                setSupportZoom(false)
                builtInZoomControls = false
                displayZoomControls = false
                cacheMode = WebSettings.LOAD_DEFAULT
                userAgentString = "$userAgentString MultiToolShell/${BuildConfig.VERSION_NAME}"
            }
            setBackgroundColor(ContextCompat.getColor(this@MainActivity, R.color.bg))
            addJavascriptInterface(NativeBridge(this@MainActivity), NativeBridge.JS_NAME)
            webViewClient = ShellWebViewClient()
            webChromeClient = object : WebChromeClient() {
                override fun onConsoleMessage(m: ConsoleMessage): Boolean {
                    Log.d(TAG, "[web] ${m.message()} (${m.sourceId()}:${m.lineNumber()})")
                    return true
                }
            }
        }
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        setContentView(webView)

        onBackPressedDispatcher.addCallback(this) {
            if (webView.canGoBack()) webView.goBack() else finish()
        }

        pendingRoute = intent?.getStringExtra(EXTRA_ROUTE)
        if (savedInstanceState != null) webView.restoreState(savedInstanceState) else loadApp()
        requestNotificationPermissionIfNeeded()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        intent.getStringExtra(EXTRA_ROUTE)?.let { navigateTo(it) }
    }

    override fun onResume() {
        super.onResume()
        current = WeakReference(this)
        webView.onResume()
        if (pageReady) pokeWeb()
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
        if (current?.get() === this) current = null
        webView.destroy()
        super.onDestroy()
    }

    fun loadApp() {
        pageReady = false
        webView.loadUrl(BuildConfig.APP_URL + (pendingRoute ?: ""))
        pendingRoute = null
    }

    fun navigateTo(route: String) {
        if (!pageReady) {
            pendingRoute = route
            return
        }
        val js = "location.hash = ${jsString(route)};"
        webView.evaluateJavascript(js, null)
    }

    /** Ask the page to drain the native event queue. Safe to call any time. */
    private fun pokeWeb() {
        if (!pageReady) return
        webView.evaluateJavascript(
            "if (window.__multitoolNativeEvent) { window.__multitoolNativeEvent(); }",
            null
        )
    }

    // ---- Permissions ---------------------------------------------------------

    private fun requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.POST_NOTIFICATIONS), REQ_NOTIFICATIONS)
        }
    }

    /** Walk the user through everything a reliable timer needs. Called from the web settings page. */
    fun requestAllPermissions() {
        requestNotificationPermissionIfNeeded()
        val alarms = getSystemService(AlarmManager::class.java)
        if (Build.VERSION.SDK_INT in 31..32 && !alarms.canScheduleExactAlarms()) {
            startActivity(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:$packageName")))
            return
        }
        val nm = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= 34 && !nm.canUseFullScreenIntent()) {
            startActivity(Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:$packageName")))
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        EventQueue.push(this, """{"type":"permissions-changed"}""")
        pokeWeb()
    }

    // ---- WebView client ------------------------------------------------------

    private inner class ShellWebViewClient : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val url = request.url
            val scheme = url.scheme ?: return false
            if (scheme == "file" || (scheme == "https" && url.host.equals(appHost, ignoreCase = true))) return false
            return try {
                startActivity(Intent(Intent.ACTION_VIEW, url).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                true
            } catch (e: Exception) {
                Log.w(TAG, "No handler for $url", e)
                true
            }
        }

        override fun onPageFinished(view: WebView, url: String) {
            if (url.startsWith("file:")) return
            pageReady = true
            pendingRoute?.let { route ->
                pendingRoute = null
                navigateTo(route)
            }
            pokeWeb()
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (!request.isForMainFrame) return
            // The service worker normally serves the app offline; this only shows
            // when the very first load (or a hard refresh) fails.
            Log.w(TAG, "Main frame error ${error.errorCode}: ${error.description}")
            pageReady = false
            view.loadUrl("file:///android_asset/offline.html")
        }
    }
}

/** JSON-string-literal escaping for evaluateJavascript. */
fun jsString(s: String): String {
    val sb = StringBuilder("\"")
    for (c in s) {
        when (c) {
            '"' -> sb.append("\\\"")
            '\\' -> sb.append("\\\\")
            '\n' -> sb.append("\\n")
            '\r' -> sb.append("\\r")
            ' ' -> sb.append("\\u2028")
            ' ' -> sb.append("\\u2029")
            else -> sb.append(c)
        }
    }
    return sb.append('"').toString()
}
