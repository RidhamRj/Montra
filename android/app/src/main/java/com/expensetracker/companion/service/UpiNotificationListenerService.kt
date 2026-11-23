package com.expensetracker.companion.service

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import com.expensetracker.companion.data.local.ExpenseDatabase
import com.expensetracker.companion.data.local.TransactionEntity
import com.expensetracker.companion.service.parser.GooglePayParser
import com.expensetracker.companion.service.parser.PaytmParser
import com.expensetracker.companion.service.parser.PhonePeParser
import com.expensetracker.companion.service.parser.UpiAppParser
import com.expensetracker.companion.sync.SyncWorker
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
        PaytmParser()
    )

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        super.onNotificationPosted(sbn)
        if (sbn == null) return

        val pkgName = sbn.packageName ?: return
        val parser = parsers.firstOrNull { it.canParse(pkgName) } ?: return

        val extras = sbn.notification.extras ?: return
        val title = extras.getCharSequence("android.title")?.toString()
        val text = extras.getCharSequence("android.text")?.toString()

        Log.d(TAG, "Notification received from supported UPI app: $pkgName")

        val parsed = parser.parse(title, text) ?: return
        Log.i(TAG, "Parsed UPI payment: ${parsed.type} ${parsed.amountPaise} paise from ${parsed.source}")

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

            // Trigger background sync with network constraint
            SyncWorker.enqueue(applicationContext)
        }
    }

    companion object {
        private const val TAG = "UpiListenerService"
    }
}

