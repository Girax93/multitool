package com.ariilden.multitool.alarms

import android.content.Context
import org.json.JSONObject

/** Persists scheduled alarms so they can be re-registered after a reboot or app update. */
object AlarmStore {
    private const val PREFS = "multitool_alarms"
    private val lock = Any()

    private fun prefs(context: Context) =
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun put(context: Context, spec: AlarmSpec) {
        synchronized(lock) { prefs(context).edit().putString(spec.id, spec.toJson().toString()).commit() }
    }

    fun get(context: Context, id: String): AlarmSpec? = synchronized(lock) {
        prefs(context).getString(id, null)?.let { runCatching { AlarmSpec.fromJson(JSONObject(it)) }.getOrNull() }
    }

    fun remove(context: Context, id: String) {
        synchronized(lock) { prefs(context).edit().remove(id).commit() }
    }

    fun all(context: Context): List<AlarmSpec> = synchronized(lock) {
        prefs(context).all.values.mapNotNull { v ->
            (v as? String)?.let { runCatching { AlarmSpec.fromJson(JSONObject(it)) }.getOrNull() }
        }
    }
}
