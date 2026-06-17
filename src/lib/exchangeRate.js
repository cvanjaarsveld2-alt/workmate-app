// ─── Exchange Rate (Frankfurter / ECB) ───────────────────────────────────────
// Converts foreign-currency expense amounts to ZAR using the European Central
// Bank end-of-day rate for a given date. Handles weekends/holidays by walking
// back up to 5 days. Caches in localStorage to avoid hammering the API.
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_KEY     = "powermate_fx_cache_v1";
const CACHE_MAX_AGE = 1000 * 60 * 60 * 24 * 7; // 7 days
const API_BASE      = "https://api.frankfurter.app";

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

  // All attempts failed (offline, unsupported currency, etc).
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
