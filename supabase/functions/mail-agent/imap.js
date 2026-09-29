// ─── Mail agent: any other mailbox (IMAP), e.g. iCloud ───────────────────────
// Signs in with an app-specific password (iCloud: appleid.apple.com → Sign-In
// and Security → App-Specific Passwords), opens one folder read-only and reads
// messages newer than the last one seen. The cursor is "uidvalidity:last uid";
// if the server renumbers the folder, it starts again from the last week.
import { ImapFlow } from "npm:imapflow@1.0.171";
import PostalMime from "npm:postal-mime@2.4.3";
import { normalizeParsed } from "./imap-parse.js";

export class AuthError extends Error {}

// Well-known servers, so people only type their address and app password.
export const KNOWN_HOSTS = {
  "icloud.com": ["imap.mail.me.com", 993], "me.com": ["imap.mail.me.com", 993], "mac.com": ["imap.mail.me.com", 993],
  "gmail.com": ["imap.gmail.com", 993], "googlemail.com": ["imap.gmail.com", 993],
  "outlook.com": ["outlook.office365.com", 993], "hotmail.com": ["outlook.office365.com", 993], "live.com": ["outlook.office365.com", 993],
  "yahoo.com": ["imap.mail.yahoo.com", 993], "yahoo.co.za": ["imap.mail.yahoo.com", 993],
};
export function serverFor(email, host, port) {
  if (host) return [host, Number(port) || 993];
  const d = String(email || "").toLowerCase().split("@")[1] || "";
  return KNOWN_HOSTS[d] || [`imap.${d}`, 993];
}

async function withMailbox({ host, port, email, password, folder }, fn) {
  const client = new ImapFlow({
    host, port, secure: true, auth: { user: email, pass: password }, logger: false,
    socketTimeout: 60_000, greetingTimeout: 15_000, connectionTimeout: 15_000,
  });
  try {
    await client.connect();
  } catch (e) {
    const msg = String(e?.responseText || e?.message || e);
    if (e?.authenticationFailed || /auth|login|credentials|password/i.test(msg)) throw new AuthError(`The mailbox refused the password: ${msg}`);
    throw new Error(`Couldn't reach ${host}: ${msg}`);
  }
  try {
    const lock = await client.getMailboxLock(folder || "INBOX", { readOnly: true });
    try {
      return await fn(client);
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
}

// Checks the address and password work (used when connecting).
export async function testLogin(conn) {
  return withMailbox(conn, async client => ({ ok: true, exists: client.mailbox?.exists ?? 0 }));
}

export async function listNew(conn, { cursor, sinceDays = 7, max = 25, maxBytes = 15 * 1024 * 1024 } = {}) {
  return withMailbox(conn, async client => {
    const uv = String(client.mailbox.uidValidity);
    const [cuv, lastRaw] = String(cursor || "").split(":");
    const last = Number(lastRaw) || 0;
    let uids;
    if (cuv === uv && last) {
      uids = (await client.search({ uid: `${last + 1}:*` }, { uid: true })) || [];
      uids = uids.filter(u => u > last); // "n:*" also returns the last message when nothing is newer
    } else {
      uids = (await client.search({ since: new Date(Date.now() - sinceDays * 86400000) }, { uid: true })) || [];
    }
    uids.sort((a, b) => a - b);
    const batch = uids.slice(0, max);
    const messages = [];
    let newest = cuv === uv ? last : 0;
    if (batch.length) {
      for await (const m of client.fetch(batch.join(","), { uid: true, size: true, source: true }, { uid: true })) {
        newest = Math.max(newest, m.uid);
        if (m.size > maxBytes || !m.source) continue;
        const parsed = await PostalMime.parse(m.source);
        messages.push(normalizeParsed(parsed, m.uid));
      }
    }
    // First connection with no mail in the last week: remember where the folder ends.
    if (!newest) newest = Math.max(0, (client.mailbox.uidNext || 1) - 1);
    return { messages, cursor: `${uv}:${newest}` };
  });
}
