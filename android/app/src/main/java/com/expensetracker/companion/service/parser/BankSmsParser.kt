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

    // Debit patterns:
    // 1. "Dr. INR 1.00", "debited INR 50", "debited with Rs 100", "spent Rs 200"
    // 2. "Rs. 50 debited", "INR 1.00 Dr."
    private val debitPatterns = listOf(
        Pattern.compile(
            "(?:\\bdr\\.?\\s+|debited|spent|deducted|withdrawn|paid|sent).*?(?:rs\\.?|inr|₹)\\s*([0-9,]+(?:\\.[0-9]{1,2})?)",
            Pattern.CASE_INSENSITIVE
        ),
        Pattern.compile(
            "(?:rs\\.?|inr|₹)\\s*([0-9,]+(?:\\.[0-9]{1,2})?).*?(?:\\bdr\\.?\\b|debited|spent|deducted|withdrawn|paid)",
            Pattern.CASE_INSENSITIVE
        )
    )

    // Credit patterns:
    // 1. "Cr. INR 50.00", "credited INR 50", "deposited Rs 100", "received Rs 200"
    // 2. "Rs. 50 credited", "INR 50.00 Cr."
    private val creditPatterns = listOf(
        Pattern.compile(
            "(?:\\bcr\\.?\\s+|credited|deposited|received).*?(?:rs\\.?|inr|₹)\\s*([0-9,]+(?:\\.[0-9]{1,2})?)",
            Pattern.CASE_INSENSITIVE
        ),
        Pattern.compile(
            "(?:rs\\.?|inr|₹)\\s*([0-9,]+(?:\\.[0-9]{1,2})?).*?(?:\\bcr\\.?\\b|credited|deposited|received)",
            Pattern.CASE_INSENSITIVE
        )
    )

    // UPI Ref / UTR
    private val refPattern = Pattern.compile(
        "(?:upi\\s*(?:ref|reference|txn)?(?:\\s*no)?|utr)[:\\s/]*([0-9]{10,14})",
        Pattern.CASE_INSENSITIVE
    )

    // Party / Merchant / Sender extraction patterns:
    // - "by UPI Swiggy", "by UPI Papa"
    // - "to Yash Singha;"
    // - "at STARBUCKS"
    // - "towards Zomato"
    // - "from ROHIT SHARMA"
    private val partyPatterns = listOf(
        // "by UPI <Party>", "by VPA <Party>"
        Pattern.compile("(?:by\\s+upi\\s+|by\\s+vpa\\s+)([a-zA-Z0-9&._ -]{2,35}?)(?:;|\n|\\.|\\son\\s|\\sat\\s|\\sfor\\s|\\sref|\\supi|\\sbal|$)", Pattern.CASE_INSENSITIVE),
        // "to Yash Singha;", "to VPA xyz@..."
        Pattern.compile("(?:to\\s+vpa\\s+|to\\s+)([a-zA-Z0-9&._ -]{2,35}?)(?:;|\n|\\.|\\son\\s|\\sat\\s|\\sfor\\s|\\susing\\s|\\sref|\\supi|\\sbal|Not you|$)", Pattern.CASE_INSENSITIVE),
        // "at Starbucks"
        Pattern.compile("(?:at\\s+)([a-zA-Z0-9&._ -]{2,35}?)(?:;|\n|\\.|\\son\\s|\\sfor\\s|\\sref|\\supi|\\sbal|$)", Pattern.CASE_INSENSITIVE),
        // "towards Zomato"
        Pattern.compile("(?:towards\\s+)([a-zA-Z0-9&._ -]{2,35}?)(?:;|\n|\\.|\\son\\s|\\sfor\\s|\\sref|\\supi|\\sbal|$)", Pattern.CASE_INSENSITIVE),
        // "from Rohit Sharma"
        Pattern.compile("(?:from\\s+)([a-zA-Z0-9&._ -]{2,35}?)(?:;|\n|\\.|\\son\\s|\\sat\\s|\\sref|\\supi|\\sbal|$)", Pattern.CASE_INSENSITIVE)
    )

    override fun parse(title: String?, text: String?): ParsedUpiTransaction? {
        val fullContent = "${title.orEmpty()} ${text.orEmpty()}".trim()
        if (fullContent.isEmpty()) return null

        // Ignore OTPs, bills reminder, balance enquiries without debit/credit
        if (fullContent.contains("OTP", ignoreCase = true) ||
            fullContent.contains("due date", ignoreCase = true) ||
            fullContent.contains("scratch card", ignoreCase = true) ||
            (fullContent.contains("available balance", ignoreCase = true) &&
             !fullContent.contains("debited", ignoreCase = true) &&
             !fullContent.contains("credited", ignoreCase = true) &&
             !fullContent.contains("dr.", ignoreCase = true) &&
             !fullContent.contains("cr.", ignoreCase = true))) {
            return null
        }

        val refMatcher = refPattern.matcher(fullContent)
        val extRef = if (refMatcher.find()) refMatcher.group(1) else null

        // Extract party name
        var partyName: String? = null
        for (pat in partyPatterns) {
            val matcher = pat.matcher(fullContent)
            if (matcher.find()) {
                val candidate = cleanParty(matcher.group(1))
                if (!candidate.isNullOrBlank()) {
                    partyName = candidate
                    break
                }
            }
        }

        // 1. Check Debits
        for (pat in debitPatterns) {
            val matcher = pat.matcher(fullContent)
            if (matcher.find()) {
                val amountStr = matcher.group(1)?.replace(",", "") ?: continue
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

        // 2. Check Credits
        for (pat in creditPatterns) {
            val matcher = pat.matcher(fullContent)
            if (matcher.find()) {
                val amountStr = matcher.group(1)?.replace(",", "") ?: continue
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

    private fun cleanParty(raw: String?): String? {
        if (raw.isNullOrBlank()) return null
        var s = raw.trim()
        // Strip trailing punctuation
        s = s.replace(Regex("^[\\s.,;:/-]+|[\\s.,;:/-]+$"), "")
        // Strip if it starts with "UPI " or "VPA "
        if (s.startsWith("UPI ", ignoreCase = true)) {
            s = s.substring(4).trim()
        }
        if (s.startsWith("VPA ", ignoreCase = true)) {
            s = s.substring(4).trim()
        }
        // Discard bank account indicators
        if (s.contains("account", ignoreCase = true) ||
            s.contains("acct", ignoreCase = true) ||
            s.contains("a/c", ignoreCase = true) ||
            s.length < 2) {
            return null
        }
        return s.ifBlank { null }
    }
}
