package com.ariilden.multitool

import android.content.Context

/**
 * Per-tool JSON snapshots published by the web app (e.g. running timers).
 * Home-screen widgets will read from here once they exist; for now this just
 * keeps the data flowing so widgets can be added without touching the web side.
 */
object WidgetStateStore {
    private const val PREFS = "multitool_widget_state"

    fun put(context: Context, toolId: String, json: String) {
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().putString(toolId, json).apply()
    }

    fun get(context: Context, toolId: String): String? =
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(toolId, null)
}
