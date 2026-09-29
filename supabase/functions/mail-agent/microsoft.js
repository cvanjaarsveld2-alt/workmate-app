// ─── Mail agent: Microsoft 365 / Outlook (Microsoft Graph) ───────────────────
// Sign-in asks only for "read your mail" (Mail.Read), "sign you in" (User.Read)
// and offline_access (so it keeps working). New mail is found with Graph's
// delta query on one folder; the cursor is the delta (or next-page) link.
const LOGIN = "https://login.microsoftonline.com/common/oauth2/v2.0";
const GRAPH = "https://graph.microsoft.com/v1.0";
export const SCOPES = "offline_access User.Read Mail.Read";

export function authorizeUrl({ clientId, redirectUri, state }) {
  const u = new URL(`${LOGIN}/authorize`);
  u.search = new URLSearchParams({
    client_id: clientId, response_type: "code", redirect_uri: redirectUri, response_mode: "query",
    scope: SCOPES, state, prompt: "select_account",
  }).toString();
  return u.toString();
}

export class AuthError extends Error {}

async function token(params, { clientId, clientSecret, fetchFn = fetch }) {
  const res = await fetchFn(`${LOGIN}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, scope: SCOPES, ...params }).toString(),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body.error_description || body.error || `Microsoft sign-in failed (${res.status})`;
    if (["invalid_grant", "interaction_required", "consent_required"].includes(body.error)) throw new AuthError(msg);
    throw new Error(msg);
  }
  return body; // { access_token, refresh_token, expires_in }
}
export const exchangeCode = (code, redirectUri, opts) => token({ grant_type: "authorization_code", code, redirect_uri: redirectUri }, opts);
export const refresh = (refreshToken, opts) => token({ grant_type: "refresh_token", refresh_token: refreshToken }, opts);

async function graph(path, accessToken, { fetchFn = fetch, headers = {} } = {}) {
  const res = await fetchFn(path.startsWith("http") ? path : `${GRAPH}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json", ...headers },
  });
  if (res.status === 401 || res.status === 403) throw new AuthError(`Microsoft refused access (${res.status})`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message || `Microsoft Graph error ${res.status}`);
  return body;
}

export async function profileEmail(accessToken, opts) {
  const me = await graph("/me?$select=mail,userPrincipalName", accessToken, opts);
  return String(me.mail || me.userPrincipalName || "").toLowerCase();
}

// "INBOX" is the inbox; any other name is looked up at the top level and
// under the inbox (e.g. Inbox/Invoices).
export async function folderId(accessToken, name, opts) {
  if (!name || /^inbox$/i.test(name)) return "inbox";
  const q = encodeURIComponent(`displayName eq '${String(name).replace(/'/g, "''")}'`);
  for (const path of [`/me/mailFolders?$filter=${q}&$top=1`, `/me/mailFolders/inbox/childFolders?$filter=${q}&$top=1`]) {
    const r = await graph(path, accessToken, opts);
    if (r.value?.[0]?.id) return r.value[0].id;
  }
  throw new Error(`There's no folder called "${name}" in this mailbox`);
}

const SELECT = "id,internetMessageId,subject,from,toRecipients,ccRecipients,receivedDateTime,body,hasAttachments";

export function normalize(m) {
  const addr = r => String(r?.emailAddress?.address || "").toLowerCase();
  return {
    id: m.internetMessageId || `ms:${m.id}`,
    providerId: m.id,
    from: { email: addr(m.from), name: m.from?.emailAddress?.name || "" },
    to: (m.toRecipients || []).map(addr),
    cc: (m.ccRecipients || []).map(addr),
    subject: m.subject || "",
    date: m.receivedDateTime,
    text: m.body?.contentType === "text" ? m.body.content : "",
    html: m.body?.contentType === "html" ? m.body.content : "",
    headers: [],
    hasAttachments: !!m.hasAttachments,
    attachments: [],
  };
}

// New messages since the cursor (or, the first time, the last `sinceDays`).
// Returns { messages, cursor }. Stops after `max` and resumes next time.
export async function listNew(accessToken, { folder, cursor, since, max = 25, fetchFn } = {}) {
  const opts = { fetchFn, headers: { Prefer: 'odata.maxpagesize=25, outlook.body-content-type="text"' } };
  let url = cursor;
  if (!url) {
    const id = await folderId(accessToken, folder, { fetchFn });
    url = `/me/mailFolders/${id}/messages/delta?$select=${SELECT}&$filter=${encodeURIComponent(`receivedDateTime ge ${since}`)}`;
  }
  const messages = [];
  for (let page = 0; page < 10; page++) {
    const r = await graph(url, accessToken, opts);
    for (const m of r.value || []) if (!m["@removed"]) messages.push(normalize(m));
    if (r["@odata.deltaLink"]) return { messages, cursor: r["@odata.deltaLink"] };
    if (!r["@odata.nextLink"]) return { messages, cursor: url };
    url = r["@odata.nextLink"];
    if (messages.length >= max) return { messages, cursor: url };
  }
  return { messages, cursor: url };
}

// The message's files (only called for mail the prefilter kept).
export async function attachments(accessToken, msg, { fetchFn, maxBytes = 10 * 1024 * 1024 } = {}) {
  if (!msg.hasAttachments) return [];
  const list = await graph(`/me/messages/${msg.providerId}/attachments?$select=id,name,contentType,size,isInline`, accessToken, { fetchFn });
  const out = [];
  for (const a of (list.value || []).slice(0, 8)) {
    if (a["@odata.type"] && a["@odata.type"] !== "#microsoft.graph.fileAttachment") continue;
    if (a.size > maxBytes) { out.push({ Name: a.name, ContentType: a.contentType, ContentLength: a.size }); continue; }
    const full = await graph(`/me/messages/${msg.providerId}/attachments/${a.id}`, accessToken, { fetchFn });
    out.push({ Name: a.name, ContentType: a.contentType, ContentLength: a.size, ContentID: a.isInline ? "inline" : undefined, Content: full.contentBytes });
  }
  return out;
}
