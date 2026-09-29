// ─── Mail agent: Gmail / Google Workspace (Gmail API) ────────────────────────
// Sign-in asks only for "read your email" (gmail.readonly) and the address.
// The first check reads the last week of the chosen label; after that Gmail's
// history of added messages from the saved historyId.
const AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const API = "https://gmail.googleapis.com/gmail/v1/users/me";
export const SCOPES = "https://www.googleapis.com/auth/gmail.readonly email";

export function authorizeUrl({ clientId, redirectUri, state }) {
  const u = new URL(AUTH);
  u.search = new URLSearchParams({
    client_id: clientId, redirect_uri: redirectUri, response_type: "code", scope: SCOPES,
    access_type: "offline", prompt: "consent", include_granted_scopes: "true", state,
  }).toString();
  return u.toString();
}

export class AuthError extends Error {}

async function token(params, { clientId, clientSecret, fetchFn = fetch }) {
  const res = await fetchFn(TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...params }).toString(),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body.error_description || body.error || `Google sign-in failed (${res.status})`;
    if (body.error === "invalid_grant") throw new AuthError(msg);
    throw new Error(msg);
  }
  return body; // { access_token, refresh_token?, expires_in }
}
export const exchangeCode = (code, redirectUri, opts) => token({ grant_type: "authorization_code", code, redirect_uri: redirectUri }, opts);
export const refresh = (refreshToken, opts) => token({ grant_type: "refresh_token", refresh_token: refreshToken }, opts);

class NotFound extends Error {}
async function api(path, accessToken, { fetchFn = fetch } = {}) {
  const res = await fetchFn(`${API}${path}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (res.status === 401 || res.status === 403) throw new AuthError(`Google refused access (${res.status})`);
  if (res.status === 404) throw new NotFound("not found");
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message || `Gmail error ${res.status}`);
  return body;
}

export async function profile(accessToken, opts) {
  const p = await api("/profile", accessToken, opts);
  return { email: String(p.emailAddress || "").toLowerCase(), historyId: String(p.historyId || "") };
}

export async function labelId(accessToken, name, opts) {
  if (!name || /^inbox$/i.test(name)) return "INBOX";
  const r = await api("/labels", accessToken, opts);
  const l = (r.labels || []).find(x => String(x.name).toLowerCase() === String(name).toLowerCase());
  if (!l) throw new Error(`There's no label called "${name}" in this mailbox`);
  return l.id;
}

// Gmail sends base64url; everything else here uses plain base64.
export const b64url = s => {
  const b = String(s || "").replace(/-/g, "+").replace(/_/g, "/");
  return b + "=".repeat((4 - (b.length % 4)) % 4);
};
function decodeText(data) {
  if (!data) return "";
  const bin = atob(b64url(data));
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function normalize(m) {
  const headers = (m.payload?.headers || []).map(h => ({ name: h.name, value: h.value }));
  const h = n => headers.find(x => x.name.toLowerCase() === n)?.value || "";
  const parseAddr = s => {
    const mm = String(s || "").match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
    return mm ? { name: mm[1].trim(), email: mm[2].trim().toLowerCase() } : { name: "", email: String(s || "").trim().toLowerCase() };
  };
  const list = s => String(s || "").split(",").map(x => parseAddr(x).email).filter(Boolean);
  let text = "", html = "";
  const attachments = [];
  const walk = part => {
    if (!part) return;
    if (part.filename && part.body?.attachmentId) {
      attachments.push({
        Name: part.filename, ContentType: part.mimeType, ContentLength: part.body.size || 0, attachmentId: part.body.attachmentId,
        ContentID: (part.headers || []).some(x => /^content-id$/i.test(x.name)) ? "inline" : undefined,
      });
    } else if (part.mimeType === "text/plain" && !text) text = decodeText(part.body?.data);
    else if (part.mimeType === "text/html" && !html) html = decodeText(part.body?.data);
    (part.parts || []).forEach(walk);
  };
  walk(m.payload);
  return {
    id: h("message-id") || `gm:${m.id}`,
    providerId: m.id,
    from: parseAddr(h("from")),
    to: list(h("to")),
    cc: list(h("cc")),
    subject: h("subject"),
    date: m.internalDate ? new Date(Number(m.internalDate)).toISOString() : h("date"),
    text, html, headers, attachments,
  };
}

// New messages: { messages, cursor }.
export async function listNew(accessToken, { folder, cursor, sinceDays = 7, max = 40, fetchFn } = {}) {
  const opts = { fetchFn };
  const label = await labelId(accessToken, folder, opts);
  let ids = [];
  let next = cursor;
  if (cursor) {
    try {
      const r = await api(`/history?startHistoryId=${encodeURIComponent(cursor)}&historyTypes=messageAdded&labelId=${label}&maxResults=100`, accessToken, opts);
      ids = [...new Set((r.history || []).flatMap(x => (x.messagesAdded || []).map(a => a.message.id)))];
      next = r.historyId || cursor;
    } catch (e) {
      if (!(e instanceof NotFound)) throw e;
      next = null; // too old: start again from recent mail
    }
  }
  if (!next) {
    next = (await profile(accessToken, opts)).historyId;
    const r = await api(`/messages?labelIds=${label}&q=${encodeURIComponent(`newer_than:${sinceDays}d`)}&maxResults=${max}`, accessToken, opts);
    ids = (r.messages || []).map(m => m.id);
  }
  const messages = [];
  for (const id of ids.slice(0, max)) {
    try {
      messages.push(normalize(await api(`/messages/${id}?format=full`, accessToken, opts)));
    } catch (e) {
      if (!(e instanceof NotFound)) throw e; // deleted since
    }
  }
  return { messages, cursor: next };
}

export async function attachments(accessToken, msg, { fetchFn, maxBytes = 10 * 1024 * 1024 } = {}) {
  const out = [];
  for (const a of (msg.attachments || []).slice(0, 8)) {
    if (!a.attachmentId || a.ContentLength > maxBytes) { out.push(a); continue; }
    const r = await api(`/messages/${msg.providerId}/attachments/${a.attachmentId}`, accessToken, { fetchFn });
    out.push({ ...a, Content: b64url(r.data) });
  }
  return out;
}
