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
        "in.amazon.mShop.android.shopping",
        "com.canarabank.mobility",
        "com.canarabank.canaramobilebanking"
    )

    override fun canParse(pkg: String): Boolean {
        return supportedPackages.contains(pkg.lowercase())
    }

    // Debit patterns (supports "Dr. INR 1.00", "debited ... Rs 1", "debited with INR 1", "Rs 1 debited", etc.):
    private val debitPatterns = listOf(
        Pattern.compile("(?:\\bdr\\.?\\s+|debited|spent|deducted|withdrawn|paid|sent).*?(?:rs\\.?|inr|₹)\\s*([0-9]+(?:\\.[0-9]{1,2})?)", Pattern.CASE_INSENSITIVE),
        Pattern.compile("(?:rs\\.?|inr|₹)\\s*([0-9]+(?:\\.[0-9]{1,2})?).*?(?:\\bdr\\.?\\b|debited|spent|deducted|withdrawn|paid)", Pattern.CASE_INSENSITIVE)
    )

    // Credit patterns (supports "Cr. INR 50.00", "credited ... Rs 50", "credited with INR 50", "Rs 50 credited", etc.):
    private val creditPatterns = listOf(
        Pattern.compile("(?:\\bcr\\.?\\s+|credited|deposited|received).*?(?:rs\\.?|inr|₹)\\s*([0-9]+(?:\\.[0-9]{1,2})?)", Pattern.CASE_INSENSITIVE),
        Pattern.compile("(?:rs\\.?|inr|₹)\\s*([0-9]+(?:\\.[0-9]{1,2})?).*?(?:\\bcr\\.?\\b|credited|deposited|received)", Pattern.CASE_INSENSITIVE)
    )

    // UPI Ref / UTR
    private val refPattern = Pattern.compile("(?:upi\\s*(?:ref|reference|txn)?(?:\\s*no)?|utr)[:\\s/]*([0-9]{10,14})", Pattern.CASE_INSENSITIVE)
    // Merchant / Info: "to Yash Singha;" or "to/at <Merchant>"
    private val partyPattern = Pattern.compile("(?:to|at)\\s+([a-zA-Z0-9&._ -]{3,30}?)(?:;|\n|bal|upi|$)", Pattern.CASE_INSENSITIVE)

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

