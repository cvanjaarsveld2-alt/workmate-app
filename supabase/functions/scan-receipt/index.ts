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

    // The browser only sends the compressed image to this authenticated Edge Function.
    // Storage is deliberately handled server-side so iOS/WebKit never has to upload
    // the receipt directly to Supabase Storage.
    const authHeader = req.headers.get("Authorization") || "";
    // IMPORTANT: match the actual whitespace after "Bearer".
    // The previous deployed build contained /^Bearer\\s+/ which matched a literal
    // backslash+s instead of whitespace, so the JWT was never stripped correctly.
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const userId = (() => {
      try {
        const payload = jwt.split(".")[1];
        if (!payload) return "";
        const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
        const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
        return JSON.parse(atob(padded)).sub || "";
      } catch {
        return "";
      }
    })();

    if (!userId) {
      return new Response(JSON.stringify({ error: "Authenticated user could not be identified" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error: "Supabase server configuration is incomplete" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: "OpenAI key not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Persist the receipt before calling AI. This means a failed AI call can never
    // make the user's photo disappear.
    const comma = imageBase64.indexOf(",");
    const base64Payload = comma >= 0 ? imageBase64.slice(comma + 1) : imageBase64;
    const binary = atob(base64Payload);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const subfolder = slipType === "payment" ? "payment-slips" : "receipts";
    const receiptPath = `receipts/${userId}/${subfolder}/${crypto.randomUUID()}.jpg`;
    const storageUrl = `${SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/receipts/${receiptPath}`;

    const storageRes = await fetch(storageUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type": "image/jpeg",
        "x-upsert": "false",
      },
      body: bytes,
    });

    if (!storageRes.ok) {
      const storageText = await storageRes.text();
      console.error("Receipt storage error:", storageRes.status, storageText);
      return new Response(JSON.stringify({ error: "Receipt could not be saved", detail: storageText }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
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
      return new Response(JSON.stringify({ error: "AI scan failed", detail: errText, receipt_url: receiptPath, scan_failed: true }), {
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
          receipt_url:  receiptPath,
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
          receipt_url:     receiptPath,
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