// ─── Reading attached documents for the AI (tested in tests/attachments.test.mjs)
// Shared by inbound-email and mail-agent (the two copies must stay the same).
//   PDF and photos      → sent to the AI as they are
//   Word (.docx)        → its text and tables
//   Excel (.xlsx), CSV  → each sheet as rows, "cell | cell | cell"
//   .doc, .xls (old)    → kept for a person to open; not read
// No libraries: .docx and .xlsx are zip files of XML, unzipped here with the
// built-in DecompressionStream.

export const TEXT_LIMIT = 15000;
const MAX_ROWS_PER_SHEET = 300;
const MAX_UNZIPPED_BYTES = 20 * 1024 * 1024;

export function base64ToBytes(b64) {
  const bin = atob(String(b64 || "").replace(/\s/g, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// The named files from a zip (only those `want` accepts).
export async function unzip(bytes, want = () => true) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("not a zip file");
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const files = new Map();
  let total = 0;
  const dec = new TextDecoder();
  for (let n = 0; n < count && p + 46 <= bytes.length; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const usize = view.getUint32(p + 24, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (!want(name)) continue;
    total += usize;
    if (total > MAX_UNZIPPED_BYTES) throw new Error("the file is too large to read");
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = bytes.subarray(start, start + size);
    if (method === 0) files.set(name, data);
    else if (method === 8) files.set(name, await inflateRaw(data));
  }
  return files;
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
export const decodeXml = s =>
  String(s).replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e) =>
    e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e.toLowerCase()],
  );
const xmlText = bytes => new TextDecoder().decode(bytes);
const tidy = t => t.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

// Word: paragraphs on their own lines, table cells separated by " | ".
export async function docxText(bytes) {
  const files = await unzip(bytes, n => n === "word/document.xml");
  const xml = files.get("word/document.xml");
  if (!xml) throw new Error("not a Word document");
  const text = xmlText(xml)
    .replace(/>\s*\n\s*</g, "><") // line breaks between tags aren't text
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<w:br[^>]*\/>/g, "\n")
    // A table cell's paragraphs on one line, cells separated by " | ".
    .replace(/<w:tc[ >][\s\S]*?<\/w:tc>/g, tc => `${tc.replace(/<\/w:p>/g, " ").replace(/<[^>]+>/g, "").trim()} | `)
    .replace(/<\/w:tr>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "");
  return tidy(decodeXml(text).replace(/ \| \n/g, "\n"));
}

const colIndex = ref => {
  const letters = String(ref).match(/^[A-Z]+/)?.[0] || "A";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

// Excel: every sheet, its rows as "a | b | c" (dates and formulas as the
// values Excel saved).
export async function xlsxText(bytes) {
  const files = await unzip(bytes, n => n === "xl/sharedStrings.xml" || n === "xl/workbook.xml" || /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  if (!files.size || ![...files.keys()].some(n => n.startsWith("xl/worksheets/"))) throw new Error("not an Excel workbook");
  const shared = [];
  const ss = files.get("xl/sharedStrings.xml");
  if (ss) {
    for (const si of xmlText(ss).match(/<si>[\s\S]*?<\/si>/g) || []) {
      shared.push(decodeXml((si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || []).map(t => t.replace(/<[^>]+>/g, "")).join("")));
    }
  }
  const names = (xmlText(files.get("xl/workbook.xml") || new Uint8Array()).match(/<sheet [^>]*name="([^"]*)"/g) || [])
    .map(s => decodeXml(s.match(/name="([^"]*)"/)[1]));
  const sheets = [...files.keys()].filter(n => n.startsWith("xl/worksheets/"))
    .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
  const out = [];
  sheets.forEach((path, i) => {
    const xml = xmlText(files.get(path));
    const rows = [];
    for (const row of xml.match(/<row[^>]*>[\s\S]*?<\/row>/g) || []) {
      if (rows.length >= MAX_ROWS_PER_SHEET) break;
      const cells = [];
      for (const c of row.match(/<c [^>]*?(\/>|>[\s\S]*?<\/c>)/g) || []) {
        const ref = c.match(/ r="([A-Z]+\d+)"/)?.[1] || "";
        const type = c.match(/ t="([^"]+)"/)?.[1] || "";
        let v = c.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        if (type === "s") v = shared[Number(v)];
        else if (type === "inlineStr") v = (c.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || []).map(t => t.replace(/<[^>]+>/g, "")).join("");
        if (v === undefined || v === "") continue;
        cells[ref ? colIndex(ref) : cells.length] = decodeXml(String(v)).replace(/\s+/g, " ").trim();
      }
      if (cells.some(Boolean)) rows.push(Array.from(cells, x => x || "").join(" | "));
    }
    if (rows.length) out.push(`Sheet: ${names[i] || `Sheet ${i + 1}`}\n${rows.join("\n")}`);
  });
  return out.join("\n\n");
}

export function csvText(bytes) {
  return tidy(new TextDecoder().decode(bytes).split(/\r?\n/).slice(0, MAX_ROWS_PER_SHEET * 3).join("\n"));
}

export const READABLE_DOCS = ["docx", "xlsx", "csv"];
export const OLD_DOCS = ["doc", "xls"];

// The text of a Word, Excel or CSV attachment, cut to TEXT_LIMIT.
export async function documentText(file) {
  const bytes = base64ToBytes(file.content);
  const text = file.ext === "docx" ? await docxText(bytes) : file.ext === "xlsx" ? await xlsxText(bytes) : csvText(bytes);
  return text.length > TEXT_LIMIT ? `${text.slice(0, TEXT_LIMIT)}\n… (cut short)` : text;
}

// What to send the AI for a file: { parts } (OpenAI message parts) or { error }
// saying why it can't be read. Photos must be JPEG, PNG or WebP by now (the
// caller converts iPhone HEIC photos first).
export async function aiParts(file) {
  if (!file?.content) return { error: "The file is missing." };
  if (file.ext === "pdf")
    return { parts: [{ type: "file", file: { filename: file.name || "document.pdf", file_data: `data:application/pdf;base64,${file.content}` } }] };
  if (["jpg", "png", "webp"].includes(file.ext))
    return { parts: [{ type: "image_url", image_url: { url: `data:${file.contentType};base64,${file.content}`, detail: "high" } }] };
  if (READABLE_DOCS.includes(file.ext)) {
    try {
      const text = await documentText(file);
      if (!text) return { error: `${file.name || "The file"} is empty.` };
      return { parts: [{ type: "text", text: `Attached file "${file.name || file.ext}":\n${text}` }] };
    } catch (e) {
      return { error: `${file.name || "The file"} couldn't be opened (${e?.message || "damaged file"}). Open it and enter the details.` };
    }
  }
  if (OLD_DOCS.includes(file.ext))
    return { error: `Older Word and Excel files (.doc, .xls) can't be read automatically. Open ${file.name || "the file"} and enter the details.` };
  if (file.ext === "heic") return { error: "iPhone HEIC photos couldn't be read automatically. Open it and enter the details." };
  return { error: "This kind of file can't be read automatically." };
}
