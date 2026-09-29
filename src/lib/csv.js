// CSV formula-injection guard (CWE-1236). Excel, Sheets and Numbers execute a
// cell that starts with =, +, -, @, tab or CR as a formula, so free text such as
// a vendor name or note could run a formula when finance opens the export.
// Plain numbers ("-12.50") are left alone so negative amounts stay numeric.
const FORMULA_START = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

export function neutralizeFormula(value) {
  const str = String(value ?? "");
  return FORMULA_START.test(str) && !PLAIN_NUMBER.test(str) ? `'${str}` : str;
}

// Saves text as a file on the device (a CSV opens in Excel with the right
// characters thanks to the byte-order mark).
export function downloadText(text, filename, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob(["﻿" + text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
