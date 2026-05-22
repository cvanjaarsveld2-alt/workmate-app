// ═══════════════════════════════════════════════════════════════════════════
// ReportExport.jsx
// ───────────────────────────────────────────────────────────────────────────
// Management report generator for PowerMate.
// Exports a summary report as CSV — opens in Excel, Google Sheets, Numbers.
// Add to MoreScreen: <ReportExport data={data} />
// ═══════════════════════════════════════════════════════════════════════════

import React, { useState } from "react";
import { FileText, Download, Calendar } from "lucide-react";

const BRAND = { primary: "#8B1A1A", light: "#F7F3F3" };

function todayISO() { return new Date().toISOString().slice(0, 10); }
function formatCurrency(v) { return "R " + parseFloat(v || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2 }); }
function smartDate(ds) {
  if (!ds) return "";
  const d = new Date(ds + "T12:00:00");
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// ─── CSV Helpers ─────────────────────────────────────────────────────────────
function csvEscape(val) {
  if (val === null || val === undefined) return "";
  const str = String(val).replace(/"/g, '""');
  return str.includes(",") || str.includes('"') || str.includes("\n") ? `"${str}"` : str;
}

function rowToCsv(row) {
  return row.map(csvEscape).join(",");
}

function downloadCsv(filename, rows) {
  const csv = rows.map(rowToCsv).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }); // BOM for Excel
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Report generators ────────────────────────────────────────────────────────
function generateFullReport(data, dateRange) {
  const today = todayISO();
  const { clients = [], followups = [], quotes = [], notes = [], equipment = [] } = data;
  const rows = [];

  // ── HEADER ──
  rows.push(["POWERMATE MANAGEMENT REPORT"]);
  rows.push(["Power Works (Pty) Ltd"]);
  rows.push([`Generated: ${smartDate(today)}`]);
  rows.push([`Period: ${dateRange}`]);
  rows.push([]);

  // ── PIPELINE SUMMARY ──
  rows.push(["═══ PIPELINE SUMMARY ═══"]);
  rows.push(["Stage", "Count", "% of Total"]);
  const stages = ["New Lead", "Contacted", "Quoted", "Active", "Won", "Lost"];
  stages.forEach(s => {
    const count = clients.filter(c => (c.stage || "New Lead") === s).length;
    const pct = clients.length > 0 ? ((count / clients.length) * 100).toFixed(1) + "%" : "0%";
    rows.push([s, count, pct]);
  });
  rows.push(["TOTAL", clients.length, "100%"]);
  rows.push([]);

  // ── QUOTES SUMMARY ──
  const accepted = quotes.filter(q => q.status === "Accepted");
  const pending = quotes.filter(q => q.status === "Pending");
  const rejected = quotes.filter(q => q.status === "Rejected");
  const wonValue = accepted.reduce((s, q) => s + parseFloat(q.value || 0), 0);
  const pendingValue = pending.reduce((s, q) => s + parseFloat(q.value || 0), 0);

  rows.push(["═══ QUOTES SUMMARY ═══"]);
  rows.push(["Status", "Count", "Total Value"]);
  rows.push(["Accepted / Won", accepted.length, formatCurrency(wonValue)]);
  rows.push(["Pending", pending.length, formatCurrency(pendingValue)]);
  rows.push(["Rejected", rejected.length, "—"]);
  rows.push(["Expired", quotes.filter(q => q.status === "Expired").length, "—"]);
  rows.push(["Win Rate", clients.length > 0 ? ((clients.filter(c => c.stage === "Won").length / clients.length * 100).toFixed(1) + "%") : "0%", ""]);
  rows.push([]);

  // ── FOLLOW-UPS SUMMARY ──
  const overdueFU = followups.filter(f => f.date < today && !f.completed);
  const doneFU = followups.filter(f => f.completed);
  rows.push(["═══ FOLLOW-UPS SUMMARY ═══"]);
  rows.push(["Category", "Count"]);
  rows.push(["Overdue", overdueFU.length]);
  rows.push(["Pending", followups.filter(f => !f.completed && f.date >= today).length]);
  rows.push(["Completed", doneFU.length]);
  rows.push([]);

  // ── CLIENT LIST ──
  rows.push(["═══ CLIENT LIST ═══"]);
  rows.push(["Company", "Branch", "Stage", "Contact", "Phone", "Email", "Location", "Notes"]);
  clients
    .sort((a, b) => (a.company || "").localeCompare(b.company || ""))
    .forEach(c => {
      rows.push([
        c.company || "",
        c.branch || "",
        c.stage || "New Lead",
        c.contact || "",
        c.phone || "",
        c.email || "",
        c.location || "",
        (c.notes || "").replace(/\n/g, " ").slice(0, 200),
      ]);
    });
  rows.push([]);

  // ── PENDING FOLLOW-UPS ──
  rows.push(["═══ PENDING FOLLOW-UPS ═══"]);
  rows.push(["Client", "Title", "Due Date", "Time", "Overdue?", "Notes"]);
  followups
    .filter(f => !f.completed)
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach(f => {
      rows.push([
        f.client || "",
        f.title || "",
        smartDate(f.date),
        f.time || "",
        f.date < today ? "YES" : "No",
        (f.notes || "").replace(/\n/g, " ").slice(0, 200),
      ]);
    });
  rows.push([]);

  // ── QUOTES DETAIL ──
  rows.push(["═══ QUOTES DETAIL ═══"]);
  rows.push(["Client", "Description", "Value", "Status", "Date Sent"]);
  quotes
    .sort((a, b) => (b.sent_date || "").localeCompare(a.sent_date || ""))
    .forEach(q => {
      rows.push([
        q.client_name || "",
        (q.description || "").replace(/\n/g, " ").slice(0, 300),
        formatCurrency(q.value),
        q.status || "Pending",
        smartDate(q.sent_date),
      ]);
    });
  rows.push([]);

  // ── EQUIPMENT DUE FOR SERVICE ──
  const equipmentDue = equipment.filter(e => e.service_due);
  if (equipmentDue.length > 0) {
    rows.push(["═══ EQUIPMENT SERVICE STATUS ═══"]);
    rows.push(["Name", "Make/Model", "Serial", "Location", "Client", "Service Due", "Status"]);
    equipmentDue
      .sort((a, b) => (a.service_due || "").localeCompare(b.service_due || ""))
      .forEach(eq => {
        const due = eq.service_due ? new Date(eq.service_due + "T12:00:00") : null;
        const now = new Date(today + "T12:00:00");
        const diffDays = due ? Math.round((due - now) / 86400000) : null;
        const status = diffDays === null ? "No date" : diffDays < 0 ? "OVERDUE" : diffDays <= 7 ? "Due soon" : "OK";
        rows.push([
          eq.name || "",
          [eq.make, eq.model].filter(Boolean).join(" "),
          eq.serial || "",
          eq.location || "",
          eq.client || "",
          smartDate(eq.service_due),
          status,
        ]);
      });
    rows.push([]);
  }

  // ── UNRESOLVED NOTES ──
  const openNotes = notes.filter(n => !n.resolved);
  if (openNotes.length > 0) {
    rows.push(["═══ UNRESOLVED FIELD NOTES ═══"]);
    rows.push(["Client", "Urgency", "Note", "Resolve By", "Created"]);
    openNotes
      .sort((a, b) => {
        const order = { Critical: 0, Urgent: 1, Normal: 2 };
        return (order[a.urgency] || 2) - (order[b.urgency] || 2);
      })
      .forEach(n => {
        rows.push([
          n.client || "General",
          n.urgency || "Normal",
          (n.note || "").replace(/\n/g, " ").slice(0, 300),
          smartDate(n.resolve_by),
          smartDate(n.created_at?.slice(0, 10)),
        ]);
      });
  }

  return rows;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function ReportExport({ data }) {
  const [exporting, setExporting] = useState(false);
  const [lastExport, setLastExport] = useState(null);

  async function exportReport(type) {
    setExporting(true);
    try {
      const today = todayISO();
      const filename = `PowerMate_Report_${today}.csv`;

      let rows;
      let dateRange;

      if (type === "full") {
        dateRange = "All time";
        rows = generateFullReport(data, dateRange);
      } else if (type === "month") {
        const monthStart = today.slice(0, 7) + "-01";
        dateRange = `${smartDate(monthStart)} — ${smartDate(today)}`;
        // Filter data to current month
        const monthData = {
          ...data,
          followups: (data.followups || []).filter(f => f.date >= monthStart),
          quotes: (data.quotes || []).filter(q => (q.sent_date || q.created_at || "").slice(0, 7) === today.slice(0, 7)),
          notes: (data.notes || []).filter(n => (n.created_at || "").slice(0, 7) === today.slice(0, 7)),
        };
        rows = generateFullReport(monthData, dateRange);
      } else {
        // Overdue / urgent items only
        dateRange = "Overdue & Urgent items";
        const urgentData = {
          ...data,
          followups: (data.followups || []).filter(f => f.date < today && !f.completed),
          quotes: (data.quotes || []).filter(q => q.status === "Pending"),
          notes: (data.notes || []).filter(n => !n.resolved && (n.urgency === "Critical" || n.urgency === "Urgent")),
        };
        rows = generateFullReport(urgentData, dateRange);
      }

      downloadCsv(filename, rows);
      setLastExport(new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
    } catch (e) {
      console.error("Export failed:", e);
      alert("Export failed. Please try again.");
    }
    setExporting(false);
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <FileText size={16} style={{ color: BRAND.primary }} />
        <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">Export Report</p>
      </div>
      <p className="text-sm text-slate-500">
        Generate a report that opens in Excel or Google Sheets — ready to send to management.
      </p>

      <div className="space-y-2">
        <button onClick={() => exportReport("full")} disabled={exporting}
          className="w-full flex items-center justify-between rounded-xl border-2 border-slate-100 p-3.5 text-left hover:border-red-200 transition-colors disabled:opacity-40 min-h-[56px]">
          <div>
            <p className="text-sm font-bold text-slate-800">Full Report</p>
            <p className="text-xs text-slate-400">All clients, quotes, follow-ups, equipment</p>
          </div>
          <Download size={16} className="text-slate-400 shrink-0" />
        </button>

        <button onClick={() => exportReport("month")} disabled={exporting}
          className="w-full flex items-center justify-between rounded-xl border-2 border-slate-100 p-3.5 text-left hover:border-red-200 transition-colors disabled:opacity-40 min-h-[56px]">
          <div>
            <p className="text-sm font-bold text-slate-800">This Month</p>
            <p className="text-xs text-slate-400">Activity from the current month only</p>
          </div>
          <Download size={16} className="text-slate-400 shrink-0" />
        </button>

        <button onClick={() => exportReport("urgent")} disabled={exporting}
          className="w-full flex items-center justify-between rounded-xl border-2 border-red-100 p-3.5 text-left hover:border-red-300 transition-colors disabled:opacity-40 min-h-[56px]">
          <div>
            <p className="text-sm font-bold text-red-700">Overdue & Urgent</p>
            <p className="text-xs text-red-400">Items needing immediate attention</p>
          </div>
          <Download size={16} className="text-red-400 shrink-0" />
        </button>
      </div>

      {exporting && (
        <p className="text-xs text-slate-400 text-center">Generating report…</p>
      )}
      {lastExport && !exporting && (
        <p className="text-xs text-green-600 text-center font-medium">✓ Exported at {lastExport} — check your Downloads folder</p>
      )}
    </div>
  );
}
