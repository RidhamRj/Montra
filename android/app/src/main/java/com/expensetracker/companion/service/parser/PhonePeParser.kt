package com.expensetracker.companion.service.parser

import java.util.regex.Pattern

class PhonePeParser : UpiAppParser {
    override val packageName: String = "com.phonepe.app"
    override val sourceName: String = "phonepe"

    // UPI Ref / UTR: "UPI Ref No: 123456789012" or "UTR: 123456789012"
    private val refPattern = Pattern.compile(
        "(?:upi\\s*ref(?:\\s*no)?|utr)[:\\s]*([0-9]{10,14})",
        Pattern.CASE_INSENSITIVE
    )

    // Credit / Income patterns:
    // 1. "AKASH KUMAR has sent ₹180 to your bank account Canara Bank-0170"
    // 2. "Money received: ₹180 from AKASH KUMAR"
    // 3. "Received ₹1000 from Rahul"
    // 4. "Credited by ₹200"
    private val creditPatterns = listOf(
        // "<Name> has sent / sent ₹<Amount> to your bank account / to you"
        Pattern.compile(
            "([a-zA-Z0-9&._ -]{2,40}?)\\s+(?:has\\s+sent|sent)\\s*(?:rs\\.?|inr|₹)\\s*([0-9]+(?:\\.[0-9]{1,2})?)",
            Pattern.CASE_INSENSITIVE
        ),
        // "Received / Credited ₹<Amount> from <Name>"
        Pattern.compile(
            "(?:received|credited).*?(?:rs\\.?|inr|₹)\\s*([0-9]+(?:\\.[0-9]{1,2})?)(?:\\s*from\\s+([a-zA-Z0-9&._ -]{2,40}?))?(?:\\s*to|\\s*in|\\s*using|\\.|$)",
            Pattern.CASE_INSENSITIVE
        ),
        // "Money received: ... ₹<Amount>"
        Pattern.compile(
            "money\\s+received.*?(?:rs\\.?|inr|₹)\\s*([0-9]+(?:\\.[0-9]{1,2})?)",
            Pattern.CASE_INSENSITIVE
        )
    )

    // Debit / Expense patterns:
    // 1. "Paid ₹150 to Swiggy"
    // 2. "Payment of ₹249 to Swiggy"
    // 3. "Debited by ₹200.50 for / to <Name>"
    // 4. "Transferred ₹500 to Rahul"
    private val debitPatterns = listOf(
        // "Paid / Transferred ₹<Amount> to / at <Name>"
        Pattern.compile(
            "(?:paid|transferred|spent|sent)\\s*(?:rs\\.?|inr|₹)\\s*([0-9]+(?:\\.[0-9]{1,2})?)\\s*(?:to|at)\\s+([a-zA-Z0-9&._ -]{2,40}?)",
            Pattern.CASE_INSENSITIVE
        ),
        // "Payment of ₹<Amount> to <Name>"
        Pattern.compile(
            "payment\\s+of\\s*(?:rs\\.?|inr|₹)\\s*([0-9]+(?:\\.[0-9]{1,2})?)\\s*(?:to|at)\\s+([a-zA-Z0-9&._ -]{2,40}?)",
            Pattern.CASE_INSENSITIVE
        ),
        // Generic "Paid / Debited ... ₹<Amount>"
        Pattern.compile(
            "(?:paid|debited|spent|transferred).*?(?:rs\\.?|inr|₹)\\s*([0-9]+(?:\\.[0-9]{1,2})?)(?:\\s*(?:to|at)\\s+([a-zA-Z0-9&._ -]{2,40}?))?",
            Pattern.CASE_INSENSITIVE
        )
    )

