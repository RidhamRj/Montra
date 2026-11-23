package com.expensetracker.companion.util

import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

data class DebugLogEntry(
    val timestamp: String,
    val packageName: String,
    val title: String,
    val text: String,
    val result: String,
    val isSuccess: Boolean
)

object NotificationDebugLog {
    val isServiceConnected = mutableStateOf(false)
    val entries = mutableStateListOf<DebugLogEntry>()

    fun log(pkg: String, title: String, text: String, result: String, isSuccess: Boolean) {
        val time = SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(Date())
        if (entries.size >= 20) {
            entries.removeLastOrNull()
        }
        entries.add(
            0,
            DebugLogEntry(
                timestamp = time,
                packageName = pkg,
                title = title,
                text = text,
                result = result,
                isSuccess = isSuccess
            )
        )
    }
}

