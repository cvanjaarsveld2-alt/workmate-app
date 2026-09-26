// SMS provider requests, shared by the edge function (index.ts) and the unit
// tests (tests/messages.test.mjs). No Deno or Node APIs here.

const basic = (user, pass) => "Basic " + btoa(`${user}:${pass}`);

// { url, init } for fetch(), for the platform's provider.
export function smsRequest(gw, { to, body }) {
  if (gw.provider === "twilio") {
    const form = new URLSearchParams({ To: to, From: gw.sender || "", Body: body });
    return {
      url: `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(gw.username)}/Messages.json`,
      init: {
        method: "POST",
        headers: { Authorization: basic(gw.username, gw.secret), "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      },
    };
  }
  // BulkSMS (bulksms.com): token id + token secret.
  return {
    url: "https://api.bulksms.com/v1/messages",
    init: {
      method: "POST",
      headers: { Authorization: basic(gw.username, gw.secret), "Content-Type": "application/json" },
      body: JSON.stringify(gw.sender ? { to, body, from: gw.sender } : { to, body }),
    },
  };
}

// The provider's id for the message, from its reply.
export function smsReference(gw, reply) {
  if (!reply) return "";
  if (gw.provider === "twilio") return String(reply.sid || "");
  const first = Array.isArray(reply) ? reply[0] : reply;
  return String(first?.id || "");
}

// {app} in a message becomes the app's address; without one, the link is left out.
export function finishBody(body, appUrl) {
  const app = String(appUrl || "").replace(/\/$/, "");
  if (app) return body.replaceAll("{app}", app);
  return body.replace(/ ?See your account and invoices: \{app\}\/\?portal=[0-9a-f]+/g, "").replaceAll("{app}", "");
}
