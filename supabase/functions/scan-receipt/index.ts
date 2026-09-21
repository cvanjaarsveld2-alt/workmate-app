// ═══════════════════════════════════════════════════════════════════════════
// Supabase Edge Function: scan-receipt
// Scans till slips and card payment slips using OpenAI gpt-4o-mini vision.
// ═══════════════════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CATEGORIES = [
  "Fuel", "Accommodation", "Meals & Entertainment", "Tools & Equipment",
  "Parts & Materials", "Travel", "Office", "Other",
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { imageBase64, slipType = "till" } = await req.json();
    if (!imageBase64) {
      return new Response(JSON.stringify({ error: "No image provided" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: "OpenAI key not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tillPrompt = `You are an expert at reading receipts and till slips (including faded thermal paper).
Extract the following from this receipt image and return ONLY valid JSON, no markdown, no explanation:
{
  "vendor": "store/company name at top of receipt, or empty string",
  "amount": "the TOTAL amount paid as a number only, no currency symbol, e.g. 245.50 (the grand total, not subtotal)",
  "vat_amount": "the VAT/tax amount as a number only, or 0 if not shown",
  "currency": "3-letter currency code based on symbol/text, e.g. ZAR for R, USD for $, GBP for £. Default ZAR if unclear",
  "expense_date": "date in YYYY-MM-DD format, or empty string if unreadable",
  "expense_time": "time in HH:MM 24-hour format, or empty string",
  "category": "best-fit category from this exact list: ${CATEGORIES.join(", ")}",
  "payment_method": "Card, Cash, or Account based on the receipt, default Card"
}
Rules:
- amount must be the final TOTAL including VAT
- if you see "TOTAL" use that figure
- for a fuel station choose Fuel; restaurant/cafe choose Meals & Entertainment; hardware/tools choose Tools & Equipment; hotel/lodge choose Accommodation
- return numbers as plain numbers, not strings with symbols`;

    const paymentPrompt = `This is a card payment slip from South Africa (Visa/Mastercard/Speedpoint approval).
Extract the following and return ONLY valid JSON:
{
  "amount": "the amount paid as a number only, no currency symbol",
  "currency": "3-letter code, default ZAR",
  "expense_date": "date in YYYY-MM-DD format, or empty string",
  "expense_time": "time in HH:MM 24-hour format, or empty string",
  "approved": true if the slip shows APPROVED or AUTHORISED, false otherwise
}
Return numbers as plain numbers.`;

    const prompt = slipType === "payment" ? paymentPrompt : tillPrompt;

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: imageBase64, detail: "high" } },
          ],
        }],
        max_tokens: 400,
        temperature: 0.1,
      }),
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      console.error("OpenAI error:", errText);
      return new Response(JSON.stringify({ error: "AI scan failed", detail: errText }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await openaiRes.json();
    let content = aiData.choices?.[0]?.message?.content || "{}";
    content = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = {};
    }

    const toNum = (v) => {
      if (typeof v === "number") return v;
      if (!v) return 0;
      const n = parseFloat(String(v).replace(/[^0-9.]/g, ""));
      return isNaN(n) ? 0 : n;
    };

    const result = slipType === "payment"
      ? {
          amount:       toNum(parsed.amount),
          currency:     parsed.currency || "ZAR",
          expense_date: parsed.expense_date || "",
          expense_time: parsed.expense_time || "",
          approved:     !!parsed.approved,
        }
      : {
          vendor:         parsed.vendor || "",
          amount:         toNum(parsed.amount),
          vat_amount:     toNum(parsed.vat_amount),
          currency:       parsed.currency || "ZAR",
          expense_date:   parsed.expense_date || "",
          expense_time:   parsed.expense_time || "",
          category:       CATEGORIES.includes(parsed.category) ? parsed.category : "Other",
          payment_method: ["Card", "Cash", "Account"].includes(parsed.payment_method) ? parsed.payment_method : "Card",
        };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("Function error:", e);
    return new Response(JSON.stringify({ error: e.message || "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});