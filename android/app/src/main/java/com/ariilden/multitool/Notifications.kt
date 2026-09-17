package com.ariilden.multitool

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.ariilden.multitool.alarms.ActionReceiver
import com.ariilden.multitool.alarms.AlarmScheduler
import com.ariilden.multitool.alarms.AlarmSpec

object Notifications {
    private const val TAG = "Notifications"
    const val CHANNEL_TIMERS = "timers"
    const val CHANNEL_GENERAL = "general"

    fun ensureChannels(context: Context) {
        val nm = context.getSystemService(NotificationManager::class.java)
        if (nm.getNotificationChannel(CHANNEL_TIMERS) == null) {
            val timers = NotificationChannel(
                CHANNEL_TIMERS, context.getString(R.string.channel_timers), NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = context.getString(R.string.channel_timers_desc)
                setSound(
                    RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM),
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                )
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 400, 200, 400, 200, 600)
                enableLights(true)
                setBypassDnd(false)
            }
            nm.createNotificationChannel(timers)
        }
        if (nm.getNotificationChannel(CHANNEL_GENERAL) == null) {
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL_GENERAL, context.getString(R.string.channel_general), NotificationManager.IMPORTANCE_DEFAULT)
            )
        }
    }

    private fun openAppIntent(context: Context, route: String?, requestCode: Int): PendingIntent {
        val intent = Intent(context, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .putExtra(MainActivity.EXTRA_ROUTE, route ?: "#/")
        return PendingIntent.getActivity(
            context, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    private fun actionIntent(context: Context, action: String, id: String, requestCode: Int): PendingIntent {
        val intent = Intent(context, ActionReceiver::class.java)
            .setAction(action)
            .setData(android.net.Uri.parse("multitool://action/$id/$action"))
            .putExtra(AlarmScheduler.EXTRA_ALARM_ID, id)
        return PendingIntent.getBroadcast(
            context, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    /** The "timer finished" notification: alarm sound, heads-up, Stop/Restart, full-screen when locked. */
    fun showAlarm(context: Context, spec: AlarmSpec) {
        ensureChannels(context)
        val rc = spec.requestCode
        val tap = openAppIntent(context, spec.route, rc)
        val builder = NotificationCompat.Builder(context, CHANNEL_TIMERS)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(spec.title)
            .setContentText(spec.body.ifBlank { context.getString(R.string.timer_finished) })
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(false)
            .setOnlyAlertOnce(false)
            .setWhen(spec.at)
            .setShowWhen(true)
            .setContentIntent(tap)
            .setFullScreenIntent(tap, true)
            .setDeleteIntent(actionIntent(context, ActionReceiver.ACTION_STOP, spec.id, rc))
        if ("stop" in spec.actions) {
            builder.addAction(0, context.getString(R.string.action_stop), actionIntent(context, ActionReceiver.ACTION_STOP, spec.id, rc + 1))
        }
        if ("restart" in spec.actions && spec.durationMs != null) {
            builder.addAction(0, context.getString(R.string.action_restart), actionIntent(context, ActionReceiver.ACTION_RESTART, spec.id, rc + 2))
        }
        post(context, spec.id, builder.build())
    }

    fun showGeneral(context: Context, id: String, title: String, body: String, route: String?, ongoing: Boolean) {
        ensureChannels(context)
        val rc = id.hashCode()
        val n = NotificationCompat.Builder(context, CHANNEL_GENERAL)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setOngoing(ongoing)
            .setAutoCancel(!ongoing)
            .setContentIntent(openAppIntent(context, route, rc))
            .build()
        post(context, id, n)
    }

    fun cancel(context: Context, id: String) {
        NotificationManagerCompat.from(context).cancel(id.hashCode())
    }

    private fun post(context: Context, id: String, notification: android.app.Notification) {
        try {
            NotificationManagerCompat.from(context).notify(id.hashCode(), notification)
        } catch (e: SecurityException) {
            Log.w(TAG, "POST_NOTIFICATIONS not granted", e)
        }
    }
}
