package com.expensetracker.companion.service.parser

import java.util.regex.Pattern

class BankSmsParser : UpiAppParser {
    override val packageName: String = "sms.and.more"
    override val sourceName: String = "bank_sms"

    private val supportedPackages = setOf(
        "com.google.android.apps.messaging",
        "com.samsung.android.messaging",
        "com.android.mms",
        "com.oneplus.mms",
        "com.xiaomi.mms",
        "com.truecaller",
        "com.dreamplug.androidapp",
        "in.org.npci.upiapp",
        "in.amazon.mShop.android.shopping"
    )

    override fun canParse(pkg: String): Boolean {
        return supportedPackages.contains(pkg.lowercase())
    }

    // Debit patterns:
    // e.g., "Rs 1.00 debited from A/c XX1234", "debited by INR 1.00", "Spent Rs. 150 on ...", "Paid Rs 1 to ..."
    private val debitPatterns = listOf(
        Pattern.compile("(?:rs\\.?|inr|₹)\\s*([0-9]+(?:\\.[0-9]{1,2})?)\\s*(?:debited|spent|deducted|withdrawn|paid|transferred)", Pattern.CASE_INSENSITIVE),
        Pattern.compile("(?:debited|spent|deducted|withdrawn|paid|sent)\\s*(?:by|for|of)?\\s*(?:rs\\.?|inr|₹)\\s*([0-9]+(?:\\.[0-9]{1,2})?)", Pattern.CASE_INSENSITIVE)
    )

    // Credit patterns:
    // e.g., "Rs 100.00 credited to A/c XX1234", "Received Rs 500 from ..."
    private val creditPatterns = listOf(
        Pattern.compile("(?:rs\\.?|inr|₹)\\s*([0-9]+(?:\\.[0-9]{1,2})?)\\s*(?:credited|deposited|received)", Pattern.CASE_INSENSITIVE),
        Pattern.compile("(?:credited|deposited|received)\\s*(?:by|for|of)?\\s*(?:rs\\.?|inr|₹)\\s*([0-9]+(?:\\.[0-9]{1,2})?)", Pattern.CASE_INSENSITIVE)
    )

    // UPI Ref / UTR
    private val refPattern = Pattern.compile("(?:upi\\s*(?:ref|reference|txn)?(?:\\s*no)?|utr)[:\\s/]*([0-9]{10,14})", Pattern.CASE_INSENSITIVE)
    // Merchant / Info: "Info: UPI/P2P/Name" or "to/at <Merchant>"
    private val partyPattern = Pattern.compile("(?:to|at|info:?\\s*upi\\/[^\\/]+\\/)\\s*([a-zA-Z0-9&._ -]{3,30})", Pattern.CASE_INSENSITIVE)

    override fun parse(title: String?, text: String?): ParsedUpiTransaction? {
        val fullContent = "${title.orEmpty()} ${text.orEmpty()}".trim()
        if (fullContent.isEmpty()) return null

        // Ignore OTPs, bills reminder, balance enquiries
        if (fullContent.contains("OTP", ignoreCase = true) ||
            fullContent.contains("due date", ignoreCase = true) ||
            fullContent.contains("available balance", ignoreCase = true) && !fullContent.contains("debited", ignoreCase = true) && !fullContent.contains("credited", ignoreCase = true)) {
            return null
        }

        val refMatcher = refPattern.matcher(fullContent)
        val extRef = if (refMatcher.find()) refMatcher.group(1) else null

        val partyMatcher = partyPattern.matcher(fullContent)
        val partyName = if (partyMatcher.find()) partyMatcher.group(1)?.trim() else null

        // Check Debits
        for (pat in debitPatterns) {
            val matcher = pat.matcher(fullContent)
            if (matcher.find()) {
                val amountStr = matcher.group(1) ?: continue
                val amountRupees = amountStr.toDoubleOrNull() ?: continue
                return ParsedUpiTransaction(
                    amountPaise = (amountRupees * 100).toLong(),
                    type = "expense",
                    partyName = partyName,
                    externalReference = extRef,
                    source = "bank_sms"
                )
            }
        }

        // Check Credits
        for (pat in creditPatterns) {
            val matcher = pat.matcher(fullContent)
            if (matcher.find()) {
                val amountStr = matcher.group(1) ?: continue
                val amountRupees = amountStr.toDoubleOrNull() ?: continue
                return ParsedUpiTransaction(
                    amountPaise = (amountRupees * 100).toLong(),
                    type = "income",
                    partyName = partyName,
                    externalReference = extRef,
                    source = "bank_sms"
                )
            }
        }

        return null
    }
}

