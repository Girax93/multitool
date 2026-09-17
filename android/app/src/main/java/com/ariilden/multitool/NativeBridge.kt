package com.ariilden.multitool

import android.app.AlarmManager
import android.app.NotificationManager
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import android.webkit.JavascriptInterface
import androidx.core.app.NotificationManagerCompat
import com.ariilden.multitool.alarms.AlarmScheduler
import com.ariilden.multitool.alarms.AlarmSpec
import com.ariilden.multitool.alarms.AlarmStore
import com.ariilden.multitool.update.ApkInstaller
import org.json.JSONObject

/**
 * Exposed to the page as `window.MultiToolAndroid`. Every method is called on a
 * WebView background thread, so anything touching UI hops to the main thread.
 * The TypeScript side of this contract lives in web/src/core/native.ts.
 */
class NativeBridge(private val activity: MainActivity) {

    companion object {
        const val JS_NAME = "MultiToolAndroid"
        private const val TAG = "NativeBridge"
    }

    @JavascriptInterface
    fun getInfo(): String {
        val ctx = activity.applicationContext
        val alarms = ctx.getSystemService(AlarmManager::class.java)
        val nm = ctx.getSystemService(NotificationManager::class.java)
        val info = JSONObject()
            .put("platform", "android")
            .put("shellVersion", BuildConfig.VERSION_NAME)
            .put("shellVersionCode", BuildConfig.VERSION_CODE)
            .put("sdkInt", Build.VERSION.SDK_INT)
            .put("packageName", ctx.packageName)
            .put("appUrl", BuildConfig.APP_URL)
            .put("notificationsGranted", NotificationManagerCompat.from(ctx).areNotificationsEnabled())
            .put("canScheduleExactAlarms", Build.VERSION.SDK_INT < 31 || alarms.canScheduleExactAlarms())
            .put("canUseFullScreenIntent", Build.VERSION.SDK_INT < 34 || nm.canUseFullScreenIntent())
            .put("canInstallPackages", ctx.packageManager.canRequestPackageInstalls())
        return info.toString()
    }

    @JavascriptInterface
    fun scheduleAlarm(json: String): String = try {
        val spec = AlarmSpec.fromJson(JSONObject(json))
        AlarmStore.put(activity, spec)
        AlarmScheduler.schedule(activity, spec)
        "ok"
    } catch (e: Exception) {
        Log.e(TAG, "scheduleAlarm failed", e)
        "error: ${e.message}"
    }

    @JavascriptInterface
    fun cancelAlarm(id: String) {
        AlarmScheduler.cancel(activity, id)
        AlarmStore.remove(activity, id)
    }

    @JavascriptInterface
    fun notify(json: String) {
        try {
            val o = JSONObject(json)
            Notifications.showGeneral(
                activity,
                id = o.getString("id"),
                title = o.optString("title", "MultiTool"),
                body = o.optString("body", ""),
                route = if (o.has("route")) o.getString("route") else null,
                ongoing = o.optBoolean("ongoing", false)
            )
        } catch (e: Exception) {
            Log.e(TAG, "notify failed", e)
        }
    }

    @JavascriptInterface
    fun cancelNotification(id: String) {
        Notifications.cancel(activity, id)
    }

    @JavascriptInterface
    fun requestPermissions() {
        activity.runOnUiThread { activity.requestAllPermissions() }
    }

    @JavascriptInterface
    fun openUrl(url: String) {
        activity.runOnUiThread {
            try {
                activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            } catch (e: Exception) {
                Log.w(TAG, "openUrl failed", e)
            }
        }
    }

    @JavascriptInterface
    fun vibrate(patternCsv: String) {
        val pattern = patternCsv.split(',').mapNotNull { it.trim().toLongOrNull() }
        if (pattern.isEmpty()) return
        val vibrator: Vibrator = if (Build.VERSION.SDK_INT >= 31) {
            activity.getSystemService(VibratorManager::class.java).defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            activity.getSystemService(Vibrator::class.java)
        }
        // Web pattern is [vibrate, pause, vibrate, …]; Android wants a leading delay.
        vibrator.vibrate(VibrationEffect.createWaveform(longArrayOf(0L) + pattern, -1))
    }

    @JavascriptInterface
    fun publishWidgetState(toolId: String, json: String) {
        WidgetStateStore.put(activity, toolId, json)
    }

    @JavascriptInterface
    fun installUpdate(url: String) {
        activity.runOnUiThread { ApkInstaller.downloadAndInstall(activity, url) }
    }

    @JavascriptInterface
    fun reload() {
        activity.runOnUiThread { activity.loadApp() }
    }

    /** Returns and clears the queued native→web events as a JSON array. */
    @JavascriptInterface
    fun drainEvents(): String = EventQueue.drain(activity)
}
