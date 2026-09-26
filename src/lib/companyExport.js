// ─── Download all company data (POPIA access / leaving) ───────────────────────
// export_company_data() returns every company table; this packs it as a ZIP:
// company-data.json (everything) plus one CSV per table, formula-safe.
import { neutralizeFormula } from "./csv.js";

export function toCsv(rows) {
  if (!rows?.length) return "";
  const cols = [...new Set(rows.flatMap(r => Object.keys(r)))];
  const cell = v => {
    const s = neutralizeFormula(v !== null && typeof v === "object" ? JSON.stringify(v) : (v ?? ""));
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map(r => cols.map(c => cell(r[c])).join(","))].join("\r\n");
}

export async function buildCompanyZip(data) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  zip.file("company-data.json", JSON.stringify(data, null, 1));
  for (const [key, value] of Object.entries(data)) if (Array.isArray(value) && value.length) zip.file(`${key}.csv`, toCsv(value));
  zip.file(
    "README.txt",
    `All data held for ${data.company?.name || "your company"}, exported ${data.exported_at}.\r\ncompany-data.json has everything; each CSV is one table and opens in Excel.\r\n`,
  );
  return zip.generateAsync({ type: "blob" });
}
