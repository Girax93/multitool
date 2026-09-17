package com.ariilden.multitool.alarms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.ariilden.multitool.EventQueue
import com.ariilden.multitool.Notifications
import org.json.JSONObject

/** Handles the Stop / Restart buttons on an alarm notification (and swipe-to-dismiss = stop). */
class ActionReceiver : BroadcastReceiver() {
    companion object {
        const val ACTION_STOP = "com.ariilden.multitool.ALARM_STOP"
        const val ACTION_RESTART = "com.ariilden.multitool.ALARM_RESTART"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getStringExtra(AlarmScheduler.EXTRA_ALARM_ID) ?: return
        Notifications.cancel(context, id)
        val spec = AlarmStore.get(context, id)
        when (intent.action) {
            ACTION_RESTART -> {
                val duration = spec?.durationMs
                if (spec != null && duration != null && duration > 0) {
                    val next = spec.copy(at = System.currentTimeMillis() + duration, fired = false)
                    AlarmStore.put(context, next)
                    AlarmScheduler.schedule(context, next)
                    EventQueue.push(context, """{"type":"alarm-restarted","id":${JSONObject.quote(id)},"at":${next.at}}""")
                } else {
                    AlarmStore.remove(context, id)
                    EventQueue.push(context, """{"type":"alarm-stopped","id":${JSONObject.quote(id)}}""")
                }
            }
            else -> {
                AlarmStore.remove(context, id)
                EventQueue.push(context, """{"type":"alarm-stopped","id":${JSONObject.quote(id)}}""")
            }
        }
    }
}
