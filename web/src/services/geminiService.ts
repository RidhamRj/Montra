import { db } from "../db/expenseDb";
import type { Transaction } from "../types";

export interface AiCategorizationResult {
  merchant: string;
  categoryId: string;
  cleanReason: string;
  confidence: "high" | "medium" | "heuristic";
}

const STORAGE_KEY = "rupeetrack_gemini_key";

export function getStoredGeminiApiKey(): string {
  if (typeof window === "undefined") {
    return import.meta.env.VITE_GEMINI_API_KEY || "";
  }
  return localStorage.getItem(STORAGE_KEY) || import.meta.env.VITE_GEMINI_API_KEY || "";
}

export function saveStoredGeminiApiKey(key: string): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, key.trim());
  }
}

/**
 * Heuristic fallback parser when Gemini API key is missing or offline
 */
export function heuristicParseAndCategorize(
  description: string,
  partyName?: string | null,
  type: "expense" | "income" = "expense"
): AiCategorizationResult {
  const text = `${partyName || ""} ${description}`.trim();
  const lower = text.toLowerCase();

  let merchant = partyName?.trim() || "";
  let categoryId = type === "expense" ? "cat-other-exp" : "cat-other-inc";
  let cleanReason = "UPI Transaction";

  // 1. Extract Merchant/Person if not provided
  if (!merchant || merchant.toLowerCase() === "bank sms" || merchant.toLowerCase() === "upi") {
    const toMatch = text.match(/(?:to|by upi|at|towards|from)\s+([a-zA-Z0-9&._ -]{2,30}?)(?:;|\n|\.|\son\s|\sfor\s|\sref|\supi|\sbal|$)/i);
    if (toMatch && toMatch[1]) {
      merchant = toMatch[1].trim();
    } else if (text.match(/([a-zA-Z0-9\s._-]+?)\s+(?:has\s+sent|sent)/i)) {
      merchant = text.match(/([a-zA-Z0-9\s._-]+?)\s+(?:has\s+sent|sent)/i)![1].trim();
    }
  }

  // Clean merchant name
  merchant = merchant
    .replace(/^(?:UPI|VPA)\s+/i, "")
    .replace(/[\s.,;:/-]+$/, "")
    .trim();

  // 2. Intelligent Categorization based on Indian Banking & UPI entities
  if (
    lower.includes("swiggy") ||
    lower.includes("zomato") ||
    lower.includes("mcdonald") ||
    lower.includes("starbucks") ||
    lower.includes("burger") ||
    lower.includes("pizza") ||
    lower.includes("cafe") ||
    lower.includes("restaurant") ||
    lower.includes("dining") ||
    lower.includes("food")
  ) {
    categoryId = "cat-food";
    cleanReason = merchant ? `Dining / Food from ${merchant}` : "Food & Dining";
  } else if (
    lower.includes("blinkit") ||
    lower.includes("zepto") ||
    lower.includes("instamart") ||
    lower.includes("bigbasket") ||
    lower.includes("dmart") ||
    lower.includes("grocer")
  ) {
    categoryId = "cat-groceries";
    cleanReason = merchant ? `Groceries from ${merchant}` : "Groceries";
  } else if (
    lower.includes("amazon") ||
    lower.includes("flipkart") ||
    lower.includes("myntra") ||
    lower.includes("nykaa") ||
    lower.includes("ajio") ||
    lower.includes("tata cliq") ||
    lower.includes("shopping")
  ) {
    categoryId = "cat-shopping";
    cleanReason = merchant ? `Shopping at ${merchant}` : "Online Shopping";
  } else if (
    lower.includes("uber") ||
    lower.includes("ola") ||
    lower.includes("rapido") ||
    lower.includes("metro") ||
    lower.includes("fuel") ||
    lower.includes("petrol") ||
    lower.includes("hpcl") ||
    lower.includes("bpcl") ||
    lower.includes("ioc")
  ) {
    categoryId = "cat-transport";
    cleanReason = merchant ? `Ride / Travel via ${merchant}` : "Transportation";
  } else if (
    lower.includes("airtel") ||
    lower.includes("jio") ||
    lower.includes("vi") ||
    lower.includes("bescom") ||
    lower.includes("electricity") ||
    lower.includes("water") ||
    lower.includes("gas") ||
    lower.includes("bill") ||
    lower.includes("recharge")
  ) {
    categoryId = "cat-bills";
    cleanReason = merchant ? `Utility Bill / Recharge (${merchant})` : "Bills & Utilities";
  } else if (
    lower.includes("netflix") ||
    lower.includes("spotify") ||
    lower.includes("prime") ||
    lower.includes("hotstar") ||
    lower.includes("pvr") ||
    lower.includes("inox") ||
    lower.includes("bookmyshow")
  ) {
    categoryId = "cat-entertainment";
    cleanReason = merchant ? `Entertainment / Subscription (${merchant})` : "Entertainment";
  } else if (
    lower.includes("apollo") ||
    lower.includes("1mg") ||
    lower.includes("pharmacy") ||
    lower.includes("hospital") ||
    lower.includes("clinic")
  ) {
    categoryId = "cat-healthcare";
    cleanReason = merchant ? `Medical / Pharmacy (${merchant})` : "Healthcare";
  } else if (type === "income") {
    if (lower.includes("salary") || lower.includes("payroll")) {
      categoryId = "cat-salary";
      cleanReason = "Salary Credit";
    } else {
      categoryId = "cat-gift";
      cleanReason = merchant ? `Money received from ${merchant}` : "Received via UPI";
    }
  } else {
    // If it's a person's name or personal transfer
    if (merchant && merchant.length > 2) {
      cleanReason = `Payment to ${merchant}`;
    }
  }

  return {
    merchant: merchant || (type === "income" ? "Sender" : "Merchant"),
    categoryId,
    cleanReason,
    confidence: "heuristic",
  };
}

