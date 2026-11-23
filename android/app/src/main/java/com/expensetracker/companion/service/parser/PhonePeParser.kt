package com.expensetracker.companion.service.parser

import java.util.regex.Pattern

class PhonePeParser : UpiAppParser {
    override val packageName: String = "com.phonepe.app"
    override val sourceName: String = "phonepe"

    // Matches: "Paid Rs. 150 to Swiggy", "Debited by Rs 200.50", "Transferred Rs. 500 to ..."
    private val debitPattern = Pattern.compile("(?:paid|debited|sent|transferred).*?(?:rs\\.?|inr|₹)\\s*([0-9]+(?:\\.[0-9]{1,2})?)\\s*(?:to|at)?\\s*([^.\\n]+)?", Pattern.CASE_INSENSITIVE)
    // Matches: "Received Rs. 1000 from Rahul", "Credited by Rs. 200"
    private val creditPattern = Pattern.compile("(?:received|credited).*?(?:rs\\.?|inr|₹)\\s*([0-9]+(?:\\.[0-9]{1,2})?)\\s*(?:from)?\\s*([^.\\n]+)?", Pattern.CASE_INSENSITIVE)
    // Matches UPI Ref / UTR: "UPI Ref No: 123456789012"
    private val refPattern = Pattern.compile("(?:upi\\s*ref(?:\\s*no)?|utr)[:\\s]*([0-9]{10,14})", Pattern.CASE_INSENSITIVE)

    override fun parse(title: String?, text: String?): ParsedUpiTransaction? {
        val fullContent = "${title.orEmpty()} ${text.orEmpty()}".trim()
        if (fullContent.isEmpty()) return null

        // Ignore OTPs, cashbacks, promos
        if (fullContent.contains("OTP", ignoreCase = true) ||
            fullContent.contains("reward", ignoreCase = true) ||
            fullContent.contains("cashback scratch card", ignoreCase = true)) {
            return null
        }

        val refMatcher = refPattern.matcher(fullContent)
        val extRef = if (refMatcher.find()) refMatcher.group(1) else null

        // Check Debit / Expense
        val debitMatcher = debitPattern.matcher(fullContent)
        if (debitMatcher.find()) {
            val amountStr = debitMatcher.group(1) ?: return null
            val amountRupees = amountStr.toDoubleOrNull() ?: return null
            val party = debitMatcher.group(2)?.trim()?.take(60)
            return ParsedUpiTransaction(
                amountPaise = (amountRupees * 100).toLong(),
                type = "expense",
                partyName = party,
                externalReference = extRef,
                source = sourceName
            )
        }

        // Check Credit / Income
        val creditMatcher = creditPattern.matcher(fullContent)
        if (creditMatcher.find()) {
            val amountStr = creditMatcher.group(1) ?: return null
            val amountRupees = amountStr.toDoubleOrNull() ?: return null
            val party = creditMatcher.group(2)?.trim()?.take(60)
            return ParsedUpiTransaction(
                amountPaise = (amountRupees * 100).toLong(),
                type = "income",
                partyName = party,
                externalReference = extRef,
                source = sourceName
            )
        }

        return null
    }
}

