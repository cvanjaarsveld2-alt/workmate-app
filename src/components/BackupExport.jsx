// ─── Backup Export ────────────────────────────────────────────────────────────
// Exports all PowerMate data as a ZIP containing per-entity CSVs + a JSON master.
// Use this regularly — your data lives in Supabase but a local backup is safer.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from "react";
import { Download, Database, CheckCircle2, AlertTriangle } from "lucide-react";
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
    },
    data: {
      clients:   data.clients   || [],
      contacts:  data.contacts  || [],
      followups: data.followups || [],
      quotes:    data.quotes    || [],
      notes:     data.notes     || [],
      equipment: data.equipment || [],
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

  // Trigger download
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `PowerMate_Backup_${stamp}.zip`;
  a.click();
  URL.revokeObjectURL(url);

  // Record the backup time
  try {
    localStorage.setItem(LAST_BACKUP_KEY, new Date().toISOString());
  } catch {}

  return master.counts;
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

  async function handleExport() {
    setExporting(true);
    try {
      const counts = await generateBackup(data);
      setLastResult(counts);
      setLastBackup(new Date());
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
        Download all your PowerMate data as a ZIP file. Open the CSVs in Excel,
        or keep the JSON for full restore. Store off-device (Google Drive, email to yourself).
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

      <Btn variant={isStale ? "solid" : "secondary"} className="w-full" onClick={handleExport} disabled={exporting}>
        <Download size={15} />
        {exporting ? "Generating backup…" : `Download Backup (${totalRows} items)`}
      </Btn>

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
