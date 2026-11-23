package com.expensetracker.companion.service.parser

import java.util.regex.Pattern

class PaytmParser : UpiAppParser {
    override val packageName: String = "net.one97.paytm"
    override val sourceName: String = "paytm"

    private val debitPattern = Pattern.compile("(?:paid|sent|debited).*?(?:rs\\.?|inr|₹)\\s*([0-9]+(?:\\.[0-9]{1,2})?)\\s*(?:at|to)?\\s*([^.\\n]+)?", Pattern.CASE_INSENSITIVE)
    private val creditPattern = Pattern.compile("(?:received|credited).*?(?:rs\\.?|inr|₹)\\s*([0-9]+(?:\\.[0-9]{1,2})?)\\s*(?:from)?\\s*([^.\\n]+)?", Pattern.CASE_INSENSITIVE)
    private val refPattern = Pattern.compile("(?:upi\\s*ref(?:\\s*no)?|utr)[:\\s]*([0-9]{10,14})", Pattern.CASE_INSENSITIVE)

    override fun parse(title: String?, text: String?): ParsedUpiTransaction? {
        val fullContent = "${title.orEmpty()} ${text.orEmpty()}".trim()
        if (fullContent.isEmpty() || fullContent.contains("OTP", ignoreCase = true) || fullContent.contains("Cashback", ignoreCase = true)) return null

        val refMatcher = refPattern.matcher(fullContent)
        val extRef = if (refMatcher.find()) refMatcher.group(1) else null

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

