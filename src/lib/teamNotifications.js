// ─── Team Notifications ───────────────────────────────────────────────────────
// Handles sharing, assignment, and response notifications.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from "../supabase";

// ─── Send a share/assignment notification ─────────────────────────────────────
export async function sendAssignmentNotification({
  fromUserId,
  toUserId,
  teamId,
  recordType,   // "lead" | "followup" | "client" | "contact"
  recordId,
  recordTitle,
  fromEmail,
}) {
  if (!toUserId || !fromUserId || toUserId === fromUserId) return;

  const fromName  = fromEmail?.split("@")[0] || "A teammate";
  const typeLabel = { lead: "lead", followup: "follow-up", client: "client", contact: "contact" }[recordType] || recordType;
  const message   = `${fromName} shared a ${typeLabel} with you: ${recordTitle}`;

  try {
    await supabase.rpc("notify_assignment", {
      p_to_user_id:   toUserId,
      p_from_user_id: fromUserId,
      p_team_id:      teamId,
      p_record_type:  recordType,
      p_record_id:    recordId,
      p_record_title: recordTitle,
      p_message:      message,
    });

    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", toUserId);

    for (const sub of subs || []) {
      await supabase.functions.invoke("send-notifications", {
        body: {
          subscription: { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          title: `PowerMate — ${typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1)} shared with you`,
          body:  message,
          url:   "/?screen=SharedInbox",
        },
      }).catch(() => {});
    }
  } catch (e) {
    console.warn("Assignment notification failed:", e);
  }
}

// ─── Send response notification back to the original sender ───────────────────
// Called after accept or decline so the sender knows the outcome.
export async function sendResponseNotification({
  fromUserId,     // the original sender (now the recipient of this response)
  responderUserId,
  responderEmail,
  teamId,
  recordType,
  recordTitle,
  accepted,       // boolean — true = accepted, false = declined
}) {
  if (!fromUserId || !responderUserId || fromUserId === responderUserId) return;

  const responderName = responderEmail?.split("@")[0] || "Your teammate";
  const typeLabel     = { lead: "lead", followup: "follow-up", client: "client", contact: "contact" }[recordType] || recordType;
  const emoji         = accepted ? "✅" : "❌";
  const verb          = accepted ? "accepted" : "declined";
  const message       = `${emoji} ${responderName} ${verb} your shared ${typeLabel}: ${recordTitle}`;

  try {
    // Write in-app notification to the original sender
    await supabase.rpc("notify_assignment", {
      p_to_user_id:   fromUserId,
      p_from_user_id: responderUserId,
      p_team_id:      teamId,
      p_record_type:  recordType,
      p_record_id:    null,        // response notification — no record to open
      p_record_title: recordTitle,
      p_message:      message,
    });

    // Push to original sender (best-effort)
    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", fromUserId);

    for (const sub of subs || []) {
      await supabase.functions.invoke("send-notifications", {
        body: {
          subscription: { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          title: "PowerMate — Share response",
          body:  message,
          url:   "/?screen=Notifications",
        },
      }).catch(() => {});
    }
  } catch (e) {
    console.warn("Response notification failed:", e);
  }
}

// ─── Unread count ─────────────────────────────────────────────────────────────
export async function getUnreadCount(userId) {
  const { count } = await supabase
    .from("team_notifications")
    .select("id", { count: "exact", head: true })
    .eq("to_user_id", userId)
    .eq("read", false);
  return count || 0;
}

// ─── Mark read ────────────────────────────────────────────────────────────────
export async function markNotificationsRead(userId) {
  await supabase
    .from("team_notifications")
    .update({ read: true })
    .eq("to_user_id", userId)
    .eq("read", false);
}

// ─── Get notifications ────────────────────────────────────────────────────────
export async function getNotifications(userId, limit = 20) {
  const { data } = await supabase
    .from("team_notifications")
    .select("*")
    .eq("to_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return data || [];
}
