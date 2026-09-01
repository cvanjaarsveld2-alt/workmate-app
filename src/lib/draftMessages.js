// ─── Draft Messages ───────────────────────────────────────────────────────────
// Generates ready-to-send message drafts (email or WhatsApp) for planner action
// items — chasing a cold quote, reaching out to a quiet client, confirming a
// meeting. Template-based for now; the shape is deliberately AI-ready so a future
// version can swap `buildDraft` for a Claude Edge Function call without changing
// any caller.
//
// Nothing here sends anything — it only returns text the user copies and sends
// themselves.

const SENDER = "Power Works"; // could later come from the user's profile

// Pick the recipient's first name if we have a contact, else a neutral greeting.
function greeting(client) {
  const contact = (client?.contact || "").trim();
  if (contact) return `Hi ${contact.split(" ")[0]}`;
  return "Hi there";
}

function money(v) {
  const n = Number(v || 0);
  return n ? `R${n.toLocaleString()}` : "";
}

// ── The core builder ──────────────────────────────────────────────────────────
// item: { kind, client, raw }  where raw is the underlying quote/client/followup
// channel: "email" | "whatsapp"
// Returns { subject?, body }. subject only for email.
export function buildDraft(item, channel, client) {
  const company = item.client || client?.company || "your company";
  const hi = greeting(client);
  const email = channel === "email";

  // ─ Chase a cold quote ─
  if (item.kind === "quote") {
    const val = money(item.raw?.value);
    const desc = (item.raw?.description || "").trim();
    if (email) {
      return {
        subject: `Following up on your quote${val ? ` (${val})` : ""}`,
        body:
`${hi},

I wanted to follow up on the quote we sent through${desc ? ` for ${desc}` : ""}${val ? `, valued at ${val}` : ""}. I know these things can slip down the list, so no pressure at all.

Is there anything you'd like me to clarify, adjust, or talk through? Happy to jump on a quick call whenever suits you.

Looking forward to hearing from you.

Best regards,
${SENDER}`,
      };
    }
    return {
      body:
`${hi}, just following up on the quote we sent${val ? ` (${val})` : ""} — happy to answer any questions or adjust anything if needed. Let me know your thoughts whenever you get a chance. Thanks!`,
    };
  }

  // ─ Reach out to a quiet client ─
  if (item.kind === "reachout") {
    if (email) {
      return {
        subject: `Checking in from ${SENDER}`,
        body:
`${hi},

It's been a little while since we last connected, so I thought I'd check in. Is there anything ${company} is working on at the moment where we could be of help?

Even if it's just to catch up, I'd be glad to hear how things are going on your side.

Best regards,
${SENDER}`,
      };
    }
    return {
      body:
`${hi}, it's been a while — just checking in to see how things are going at ${company}. Anything we can help with at the moment? Would be good to catch up.`,
    };
  }

  // ─ Confirm / prep a meeting ─
  if (item.kind === "meeting") {
    const when = item.raw?.date ? `on ${item.raw.date}${item.raw?.time ? ` at ${item.raw.time}` : ""}` : "soon";
    if (email) {
      return {
        subject: `Confirming our meeting`,
        body:
`${hi},

Just confirming our meeting ${when}. Please let me know if that still works for you, or if you'd prefer to reschedule.

Looking forward to it.

Best regards,
${SENDER}`,
      };
    }
    return {
      body: `${hi}, just confirming our meeting ${when}. Does that still work for you? Let me know if you'd like to change it. Thanks!`,
    };
  }

  // ─ Generic follow-up ─
  const title = item.title || "following up";
  if (email) {
    return {
      subject: `Following up`,
      body:
`${hi},

Just following up regarding ${title.toLowerCase()}. Let me know if there's anything you need from my side.

Best regards,
${SENDER}`,
    };
  }
  return { body: `${hi}, just following up regarding ${title.toLowerCase()}. Let me know if you need anything from my side. Thanks!` };
}

// Combine subject + body into one copyable block (email includes the subject line).
export function draftToText(draft, channel) {
  if (channel === "email" && draft.subject) {
    return `Subject: ${draft.subject}\n\n${draft.body}`;
  }
  return draft.body;
}
