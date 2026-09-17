package com.ariilden.multitool.alarms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.ariilden.multitool.Notifications

/** AlarmManager forgets everything on reboot; put it back (also after an app update). */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED -> {
                Notifications.ensureChannels(context)
                AlarmScheduler.restoreAll(context)
            }
        }
    }
}
