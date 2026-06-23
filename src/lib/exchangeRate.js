// ─── Exchange Rate (Frankfurter / ECB, with paid historical fallback) ───────
// Converts foreign-currency expense amounts to ZAR using the European Central
// Bank end-of-day rate for a given date — free, no key, and the strongest
// "official" source for the ~30 major currencies it covers. For currencies
// ECB doesn't track (Cedi, Naira, Kenyan Shilling, etc) or as a backfill for
// historical accuracy, falls back to a paid Edge Function backed by
// exchangerate-api.com's historical-data endpoint.
// Caches in localStorage to avoid hammering either API.
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_KEY     = "powermate_fx_cache_v1";
const CACHE_MAX_AGE = 1000 * 60 * 60 * 24 * 7; // 7 days
const API_BASE      = "https://api.frankfurter.app";
const HISTORICAL_FUNCTION_URL = "https://hrqzqyfvbfzrfnuxovvr.supabase.co/functions/v1/historical-rate";

function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveCache(cache) {
  try {
    // Prune anything older than the max age
    const now = Date.now();
    const cleaned = {};
    for (const k in cache) {
      if (cache[k]?.fetchedAt && now - cache[k].fetchedAt < CACHE_MAX_AGE) {
        cleaned[k] = cache[k];
      }
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(cleaned));
  } catch {}
}

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

// Walk back N days from an ISO date.
function shiftDate(iso, days) {
  const d = new Date(iso + "T12:00:00");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Call the paid historical-rate Edge Function (exchangerate-api.com) for
// currencies ECB doesn't cover, or dates ECB couldn't resolve. Returns
// { rate, rateDate, source } or null on any failure — never throws, so a
// missing/expired API key degrades to "no auto rate" rather than breaking
// the save flow.
async function getHistoricalRateFallback(from, date) {
  try {
    const res = await fetch(HISTORICAL_FUNCTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from, date }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (json.error) {
      console.warn("[exchangeRate] Historical fallback failed:", json.error, json.detail);
      return null;
    }
    return { rate: json.rate, rateDate: json.rateDate, source: json.source };
  } catch (e) {
    console.warn("[exchangeRate] Historical fallback network error:", e.message);
    return null;
  }
}

/**
 * Get the rate for converting `from` → ZAR on or before `date`.
 * Returns { rate, rateDate, source } or null if it can't fetch.
 * Walks back up to 5 days for weekend/holiday gaps.
 */
export async function getRateToZAR(from, date) {
  if (!from || from === "ZAR") {
    return { rate: 1, rateDate: date || isoToday(), source: "n/a" };
  }
  const targetDate = (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) ? date : isoToday();

  const cache = loadCache();
  const cacheKey = `${from}-ZAR-${targetDate}`;
  if (cache[cacheKey]) return cache[cacheKey].data;

  // Try the target date, then walk back up to 5 days (weekends/holidays)
  for (let i = 0; i < 6; i++) {
    const tryDate = shiftDate(targetDate, -i);
    try {
      const url = `${API_BASE}/${tryDate}?from=${encodeURIComponent(from)}&to=ZAR`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const json = await res.json();
      const rate = json?.rates?.ZAR;
      if (typeof rate === "number" && rate > 0) {
        const result = {
          rate,
          rateDate: json.date || tryDate,
          source: "ECB (Frankfurter)",
        };
        cache[cacheKey] = { data: result, fetchedAt: Date.now() };
        saveCache(cache);
        return result;
      }
    } catch (e) {
      // Network error — try the next day back
    }
  }

  // ECB/Frankfurter doesn't have this currency or date — fall back to the
  // paid historical-rate source, which has genuine accuracy for the EXACT
  // requested date rather than approximating with "today's rate."
  const fallback = await getHistoricalRateFallback(from, targetDate);
  if (fallback) {
    cache[cacheKey] = { data: fallback, fetchedAt: Date.now() };
    saveCache(cache);
    return fallback;
  }

  // All attempts failed (offline, unsupported currency, no API key set, etc).
  // Fall back to "today" if available, else give up cleanly.
  if (from !== "ZAR" && targetDate !== isoToday()) {
    const todayResult = await getRateToZAR(from, isoToday());
    if (todayResult) return todayResult;
  }
  return null;
}

/** Convert an amount, returning { zar, rate, rateDate, source } or null. */
export async function convertToZAR(amount, from, date) {
  const n = parseFloat(amount);
  if (isNaN(n) || n <= 0) return null;
  if (!from || from === "ZAR") {
    return { zar: n, rate: 1, rateDate: date || isoToday(), source: "n/a" };
  }
  const r = await getRateToZAR(from, date);
  if (!r) return null;
  return {
    zar: Math.round(n * r.rate * 100) / 100,
    rate: r.rate,
    rateDate: r.rateDate,
    source: r.source,
  };
}
