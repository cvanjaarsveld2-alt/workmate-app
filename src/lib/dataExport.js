// ─── Data Export (POPIA + Accountant handoff) ─────────────────────────────────
// Settings → "Export my data" → Excel workbook with one sheet per entity.
// Uses ExcelJS (already in package.json).
// ─────────────────────────────────────────────────────────────────────────────

export async function exportAllData(data, userId) {
  const ExcelJS = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "PowerMate";
  wb.created = new Date();

  const headerStyle = { font: { bold: true, color: { argb: "FFFFFFFF" } }, fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FF8B1A1A" } } };

  function addSheet(name, columns, rows) {
    const ws = wb.addWorksheet(name);
    ws.columns = columns.map(c => ({ header: c.header, key: c.key, width: c.width || 18 }));
    ws.getRow(1).eachCell(cell => { cell.font = headerStyle.font; cell.fill = headerStyle.fill; });
    rows.forEach(r => ws.addRow(r));
    return ws;
  }

  // Clients
  const clients = (data.clients || []).filter(c => c.user_id === userId);
  addSheet("Clients", [
    { header: "Company", key: "company", width: 25 }, { header: "Division", key: "division" },
    { header: "Contact", key: "contact" }, { header: "Phone", key: "phone" },
    { header: "Email", key: "email" }, { header: "Location", key: "location" },
    { header: "Stage", key: "stage" }, { header: "Created", key: "created_at", width: 22 },
  ], clients);

  // Contacts
  const contacts = (data.contacts || []).filter(c => c.user_id === userId);
  addSheet("Contacts", [
    { header: "Name", key: "name", width: 22 }, { header: "Company", key: "company" },
    { header: "Title", key: "title" }, { header: "Email", key: "email" },
    { header: "Phone", key: "phone" }, { header: "Status", key: "status" },
    { header: "Met At", key: "met_at" }, { header: "Created", key: "created_at", width: 22 },
  ], contacts);

  // Follow-ups
  const followups = (data.followups || []).filter(f => f.user_id === userId);
  addSheet("Follow-ups", [
    { header: "Title", key: "title", width: 30 }, { header: "Client", key: "client" },
    { header: "Date", key: "date" }, { header: "Time", key: "time" },
    { header: "Completed", key: "completed" }, { header: "Notes", key: "notes", width: 40 },
    { header: "Created", key: "created_at", width: 22 },
  ], followups);

  // Quotes
  const quotes = (data.quotes || []).filter(q => q.user_id === userId);
  addSheet("Quotes", [
    { header: "Client", key: "client_name", width: 25 }, { header: "Description", key: "description", width: 35 },
    { header: "Value (R)", key: "value" }, { header: "Status", key: "status" },
    { header: "Sent Date", key: "sent_date" }, { header: "Created", key: "created_at", width: 22 },
  ], quotes);

  // Leads
  const leads = (data.leads || []).filter(l => l.user_id === userId);
  addSheet("Leads", [
    { header: "Title", key: "title", width: 25 }, { header: "Client", key: "client_name" },
    { header: "Stage", key: "stage" }, { header: "Value (R)", key: "estimated_value" },
    { header: "Lead Date", key: "lead_date" }, { header: "Created", key: "created_at", width: 22 },
  ], leads);

  // Notes
  const notes = (data.notes || []).filter(n => n.user_id === userId);
  addSheet("Notes", [
    { header: "Client", key: "client", width: 22 }, { header: "Note", key: "note", width: 50 },
    { header: "Urgency", key: "urgency" }, { header: "Resolve By", key: "resolve_by" },
    { header: "Resolved", key: "resolved" }, { header: "Created", key: "created_at", width: 22 },
  ], notes);

  // Equipment
  const equipment = (data.equipment || []).filter(e => e.user_id === userId);
  addSheet("Equipment", [
    { header: "Name", key: "name", width: 22 }, { header: "Type", key: "type" },
    { header: "Make", key: "make" }, { header: "Model", key: "model" },
    { header: "Serial", key: "serial" }, { header: "Client", key: "client" },
    { header: "Service Due", key: "service_due" }, { header: "Created", key: "created_at", width: 22 },
  ], equipment);

  // Expenses
  const expenses = (data.expenses || []).filter(e => e.user_id === userId);
  addSheet("Expenses", [
    { header: "Date", key: "expense_date" }, { header: "Vendor", key: "vendor", width: 22 },
    { header: "Amount", key: "amount" }, { header: "Currency", key: "currency" },
    { header: "ZAR Amount", key: "amount_zar" }, { header: "Category", key: "category" },
    { header: "Payment", key: "payment_method" }, { header: "Notes", key: "notes", width: 30 },
  ], expenses);

  // Generate and download
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const filename = `PowerMate_Export_${new Date().toISOString().slice(0, 10)}.xlsx`;

  if (navigator.share && navigator.canShare) {
    try {
      const file = new File([blob], filename, { type: blob.type });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "PowerMate Data Export" });
        return "shared";
      }
    } catch {}
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return "downloaded";
}
