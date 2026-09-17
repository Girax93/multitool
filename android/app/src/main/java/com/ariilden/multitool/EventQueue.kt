package com.ariilden.multitool

import android.content.Context
import org.json.JSONArray

/**
 * Native → web events (alarm fired, notification action, …) are appended here
 * and drained by the page via the bridge. Persisted in SharedPreferences so an
 * event produced while the app was closed is delivered on the next launch.
 */
object EventQueue {
    private const val PREFS = "multitool_events"
    private const val KEY = "queue"
    private val lock = Any()

    fun push(context: Context, eventJson: String) {
        synchronized(lock) {
            val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            val arr = JSONArray(prefs.getString(KEY, "[]") ?: "[]")
            arr.put(org.json.JSONObject(eventJson))
            prefs.edit().putString(KEY, arr.toString()).commit()
        }
        MainActivity.notifyEventsAvailable()
    }

    fun drain(context: Context): String {
        synchronized(lock) {
            val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            val json = prefs.getString(KEY, "[]") ?: "[]"
            prefs.edit().remove(KEY).commit()
            return json
        }
    }
}
