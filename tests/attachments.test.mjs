// Reading email attachments (Word, Excel, CSV, PDF, photos) for the AI.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { aiParts, docxText, unzip, xlsxText } from "../supabase/functions/inbound-email/documents.js";
import { fileKind, usableAttachments } from "../supabase/functions/inbound-email/inbound.js";
import { mainAttachment } from "../supabase/functions/mail-agent/agent.js";

const read = p => fs.readFileSync(new URL(p, import.meta.url), "utf8");
const enc = new TextEncoder();

// A real zip (what .docx and .xlsx are), with stored or deflated entries.
async function zip(entries, deflate = true) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const [name, text] of Object.entries(entries)) {
    const raw = enc.encode(text);
    const data = deflate
      ? new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer())
      : raw;
    const nameBytes = enc.encode(name);
    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(8, deflate ? 8 : 0, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, raw.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    const cen = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cen.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, deflate ? 8 : 0, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, raw.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    cen.set(nameBytes, 46);
    parts.push(local, data);
    central.push(cen);
    offset += local.length + data.length;
  }
  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, central.length, true);
  ev.setUint16(10, central.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  return new Uint8Array(await new Blob([...parts, ...central, end]).arrayBuffer());
}
const b64 = bytes => Buffer.from(bytes).toString("base64");

const DOCX = {
  "[Content_Types].xml": "<Types/>",
  "word/document.xml": `<?xml version="1.0"?><w:document><w:body>
    <w:p><w:r><w:t>Request for quotation</w:t></w:r></w:p>
    <w:p><w:r><w:t xml:space="preserve">Supply 2 x 30T jacks &amp; stands</w:t></w:r><w:r><w:tab/><w:t>urgent</w:t></w:r></w:p>
    <w:tbl><w:tr><w:tc><w:p><w:r><w:t>Item</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Qty</w:t></w:r></w:p></w:tc></w:tr>
    <w:tr><w:tc><w:p><w:r><w:t>Jack 30T</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>2</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
  </w:body></w:document>`,
};
const XLSX = {
  "xl/workbook.xml": `<workbook><sheets><sheet name="Quote" sheetId="1" r:id="rId1"/><sheet name="Notes &amp; terms" sheetId="2" r:id="rId2"/></sheets></workbook>`,
  "xl/sharedStrings.xml": `<sst><si><t>Item</t></si><si><t>Price</t></si><si><r><t>Hydraulic </t></r><r><t>filter</t></r></si><si><t>Total incl. VAT</t></si></sst>`,
  "xl/worksheets/sheet1.xml": `<worksheet><sheetData>
    <row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row>
    <row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"/><c r="C2"><v>1150.5</v></c></row>
    <row r="3"><c r="A3" t="s"><v>3</v></c><c r="C3"><f>SUM(C2)</f><v>1150.5</v></c></row>
  </sheetData></worksheet>`,
  "xl/worksheets/sheet2.xml": `<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Valid 30 days</t></is></c></row></sheetData></worksheet>`,
};

test("Word files: paragraphs, tabs and tables become readable text", async () => {
  for (const deflate of [true, false]) {
    const text = await docxText(await zip(DOCX, deflate));
    assert.match(text, /^Request for quotation\nSupply 2 x 30T jacks & stands\turgent\n/);
    assert.match(text, /Item \| Qty\nJack 30T \| 2/);
  }
  await assert.rejects(docxText(await zip({ "hello.txt": "x" })), /not a Word document/);
  await assert.rejects(docxText(enc.encode("not a zip")), /not a zip file/);
});

test("Excel files: every sheet, cells in their columns, shared and inline text", async () => {
  const text = await xlsxText(await zip(XLSX));
  assert.equal(text, "Sheet: Quote\nItem |  | Price\nHydraulic filter |  | 1150.5\nTotal incl. VAT |  | 1150.5\n\nSheet: Notes & terms\nValid 30 days");
  await assert.rejects(xlsxText(await zip(DOCX)), /not an Excel workbook/);
});

test("zip bombs and huge files are refused", async () => {
  const big = await zip({ "word/document.xml": "a".repeat(21 * 1024 * 1024) });
  await assert.rejects(unzip(big), /too large/);
});

test("what the AI gets for each kind of file", async () => {
  const docx = await aiParts({ ext: "docx", name: "RFQ.docx", content: b64(await zip(DOCX)) });
  assert.equal(docx.parts[0].type, "text");
  assert.match(docx.parts[0].text, /^Attached file "RFQ.docx":\nRequest for quotation/);
  const xlsx = await aiParts({ ext: "xlsx", name: "quote.xlsx", content: b64(await zip(XLSX)) });
  assert.match(xlsx.parts[0].text, /Hydraulic filter \|  \| 1150\.5/);
  const csv = await aiParts({ ext: "csv", name: "items.csv", content: b64(enc.encode("item,qty\r\njack,2\r\n")) });
  assert.match(csv.parts[0].text, /item,qty\njack,2/);
  assert.equal((await aiParts({ ext: "pdf", name: "a.pdf", content: "AAAA" })).parts[0].type, "file");
  assert.equal((await aiParts({ ext: "jpg", contentType: "image/jpeg", content: "AAAA" })).parts[0].type, "image_url");
  assert.match((await aiParts({ ext: "doc", name: "old.doc", content: "AAAA" })).error, /Older Word and Excel files/);
  assert.match((await aiParts({ ext: "xls", name: "old.xls", content: "AAAA" })).error, /can't be read automatically/);
  assert.match((await aiParts({ ext: "docx", name: "broken.docx", content: b64(enc.encode("nope")) })).error, /couldn't be opened/);
  assert.match((await aiParts({ ext: "heic", content: "AAAA" })).error, /HEIC/);
});

test("Word, Excel and CSV attachments are kept; the PDF is still preferred", () => {
  assert.equal(fileKind({ Name: "RFQ.docx", ContentType: "application/octet-stream" }).ext, "docx");
  assert.equal(fileKind({ Name: "prices.xlsx", ContentType: "application/vnd.ms-excel" }).ext, "xlsx");
  assert.equal(fileKind({ Name: "old.xls", ContentType: "application/vnd.ms-excel" }).ext, "xls");
  assert.equal(fileKind({ Name: "list.csv", ContentType: "text/csv; charset=utf-8" }).ext, "csv");
  assert.equal(fileKind({ Name: "a.zip", ContentType: "application/zip" }), null);
  const atts = [
    { Name: "terms.docx", ContentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", Content: "AAAA" },
    { Name: "photo.jpg", ContentType: "image/jpeg", Content: Buffer.alloc(40000).toString("base64") },
    { Name: "INV.pdf", ContentType: "application/pdf", Content: "AAAA" },
  ];
  assert.equal(usableAttachments({ Attachments: atts }).files.length, 3);
  assert.equal(mainAttachment({ attachments: atts }).name, "INV.pdf");
  assert.equal(mainAttachment({ attachments: atts.slice(0, 1) }).name, "terms.docx");
  // A small Word file embedded in the email isn't mistaken for a logo.
  assert.equal(usableAttachments({ Attachments: [{ ...atts[0], ContentID: "x" }] }).files.length, 1);
});

test("both mail functions use the same readers", () => {
  for (const f of ["documents.js", "heic.js", "inbound.js"]) {
    assert.equal(read(`../supabase/functions/mail-agent/${f}`), read(`../supabase/functions/inbound-email/${f}`), f);
  }
  assert.match(read("../supabase/functions/inbound-email/index.ts"), /const read = await aiParts\(file\);/);
  assert.match(read("../supabase/functions/mail-agent/index.ts"), /const read = await aiParts\(/);
});
