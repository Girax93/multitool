package com.ariilden.multitool.alarms

import org.json.JSONArray
import org.json.JSONObject

/** One scheduled alarm, mirroring `AlarmRequest` in web/src/core/native.ts. */
data class AlarmSpec(
    val id: String,
    val at: Long,
    val title: String,
    val body: String,
    val toolId: String,
    val durationMs: Long?,
    val route: String?,
    val actions: List<String>,
    /** Set once the alarm has fired, so a reboot doesn't fire it again. */
    val fired: Boolean = false,
) {
    fun toJson(): JSONObject = JSONObject()
        .put("id", id)
        .put("at", at)
        .put("title", title)
        .put("body", body)
        .put("toolId", toolId)
        .put("durationMs", durationMs ?: JSONObject.NULL)
        .put("route", route ?: JSONObject.NULL)
        .put("actions", JSONArray(actions))
        .put("fired", fired)

    /** Stable int for PendingIntent request codes and notification ids. */
    val requestCode: Int get() = id.hashCode()

    companion object {
        fun fromJson(o: JSONObject): AlarmSpec {
            val actions = o.optJSONArray("actions")?.let { arr -> List(arr.length()) { arr.getString(it) } } ?: emptyList()
            return AlarmSpec(
                id = o.getString("id"),
                at = o.getLong("at"),
                title = o.optString("title", "Timer"),
                body = o.optString("body", ""),
                toolId = o.optString("toolId", ""),
                durationMs = if (o.has("durationMs") && !o.isNull("durationMs")) o.getLong("durationMs") else null,
                route = if (o.has("route") && !o.isNull("route")) o.getString("route") else null,
                actions = actions,
                fired = o.optBoolean("fired", false),
            )
        }
    }
}
