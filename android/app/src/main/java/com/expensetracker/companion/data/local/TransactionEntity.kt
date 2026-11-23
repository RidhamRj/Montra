package com.expensetracker.companion.data.local

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "transactions",
    indices = [
        Index(value = ["occurredAt"]),
        Index(value = ["reviewStatus"]),
        Index(value = ["syncStatus"]),
        Index(value = ["externalReference"])
    ]
)
data class TransactionEntity(
    @PrimaryKey
    val id: String, // UUID generated on client
    val userId: String,
    val amountPaise: Long, // Integer paise (e.g. ₹150.50 -> 15050 paise)
    val type: String, // "expense" | "income"
    val categoryId: String = "cat-food",
    val description: String = "",
    val partyName: String? = null, // Merchant, recipient, or sender
    val paymentMethod: String = "upi", // "upi", "cash", etc.
    val source: String = "manual", // "phonepe", "gpay", "paytm", "manual"
    val externalReference: String? = null, // UPI reference ID / UTR
    val occurredAt: Long = System.currentTimeMillis(),
    val reviewStatus: String = "confirmed", // "pending", "confirmed", "rejected"
    val syncStatus: String = "pending", // "pending", "synced", "failed"
    val createdAt: Long = System.currentTimeMillis(),
    val updatedAt: Long = System.currentTimeMillis(),
    val deletedAt: Long? = null
)

