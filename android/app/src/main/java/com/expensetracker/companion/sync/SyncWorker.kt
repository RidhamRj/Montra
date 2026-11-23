package com.expensetracker.companion.sync

import android.content.Context
import android.util.Log
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.expensetracker.companion.data.local.ExpenseDatabase
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.TimeUnit

class SyncWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {

    override suspend fun doWork(): Result {
        val db = ExpenseDatabase.getDatabase(applicationContext)
        val dao = db.transactionDao()
        val pendingList = dao.getPendingSyncTransactions()

        if (pendingList.isEmpty()) {
            SyncPreferences.setLastSyncStatus(applicationContext, "All local transactions already synced")
            return Result.success()
        }

        Log.d(TAG, "Starting sync for ${pendingList.size} pending transactions...")

        val supabaseUrl = SyncPreferences.getSupabaseUrl(applicationContext)
        val supabaseAnonKey = SyncPreferences.getSupabaseAnonKey(applicationContext)

        if (supabaseAnonKey.isBlank() || supabaseUrl.contains("your-supabase-project")) {
            val msg = "Supabase API key not configured. Retaining ${pendingList.size} local records safely."
            Log.d(TAG, msg)
            SyncPreferences.setLastSyncStatus(applicationContext, "Setup Needed: Enter Supabase Anon Key in Settings")
            return Result.success()
        }

        try {
            val cleanBaseUrl = supabaseUrl.trimEnd('/')
            val url = URL("$cleanBaseUrl/rest/v1/transactions")
            val conn = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("apikey", supabaseAnonKey)
                setRequestProperty("Authorization", "Bearer $supabaseAnonKey")
                setRequestProperty("Prefer", "resolution=merge-duplicates")
                doOutput = true
                connectTimeout = 15000
                readTimeout = 15000
            }

            val jsonArray = JSONArray()
            for (item in pendingList) {
                val obj = JSONObject().apply {
                    put("id", item.id)
                    put("user_id", item.userId)
                    put("amount", item.amountPaise)
                    put("type", item.type)
                    put("category_id", item.categoryId)
                    put("description", item.description)
                    put("party_name", item.partyName)
                    put("payment_method", item.paymentMethod)
                    put("source", item.source)
                    put("external_reference", item.externalReference)
                    put("occurred_at", SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply {
                        timeZone = java.util.TimeZone.getTimeZone("UTC")
                    }.format(Date(item.occurredAt)))
                    put("review_status", item.reviewStatus)
                }
                jsonArray.put(obj)
            }

            OutputStreamWriter(conn.outputStream).use { writer ->
                writer.write(jsonArray.toString())
                writer.flush()
            }

            val responseCode = conn.responseCode
            if (responseCode in 200..299) {
                dao.markSynced(pendingList.map { it.id })
                val timeStr = SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(Date())
                val successMsg = "Successfully synced ${pendingList.size} transactions at $timeStr"
                Log.i(TAG, successMsg)
                SyncPreferences.setLastSyncStatus(applicationContext, successMsg)
                return Result.success()
            } else {
                val errBody = try {
                    BufferedReader(InputStreamReader(conn.errorStream ?: conn.inputStream)).use { it.readText() }
                } catch (e: Exception) {
                    ""
                }
                val errMsg = "HTTP $responseCode: ${errBody.take(100)}"
                Log.w(TAG, "Supabase sync error: $errMsg")
                SyncPreferences.setLastSyncStatus(applicationContext, "Sync error: $errMsg")
                return Result.retry()
            }
        } catch (e: Exception) {
            val netErr = "Network error: ${e.message}"
            Log.e(TAG, "Sync failed: $netErr", e)
            SyncPreferences.setLastSyncStatus(applicationContext, netErr)
            return Result.retry()
        }
    }

    companion object {
        private const val TAG = "SyncWorker"
        private const val WORK_NAME = "ExpenseTrackerPeriodicSync"

        fun enqueue(context: Context) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val request = OneTimeWorkRequestBuilder<SyncWorker>()
                .setConstraints(constraints)
                .build()

            WorkManager.getInstance(context).enqueue(request)
        }

        fun schedulePeriodic(context: Context) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val periodicRequest = PeriodicWorkRequestBuilder<SyncWorker>(1, TimeUnit.DAYS)
                .setConstraints(constraints)
                .build()

            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                WORK_NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                periodicRequest
            )
        }
    }
}
