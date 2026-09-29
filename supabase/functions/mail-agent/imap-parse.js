// A message parsed by postal-mime, in the agent's shape (see agent.js).
function toBase64(content) {
  if (!content) return "";
  if (typeof content === "string") return btoa(unescape(encodeURIComponent(content)));
  const bytes = content instanceof Uint8Array ? content : new Uint8Array(content);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function normalizeParsed(p = {}, uid = 0) {
  const addr = a => ({ email: String(a?.address || "").toLowerCase(), name: String(a?.name || "") });
  return {
    id: p.messageId || `imap:${uid}`,
    providerId: String(uid),
    from: addr(p.from),
    to: (p.to || []).map(a => addr(a).email).filter(Boolean),
    cc: (p.cc || []).map(a => addr(a).email).filter(Boolean),
    subject: p.subject || "",
    date: p.date || "",
    text: p.text || "",
    html: p.html || "",
    headers: (p.headers || []).map(h => ({ name: h.key, value: h.value })),
    attachments: (p.attachments || []).map(a => {
      const Content = toBase64(a.content);
      return {
        Name: a.filename || "attachment",
        ContentType: a.mimeType || "application/octet-stream",
        ContentLength: a.content?.byteLength ?? a.content?.length ?? 0,
        ContentID: a.contentId && a.disposition === "inline" ? a.contentId : undefined,
        Content,
      };
    }),
  };
}