/**
 * Call Gemini Flash API to parse raw banking notification into structured transaction
 */
export async function categorizeWithGemini(
  description: string,
  partyName?: string | null,
  type: "expense" | "income" = "expense"
): Promise<AiCategorizationResult> {
  const apiKey = getStoredGeminiApiKey();

  if (!apiKey) {
    return heuristicParseAndCategorize(description, partyName, type);
  }

  const prompt = `You are a financial AI assistant parsing Indian banking notifications (SMS / PhonePe / GPay / Paytm).
Analyze this message:
"""
${description}
"""
Existing party name: "${partyName || ""}"
Transaction type: "${type}"

Available categories:
- cat-food: Food & Dining (Swiggy, Zomato, cafes, restaurants)
- cat-groceries: Groceries (Blinkit, Zepto, Instamart, supermarkets)
- cat-transport: Transportation (Uber, Ola, Rapido, Metro, Petrol/Fuel)
- cat-shopping: Shopping (Amazon, Flipkart, Myntra, apparel)
- cat-bills: Bills & Utilities (Electricity, Water, Mobile Recharge, Jio, Airtel, Wi-Fi)
- cat-entertainment: Entertainment (Netflix, Spotify, movies, gaming)
- cat-healthcare: Healthcare (Pharmacies, doctors, clinics)
- cat-salary: Salary
- cat-gift: Cash Gift / P2P Received
- cat-other-exp: Other Expense
- cat-other-inc: Other Income

Respond ONLY with a JSON object in this format:
{
  "merchant": "Clean vendor or person name (e.g. Swiggy, Yash Singha, Akash Kumar, Papa)",
  "categoryId": "one of the category IDs above",
  "cleanReason": "Short 3-5 word clean summary of transaction purpose"
}`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1,
        },
      }),
    });

    if (!res.ok) {
      console.warn("Gemini API call failed with status:", res.status);
      return heuristicParseAndCategorize(description, partyName, type);
    }

    const data = await res.json();
    const rawJson = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawJson) {
      return heuristicParseAndCategorize(description, partyName, type);
    }

    const parsed = JSON.parse(rawJson);
    return {
      merchant: parsed.merchant || partyName || "Merchant",
      categoryId: parsed.categoryId || (type === "expense" ? "cat-food" : "cat-other-inc"),
      cleanReason: parsed.cleanReason || description.slice(0, 50),
      confidence: "high",
    };
  } catch (error) {
    console.error("Gemini AI error:", error);
    return heuristicParseAndCategorize(description, partyName, type);
  }
}

/**
 * Bulk auto-categorize and enrich all transactions
 */
export async function autoEnrichPendingTransactions(
  transactions: Transaction[]
): Promise<number> {
  let updatedCount = 0;

  for (const tx of transactions) {
    if (tx.reviewStatus !== "confirmed") {
      const result = await categorizeWithGemini(tx.description, tx.partyName, tx.type);
      await db.transactions.update(tx.id, {
        partyName: result.merchant,
        categoryId: result.categoryId,
        description: tx.description, // keep raw SMS in description
        updatedAt: new Date().toISOString(),
      });
      updatedCount++;
    }
  }

  return updatedCount;
}

