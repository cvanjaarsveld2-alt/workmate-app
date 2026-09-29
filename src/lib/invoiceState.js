// ─── Invoice states ───────────────────────────────────────────────────────────
// One reading of an invoice's status for every screen, report and export,
// matching the server (private.invoice_controls): a draft can change; an
// approved invoice is open until payments and credit notes settle it; a
// voided invoice ("cancelled") is out of the books.

export const INVOICE_LABELS = {
  draft: "Draft",
  sent: "Awaiting payment",
  part_paid: "Partly paid",
  partially_paid: "Partly paid",
  paid: "Paid",
  credited: "Credited",
  overdue: "Overdue",
  cancelled: "Void",
};

export const isDraft = inv => inv?.status === "draft";
export const isVoid = inv => inv?.status === "cancelled";
export const isApproved = inv => !!inv && !isDraft(inv) && !isVoid(inv);
export const isSettled = inv =>
  isApproved(inv) && (inv.status === "paid" || inv.status === "credited" || Number(inv.balance_due || 0) <= 0);
export const isOpen = inv => isApproved(inv) && !isSettled(inv);
