package com.clearfeed.manager

import android.content.Context
import android.content.SharedPreferences

/** Thin wrapper around SharedPreferences for the hub connection details. */
object Prefs {
    private const val FILE = "clearfeed_prefs"
    private const val KEY_URL = "hub_url"
    private const val KEY_KEY = "hub_key"
    private const val KEY_DEVICE = "device_name"

    private fun sp(ctx: Context): SharedPreferences =
        ctx.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    fun isConfigured(ctx: Context): Boolean =
        !hubUrl(ctx).isNullOrBlank() && !hubKey(ctx).isNullOrBlank()

    fun hubUrl(ctx: Context): String? = sp(ctx).getString(KEY_URL, null)
    fun hubKey(ctx: Context): String? = sp(ctx).getString(KEY_KEY, null)
    fun deviceName(ctx: Context): String = sp(ctx).getString(KEY_DEVICE, "Phone") ?: "Phone"

    fun save(ctx: Context, url: String, key: String, deviceName: String) {
        sp(ctx).edit()
            .putString(KEY_URL, url.trim().trimEnd('/'))
            .putString(KEY_KEY, key.trim())
            .putString(KEY_DEVICE, deviceName.trim().ifBlank { "Phone" })
            .apply()
    }

    fun clear(ctx: Context) {
        sp(ctx).edit().clear().apply()
    }
}
