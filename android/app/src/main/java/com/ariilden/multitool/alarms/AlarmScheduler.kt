package com.ariilden.multitool.alarms

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import com.ariilden.multitool.MainActivity

/**
 * Registers exact alarms with AlarmManager. `setAlarmClock` is the most
 * reliable option (survives Doze, shows the alarm icon in the status bar),
 * which is exactly what a 3-day timer needs. Falls back to an inexact alarm
 * only if the user has denied exact alarms on Android 12/12L.
 */
object AlarmScheduler {
    private const val TAG = "AlarmScheduler"
    const val EXTRA_ALARM_ID = "alarm_id"

    private fun firePendingIntent(context: Context, spec: AlarmSpec): PendingIntent {
        val intent = Intent(context, AlarmReceiver::class.java)
            .setAction("com.ariilden.multitool.ALARM_FIRE")
            .setData(android.net.Uri.parse("multitool://alarm/${spec.id}"))
            .putExtra(EXTRA_ALARM_ID, spec.id)
        return PendingIntent.getBroadcast(
            context, spec.requestCode, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    private fun showPendingIntent(context: Context, spec: AlarmSpec): PendingIntent {
        val intent = Intent(context, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .putExtra(MainActivity.EXTRA_ROUTE, spec.route ?: "#/")
        return PendingIntent.getActivity(
            context, spec.requestCode, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    fun schedule(context: Context, spec: AlarmSpec) {
        val am = context.getSystemService(AlarmManager::class.java)
        val fire = firePendingIntent(context, spec)
        val canExact = Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms()
        if (canExact) {
            am.setAlarmClock(AlarmManager.AlarmClockInfo(spec.at, showPendingIntent(context, spec)), fire)
        } else {
            Log.w(TAG, "Exact alarms not permitted; using inexact alarm for ${spec.id}")
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, spec.at, fire)
        }
        Log.d(TAG, "Scheduled ${spec.id} at ${spec.at} (exact=$canExact)")
    }

    fun cancel(context: Context, id: String) {
        val spec = AlarmStore.get(context, id) ?: AlarmSpec(id, 0, "", "", "", null, null, emptyList())
        val am = context.getSystemService(AlarmManager::class.java)
        am.cancel(firePendingIntent(context, spec))
    }

    /** Re-register everything that hasn't fired yet; fire anything we missed. */
    fun restoreAll(context: Context) {
        val now = System.currentTimeMillis()
        for (spec in AlarmStore.all(context)) {
            if (spec.fired) continue
            if (spec.at <= now) {
                Log.i(TAG, "Alarm ${spec.id} was missed; firing now")
                AlarmReceiver.fire(context, spec)
            } else {
                schedule(context, spec)
            }
        }
    }
}
