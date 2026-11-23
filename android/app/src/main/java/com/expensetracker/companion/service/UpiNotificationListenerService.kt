package com.expensetracker.companion.service

import android.content.ComponentName
import android.os.Build
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import com.expensetracker.companion.data.local.ExpenseDatabase
import com.expensetracker.companion.data.local.TransactionEntity
import com.expensetracker.companion.service.parser.BankSmsParser
import com.expensetracker.companion.service.parser.GooglePayParser
import com.expensetracker.companion.service.parser.PaytmParser
import com.expensetracker.companion.service.parser.PhonePeParser
import com.expensetracker.companion.service.parser.UpiAppParser
import com.expensetracker.companion.sync.SyncWorker
import com.expensetracker.companion.util.NotificationDebugLog
import com.expensetracker.companion.util.NotificationHelper
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.util.UUID

class UpiNotificationListenerService : NotificationListenerService() {

    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val parsers: List<UpiAppParser> = listOf(
        PhonePeParser(),
        GooglePayParser(),
        PaytmParser(),
        BankSmsParser()
    )

    override fun onListenerConnected() {
        super.onListenerConnected()
        Log.i(TAG, "NotificationListenerService successfully CONNECTED by Android system!")
        NotificationDebugLog.isServiceConnected.value = true
    }

    override fun onListenerDisconnected() {
        super.onListenerDisconnected()
        Log.w(TAG, "NotificationListenerService DISCONNECTED by Android system!")
        NotificationDebugLog.isServiceConnected.value = false
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            requestRebind(ComponentName(this, UpiNotificationListenerService::class.java))
        }
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        super.onNotificationPosted(sbn)
        if (sbn == null) return

        val pkgName = sbn.packageName ?: return

        // Ignore our own companion app's notifications to prevent infinite loops
        if (pkgName == applicationContext.packageName) return

        val extras = sbn.notification.extras ?: return
        val title = extras.getCharSequence("android.title")?.toString().orEmpty()
        val text = extras.getCharSequence("android.text")?.toString().orEmpty()
        val bigText = extras.getCharSequence("android.bigText")?.toString().orEmpty()
        val subText = extras.getCharSequence("android.subText")?.toString().orEmpty()
        val summaryText = extras.getCharSequence("android.summaryText")?.toString().orEmpty()
        val textLines = extras.getCharSequenceArray("android.textLines")?.joinToString(" ").orEmpty()

        val fullText = listOf(text, bigText, subText, summaryText, textLines)
            .filter { it.isNotBlank() }
            .distinct()
            .joinToString(" ")
            .ifBlank { text }

        // Find matching parser
        var parser = parsers.firstOrNull { it.canParse(pkgName) }

        // If package is not hardcoded, but content has payment/UPI/bank indicators, try BankSmsParser as generic parser
        val combined = "$title $fullText".lowercase()
        val hasFinancialKeywords = combined.contains("rs") || combined.contains("inr") || combined.contains("₹") ||
                combined.contains("debited") || combined.contains("credited") || combined.contains("paid") ||
                combined.contains("received") || combined.contains("upi")

        if (parser == null && hasFinancialKeywords) {
            parser = parsers.firstOrNull { it is BankSmsParser }
        }

        if (parser == null) {
            // Not a financial or supported app notification
            return
        }

        Log.d(TAG, "Inspecting notification from: $pkgName | Title: '$title' | Text: '$fullText'")

        val parsed = parser.parse(title, fullText)
        if (parsed == null) {
            if (hasFinancialKeywords) {
                NotificationDebugLog.log(
                    pkg = pkgName,
                    title = title.take(30),
                    text = fullText.take(60),
                    result = "Ignored (Regex did not match amount)",
                    isSuccess = false
                )
            }
            return
        }

        Log.i(TAG, "Parsed UPI payment: ${parsed.type} ${parsed.amountPaise} paise from ${parsed.source}")
        val amountInRupees = parsed.amountPaise / 100.0
        NotificationDebugLog.log(
            pkg = pkgName,
            title = title.take(30),
            text = fullText.take(60),
            result = "Captured ₹$amountInRupees (${parsed.type})",
            isSuccess = true
        )

        serviceScope.launch {
            val db = ExpenseDatabase.getDatabase(applicationContext)
            val dao = db.transactionDao()

            // Deduplication check: if extRef exists, don't duplicate
            if (!parsed.externalReference.isNullOrBlank()) {
                val existing = dao.findByExternalReference(parsed.externalReference)
                if (existing != null) {
                    Log.d(TAG, "Duplicate transaction detected with ref ${parsed.externalReference}; skipping.")
                    return@launch
                }
            }

            val entity = TransactionEntity(
                id = UUID.randomUUID().toString(),
                userId = "default-user",
                amountPaise = parsed.amountPaise,
                type = parsed.type,
                categoryId = if (parsed.type == "expense") "cat-food" else "cat-other-inc",
                description = "Auto-detected from ${parsed.source.uppercase()}",
                partyName = parsed.partyName,
                paymentMethod = "upi",
                source = parsed.source,
                externalReference = parsed.externalReference,
                occurredAt = sbn.postTime,
                reviewStatus = "pending", // Pending review for user confirmation!
                syncStatus = "pending"
            )

            dao.insert(entity)
            Log.d(TAG, "Saved pending UPI transaction: ${entity.id}")

            // Show immediate heads-up notification so user knows transaction was captured!
            try {
                NotificationHelper.showDetectedNotification(applicationContext, entity)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to show notification: ${e.message}")
            }

            // Trigger background sync with network constraint
            SyncWorker.enqueue(applicationContext)
        }
    }

    companion object {
        private const val TAG = "UpiListenerService"
    }
}
