package com.expensetracker.companion.sync

import android.content.Context
import android.content.SharedPreferences

object SyncPreferences {
    private const val PREFS_NAME = "expense_tracker_sync_prefs"
    private const val KEY_SUPABASE_URL = "supabase_url"
    private const val KEY_SUPABASE_ANON_KEY = "supabase_anon_key"
    private const val KEY_LAST_SYNC_STATUS = "last_sync_status"
    private const val KEY_LAST_SYNC_TIME = "last_sync_time"

    const val DEFAULT_SUPABASE_URL = "https://oqnlyzdxmtghvmhljrik.supabase.co"

    private fun getPrefs(context: Context): SharedPreferences {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }

    fun getSupabaseUrl(context: Context): String {
        return getPrefs(context).getString(KEY_SUPABASE_URL, DEFAULT_SUPABASE_URL) ?: DEFAULT_SUPABASE_URL
    }

    fun setSupabaseUrl(context: Context, url: String) {
        getPrefs(context).edit().putString(KEY_SUPABASE_URL, url.trim()).apply()
    }

    fun getSupabaseAnonKey(context: Context): String {
        return getPrefs(context).getString(KEY_SUPABASE_ANON_KEY, "") ?: ""
    }

    fun setSupabaseAnonKey(context: Context, key: String) {
        getPrefs(context).edit().putString(KEY_SUPABASE_ANON_KEY, key.trim()).apply()
    }

    fun getLastSyncStatus(context: Context): String {
        return getPrefs(context).getString(KEY_LAST_SYNC_STATUS, "Not synced yet") ?: "Not synced yet"
    }

    fun setLastSyncStatus(context: Context, status: String) {
        getPrefs(context).edit()
            .putString(KEY_LAST_SYNC_STATUS, status)
            .putLong(KEY_LAST_SYNC_TIME, System.currentTimeMillis())
            .apply()
    }

    fun getLastSyncTime(context: Context): Long {
        return getPrefs(context).getLong(KEY_LAST_SYNC_TIME, 0L)
    }
}
