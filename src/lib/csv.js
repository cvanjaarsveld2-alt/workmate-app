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
