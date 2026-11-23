package com.expensetracker.companion.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

@Dao
interface TransactionDao {
    @Query("SELECT * FROM transactions WHERE deletedAt IS NULL ORDER BY occurredAt DESC")
    fun getAllTransactions(): Flow<List<TransactionEntity>>

    @Query("SELECT * FROM transactions WHERE reviewStatus = 'pending' AND deletedAt IS NULL ORDER BY occurredAt DESC")
    fun getPendingReviewTransactions(): Flow<List<TransactionEntity>>

    @Query("SELECT COUNT(*) FROM transactions WHERE reviewStatus = 'pending' AND deletedAt IS NULL")
    fun getPendingReviewCount(): Flow<Int>

    @Query("SELECT * FROM transactions WHERE syncStatus = 'pending' LIMIT 50")
    suspend fun getPendingSyncTransactions(): List<TransactionEntity>

    @Query("SELECT * FROM transactions WHERE externalReference = :extRef AND deletedAt IS NULL LIMIT 1")
    suspend fun findByExternalReference(extRef: String): TransactionEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(transaction: TransactionEntity)

    @Update
    suspend fun update(transaction: TransactionEntity)

    @Query("UPDATE transactions SET reviewStatus = 'confirmed', updatedAt = :now WHERE id = :id")
    suspend fun confirmTransaction(id: String, now: Long = System.currentTimeMillis())

    @Query("UPDATE transactions SET reviewStatus = 'rejected', deletedAt = :now, updatedAt = :now WHERE id = :id")
    suspend fun rejectTransaction(id: String, now: Long = System.currentTimeMillis())

    @Query("UPDATE transactions SET syncStatus = 'synced' WHERE id IN (:ids)")
    suspend fun markSynced(ids: List<String>)
}

