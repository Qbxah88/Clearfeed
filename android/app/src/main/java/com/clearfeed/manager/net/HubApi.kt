package com.clearfeed.manager.net

import android.content.Context
import com.clearfeed.manager.Prefs
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/**
 * Minimal client for the ClearFeed Cloudflare Worker hub.
 * Mirrors the endpoints used by the TV module and Chrome extension:
 * GET/PUT /settings, GET/DELETE /log, GET /devices, POST /block.
 */
class HubException(message: String) : Exception(message)

object HubApi {

    private fun base(ctx: Context): Pair<String, String> {
        val url = Prefs.hubUrl(ctx) ?: throw HubException("Not connected to a hub")
        val key = Prefs.hubKey(ctx) ?: throw HubException("Not connected to a hub")
        return url to key
    }

    private fun connect(fullUrl: String, method: String): HttpURLConnection {
        val conn = URL(fullUrl).openConnection() as HttpURLConnection
        conn.requestMethod = method
        conn.connectTimeout = 15000
        conn.readTimeout = 15000
        conn.setRequestProperty("content-type", "application/json")
        return conn
    }

    private fun readBody(conn: HttpURLConnection): String {
        val stream = if (conn.responseCode in 200..299) conn.inputStream else conn.errorStream
        if (stream == null) return ""
        val reader = BufferedReader(InputStreamReader(stream))
        val sb = StringBuilder()
        var line: String?
        while (true) {
            line = reader.readLine() ?: break
            sb.append(line)
        }
        reader.close()
        return sb.toString()
    }

    private suspend fun get(ctx: Context, path: String): JSONObject = withContext(Dispatchers.IO) {
        val (url, key) = base(ctx)
        val sep = if (path.contains("?")) "&" else "?"
        val conn = connect("$url$path${sep}k=${URLEncoder.encode(key, "UTF-8")}", "GET")
        try {
            val body = readBody(conn)
            if (conn.responseCode !in 200..299) {
                throw HubException(errorFrom(body, conn.responseCode))
            }
            if (body.isBlank()) JSONObject() else JSONObject(body)
        } finally {
            conn.disconnect()
        }
    }

    private suspend fun send(ctx: Context, path: String, method: String, payload: JSONObject): JSONObject =
        withContext(Dispatchers.IO) {
            val (url, key) = base(ctx)
            val conn = connect("$url$path?k=${URLEncoder.encode(key, "UTF-8")}", method)
            conn.doOutput = true
            val writer = OutputStreamWriter(conn.outputStream)
            writer.write(payload.toString())
            writer.flush()
            writer.close()
            try {
                val body = readBody(conn)
                if (conn.responseCode !in 200..299) {
                    throw HubException(errorFrom(body, conn.responseCode))
                }
                if (body.isBlank()) JSONObject() else JSONObject(body)
            } finally {
                conn.disconnect()
            }
        }

    private fun errorFrom(body: String, code: Int): String {
        return try {
            JSONObject(body).optString("error", "Hub returned $code")
        } catch (e: Exception) {
            "Hub returned $code"
        }
    }

    suspend fun health(ctx: Context): Boolean = try {
        get(ctx, "/health")
        true
    } catch (e: Exception) {
        false
    }

    suspend fun getSettings(ctx: Context): JSONObject = get(ctx, "/settings")

    suspend fun putSettings(ctx: Context, settings: JSONObject): JSONObject =
        send(ctx, "/settings", "PUT", settings)

    suspend fun getLog(ctx: Context, limit: Int = 200): JSONArray {
        val obj = get(ctx, "/log?limit=$limit")
        return obj.optJSONArray("log") ?: obj.optJSONArray("entries") ?: JSONArray()
    }

    suspend fun getDevices(ctx: Context): JSONArray {
        val obj = get(ctx, "/devices")
        return obj.optJSONArray("devices") ?: JSONArray()
    }

    suspend fun block(
        ctx: Context,
        creators: List<String> = emptyList(),
        videos: List<String> = emptyList(),
        removeCreators: List<String> = emptyList(),
        removeVideos: List<String> = emptyList()
    ): JSONObject {
        val payload = JSONObject()
        payload.put("device", Prefs.deviceName(ctx))
        if (creators.isNotEmpty()) payload.put("creators", JSONArray(creators))
        if (videos.isNotEmpty()) payload.put("videos", JSONArray(videos))
        if (removeCreators.isNotEmpty()) payload.put("removeCreators", JSONArray(removeCreators))
        if (removeVideos.isNotEmpty()) payload.put("removeVideos", JSONArray(removeVideos))
        return send(ctx, "/block", "POST", payload)
    }
}
