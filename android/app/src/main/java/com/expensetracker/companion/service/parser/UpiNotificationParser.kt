package com.expensetracker.companion.service.parser

data class ParsedUpiTransaction(
    val amountPaise: Long,
    val type: String, // "expense" or "income"
    val partyName: String?,
    val externalReference: String?,
    val source: String,
    val isValid: Boolean = true
)

interface UpiAppParser {
    val packageName: String
    val sourceName: String
    fun canParse(pkg: String): Boolean = pkg.equals(packageName, ignoreCase = true)
    fun parse(title: String?, text: String?): ParsedUpiTransaction?
}

