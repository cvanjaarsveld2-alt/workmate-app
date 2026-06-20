// ─── Backup Export ────────────────────────────────────────────────────────────
// Exports all PowerMate data as a ZIP containing per-entity CSVs + a JSON master.
// Use this regularly — your data lives in Supabase but a local backup is safer.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from "react";
import { Download, Database, CheckCircle2, AlertTriangle, Share2 } from "lucide-react";
import JSZip from "jszip";
import { Card, Btn } from "./ui";

const LAST_BACKUP_KEY = "powermate_last_backup";
const BACKUP_REMINDER_DAYS = 30;

function todayISO()  { return new Date().toISOString().slice(0, 10); }
function nowStamp()  { return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19); }

// ─── CSV helpers ─────────────────────────────────────────────────────────────
function csvEscape(val) {
  if (val === null || val === undefined) return "";
  let str = String(val);
  // Convert objects/arrays to JSON strings
  if (typeof val === "object") str = JSON.stringify(val);
  str = str.replace(/"/g, '""');
  return /[,"\n\r]/.test(str) ? `"${str}"` : str;
}

function toCSV(rows, columns) {
  if (!rows || rows.length === 0) return columns.join(",") + "\n";
  const header = columns.join(",");
  const body = rows.map(r => columns.map(c => csvEscape(r[c])).join(",")).join("\n");
  return "\uFEFF" + header + "\n" + body + "\n"; // BOM for Excel
}

// ─── Column definitions per entity ───────────────────────────────────────────
const COLUMNS = {
  clients: [
    "id", "company", "branch", "contact", "phone", "email", "stage",
    "location", "notes", "created_at", "sync_status",
  ],
  contacts: [
    "id", "name", "company", "title", "email", "phone", "met_at", "met_date",
    "notes", "card_photo_url", "status", "client_id", "created_at", "updated_at",
  ],
  followups: [
    "id", "client_id", "client", "branch", "title", "date", "time",
    "reminder", "notes", "completed", "created_at",
  ],
  quotes: [
    "id", "client_name", "description", "value", "status", "sent_date", "created_at",
  ],
  notes: [
    "id", "client", "note", "urgency", "resolve_by", "resolved", "resolved_at",
    "linked_contact_ids", "media", "created_at",
  ],
  equipment: [
    "id", "name", "type", "make", "model", "serial", "location", "client",
    "service_due", "notes", "media", "created_at",
  ],
  expenses: [
    "id", "vendor", "amount", "vat_amount", "currency", "amount_zar",
    "exchange_rate", "rate_date", "rate_source",
    "expense_date", "expense_time", "category", "payment_method", "notes",
    "receipt_url", "payment_slip_url", "status", "created_at",
  ],
};

// ─── Main backup export ──────────────────────────────────────────────────────
async function generateBackup(data) {
  const zip = new JSZip();
  const stamp = nowStamp();

  // Add one CSV per entity
  for (const [entity, cols] of Object.entries(COLUMNS)) {
    const rows = data[entity] || [];
    zip.file(`${entity}.csv`, toCSV(rows, cols));
  }

  // Add a JSON master with everything (perfect for restore)
  const master = {
    exported_at: new Date().toISOString(),
    app: "PowerMate",
    company: "Power Works (Pty) Ltd",
    version: 1,
    counts: {
      clients:   (data.clients   || []).length,
      contacts:  (data.contacts  || []).length,
      followups: (data.followups || []).length,
      quotes:    (data.quotes    || []).length,
      notes:     (data.notes     || []).length,
      equipment: (data.equipment || []).length,
      expenses:  (data.expenses  || []).length,
    },
    data: {
      clients:   data.clients   || [],
      contacts:  data.contacts  || [],
      followups: data.followups || [],
      quotes:    data.quotes    || [],
      notes:     data.notes     || [],
      equipment: data.equipment || [],
      expenses:  data.expenses  || [],
    },
  };
  zip.file("powermate_master.json", JSON.stringify(master, null, 2));

  // Add a README for future-you
  const readme = `POWERMATE BACKUP
================
Exported: ${new Date().toLocaleString("en-GB")}
Company:  Power Works (Pty) Ltd

WHAT'S IN THIS ZIP
------------------
CSV files (open in Excel/Numbers/Google Sheets):
  - clients.csv      Client companies and branches
  - contacts.csv     People you've met (leads + converted)
  - followups.csv    Tasks and follow-up reminders
  - quotes.csv       Quotes sent and their status
  - notes.csv        Field notes with urgency tracking
  - equipment.csv    Registered equipment and service schedules

JSON master (for full restore):
  - powermate_master.json  Complete structured backup of everything

HOW TO USE
----------
- For sharing with accountant/management: open the CSV files
- For restoring after data loss: keep the JSON file safe
- Store these somewhere off your phone (Google Drive, OneDrive, email to yourself)
- Make a new backup at least monthly

SUPPORT
-------
If you need to restore from this backup, contact your PowerMate admin.
The JSON file is human-readable and can be re-imported into the system.
`;
  zip.file("README.txt", readme);

  // Generate the ZIP blob
  const blob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  const filename = `PowerMate_Backup_${stamp}.zip`;

  // Record the backup time
  try {
    localStorage.setItem(LAST_BACKUP_KEY, new Date().toISOString());
  } catch {}

  return { blob, filename, counts: master.counts };
}

// Trigger a plain browser download (desktop fallback / explicit "Save to phone").
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ─── Component ───────────────────────────────────────────────────────────────
export function BackupExport({ data }) {
  const [exporting, setExporting] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [lastBackup, setLastBackup] = useState(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(LAST_BACKUP_KEY);
      if (stored) setLastBackup(new Date(stored));
    } catch {}
  }, []);

  async function handleExport(mode) {
    setExporting(true);
    try {
      const { blob, filename, counts } = await generateBackup(data);
      setLastResult(counts);
      setLastBackup(new Date());

      if (mode === "share") {
        const file = new File([blob], filename, { type: "application/zip" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              title: "PowerMate Backup",
              text: `PowerMate backup — ${new Date().toLocaleDateString("en-GB")}`,
              files: [file],
            });
          } catch (e) {
            // User cancelled the share sheet — not an error, don't alert.
            if (e.name !== "AbortError") {
              console.warn("Share failed, falling back to download:", e);
              downloadBlob(blob, filename);
            }
          }
        } else {
          // No Web Share file support (most desktop browsers) — just download.
          downloadBlob(blob, filename);
        }
      } else {
        downloadBlob(blob, filename);
      }
    } catch (e) {
      console.error("Backup failed:", e);
      alert("Backup failed: " + (e.message || "unknown error"));
    }
    setExporting(false);
  }

  const daysSinceBackup = lastBackup
    ? Math.floor((Date.now() - lastBackup.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const isStale = daysSinceBackup === null || daysSinceBackup >= BACKUP_REMINDER_DAYS;

  const totalRows =
    (data.clients   || []).length +
    (data.contacts  || []).length +
    (data.followups || []).length +
    (data.quotes    || []).length +
    (data.notes     || []).length +
    (data.equipment || []).length;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Database size={16} style={{ color: "#8B1A1A" }} />
        <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">Data Backup</p>
      </div>
      <p className="text-sm text-slate-500">
        Save all your PowerMate data as a ZIP file. Open the CSVs in Excel,
        or keep the JSON for full restore.
        <strong> Share it to Google Drive, iCloud, or email it to yourself</strong> — a
        backup that only lives on this phone isn't really a backup.
      </p>

      {/* Status indicator */}
      <div className={`rounded-xl p-3 border ${
        isStale
          ? "bg-amber-50 border-amber-200"
          : "bg-green-50 border-green-200"
      }`}>
        <div className="flex items-start gap-2">
          {isStale
            ? <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
            : <CheckCircle2 size={16} className="text-green-600 shrink-0 mt-0.5" />}
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-bold ${isStale ? "text-amber-700" : "text-green-700"}`}>
              {lastBackup
                ? daysSinceBackup === 0
                  ? "Backed up today"
                  : daysSinceBackup === 1
                    ? "Backed up yesterday"
                    : `Last backup: ${daysSinceBackup} days ago`
                : "No backup yet"}
            </p>
            <p className={`text-xs ${isStale ? "text-amber-600" : "text-green-600"} mt-0.5`}>
              {isStale
                ? "Recommend backing up monthly"
                : "Next reminder in " + (BACKUP_REMINDER_DAYS - daysSinceBackup) + " days"}
            </p>
          </div>
        </div>
      </div>

      <Btn variant="solid" className="w-full" onClick={() => handleExport("share")} disabled={exporting}>
        <Share2 size={15} />
        {exporting ? "Generating backup…" : `Share Backup to Drive/Email (${totalRows} items)`}
      </Btn>
      <Btn variant="secondary" className="w-full" onClick={() => handleExport("download")} disabled={exporting}>
        <Download size={15} />
        {exporting ? "Generating backup…" : "Just download to this phone"}
      </Btn>
      <p className="text-xs text-slate-400 text-center -mt-1">
        Share opens your device's share sheet — pick Google Drive, iCloud, Mail, or WhatsApp.
      </p>

      {lastResult && !exporting && (
        <div className="rounded-xl bg-slate-50 p-3 text-xs space-y-1">
          <p className="font-bold text-slate-700 mb-1">✓ Last backup contained:</p>
          {Object.entries(lastResult).map(([k, v]) => (
            <div key={k} className="flex justify-between">
              <span className="text-slate-500 capitalize">{k}:</span>
              <span className="font-bold text-slate-700">{v}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