    override fun parse(title: String?, text: String?): ParsedUpiTransaction? {
        val cleanTitle = title.orEmpty().trim()
        val cleanText = text.orEmpty().trim()
        val fullContent = "$cleanTitle $cleanText".trim()
        if (fullContent.isEmpty()) return null

        // Ignore OTPs, cashbacks, promos, bill reminders without payment
        if (fullContent.contains("OTP", ignoreCase = true) ||
            fullContent.contains("cashback scratch card", ignoreCase = true) ||
            fullContent.contains("recharge reminder", ignoreCase = true)) {
            return null
        }

        val refMatcher = refPattern.matcher(fullContent)
        val extRef = if (refMatcher.find()) refMatcher.group(1) else null

        // 1. Check if title or content explicitly indicates MONEY RECEIVED / CREDIT
        val isExplicitCredit = cleanTitle.contains("Money received", ignoreCase = true) ||
                cleanTitle.contains("Received", ignoreCase = true) ||
                cleanTitle.contains("Credited", ignoreCase = true) ||
                fullContent.contains("has sent", ignoreCase = true) ||
                fullContent.contains("received from", ignoreCase = true)

        if (isExplicitCredit) {
            // Check Credit Pattern 1: "<Name> has sent ₹<Amount>" (test cleanText first so title is not included in party)
            val p1 = creditPatterns[0].matcher(cleanText.ifBlank { fullContent })
            if (p1.find()) {
                val party = cleanPartyName(p1.group(1))
                val amountStr = p1.group(2)
                val amountRupees = amountStr?.toDoubleOrNull()
                if (amountRupees != null) {
                    return ParsedUpiTransaction(
                        amountPaise = (amountRupees * 100).toLong(),
                        type = "income",
                        partyName = party,
                        externalReference = extRef,
                        source = sourceName
                    )
                }
            }

            // Check other credit patterns
            for (i in 1 until creditPatterns.size) {
                val matcher = creditPatterns[i].matcher(fullContent)
                if (matcher.find()) {
                    val amountStr = matcher.group(1) ?: continue
                    val amountRupees = amountStr.toDoubleOrNull() ?: continue
                    val party = if (matcher.groupCount() >= 2) cleanPartyName(matcher.group(2)) else null
                    return ParsedUpiTransaction(
                        amountPaise = (amountRupees * 100).toLong(),
                        type = "income",
                        partyName = party,
                        externalReference = extRef,
                        source = sourceName
                    )
                }
            }
        }

        // 2. Check Debit / Expense
        for (pat in debitPatterns) {
            val matcher = pat.matcher(fullContent)
            if (matcher.find()) {
                val amountStr = matcher.group(1) ?: continue
                val amountRupees = amountStr.toDoubleOrNull() ?: continue
                val party = if (matcher.groupCount() >= 2) cleanPartyName(matcher.group(2)) else null

                // Ensure party is not "your bank account"
                val filteredParty = if (party?.contains("your bank account", ignoreCase = true) == true) null else party

                return ParsedUpiTransaction(
                    amountPaise = (amountRupees * 100).toLong(),
                    type = "expense",
                    partyName = filteredParty,
                    externalReference = extRef,
                    source = sourceName
                )
            }
        }

        // 3. Fallback credit check if not caught by explicit credit
        for (pat in creditPatterns) {
            val matcher = pat.matcher(fullContent)
            if (matcher.find()) {
                val amountStr = matcher.group(1) ?: continue
                val amountRupees = amountStr.toDoubleOrNull() ?: continue
                val party = if (matcher.groupCount() >= 2) cleanPartyName(matcher.group(2)) else null
                return ParsedUpiTransaction(
                    amountPaise = (amountRupees * 100).toLong(),
                    type = "income",
                    partyName = party,
                    externalReference = extRef,
                    source = sourceName
                )
            }
        }

        return null
    }

    private fun cleanPartyName(raw: String?): String? {
        if (raw.isNullOrBlank()) return null
        var s = raw.trim()
        s = s.replace(Regex("^(?:Money received|Payment from|Received from|Money transfer)\\s+", RegexOption.IGNORE_CASE), "")
        // Strip trailing/leading punctuation
        s = s.replace(Regex("^[\\s.,;:/-]+|[\\s.,;:/-]+$"), "")
        // If it starts with "using", "to your bank", etc., strip or discard
        if (s.contains("your bank account", ignoreCase = true)) {
            s = s.substringBefore("your bank account").trim()
        }
        if (s.contains(" using ", ignoreCase = true)) {
            s = s.substringBefore(" using ").trim()
        }
        return s.ifBlank { null }
    }
}
