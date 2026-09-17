package com.ariilden.multitool.alarms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.ariilden.multitool.EventQueue
import com.ariilden.multitool.Notifications

/** Fires when a scheduled alarm goes off: notify the user and tell the web app. */
class AlarmReceiver : BroadcastReceiver() {
    companion object {
        private const val TAG = "AlarmReceiver"

        fun fire(context: Context, spec: AlarmSpec) {
            AlarmStore.put(context, spec.copy(fired = true))
            Notifications.showAlarm(context, spec)
            EventQueue.push(context, """{"type":"alarm-fired","id":${org.json.JSONObject.quote(spec.id)},"at":${spec.at}}""")
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getStringExtra(AlarmScheduler.EXTRA_ALARM_ID) ?: return
        val spec = AlarmStore.get(context, id)
        if (spec == null) {
            Log.w(TAG, "Alarm $id fired but is unknown (cancelled?)")
            return
        }
        fire(context, spec)
    }
}
