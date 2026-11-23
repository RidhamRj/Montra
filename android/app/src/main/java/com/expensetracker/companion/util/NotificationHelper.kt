package com.expensetracker.companion.util

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.expensetracker.companion.MainActivity
import com.expensetracker.companion.data.local.TransactionEntity
import java.text.NumberFormat
import java.util.Locale

object NotificationHelper {

    private const val CHANNEL_ID = "montra_upi_detected"
    private const val CHANNEL_NAME = "Detected UPI Payments"

    fun showDetectedNotification(context: Context, transaction: TransactionEntity) {
        val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        // Create channel on Android 8+ (API 26+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Notifies when a new UPI transaction or bank SMS is captured"
                enableVibration(true)
            }
            notificationManager.createNotificationChannel(channel)
        }

        // Tap opens MainActivity directly to Review tab
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("OPEN_TAB", 1) // Review tab
        }

        val pendingIntent = PendingIntent.getActivity(
            context,
            transaction.id.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val rupees = transaction.amountPaise / 100.0
        val formattedAmount = NumberFormat.getCurrencyInstance(Locale("en", "IN")).format(rupees)
        val actionText = if (transaction.type == "expense") "Spent" else "Received"
        val party = transaction.partyName ?: transaction.source.uppercase()

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_notify_more)
            .setContentTitle("💸 $actionText $formattedAmount")
            .setContentText("Detected via $party. Tap to review & confirm.")
            .setStyle(NotificationCompat.BigTextStyle().bigText("Detected $formattedAmount ($actionText) from $party.\nTap to review and add to your monthly budget."))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()

        notificationManager.notify(transaction.id.hashCode(), notification)
    }
}
