// ─── Team Notifications ───────────────────────────────────────────────────────
// Handles assignment notifications — both in-app (via team_notifications table)
// and push (via the existing send-notifications Edge Function).
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from "../supabase";

// Send an assignment notification to a specific team member
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

  const fromName = fromEmail?.split("@")[0] || "A teammate";
  const typeLabel = {
    lead:     "lead",
    followup: "follow-up",
    client:   "client",
    contact:  "contact",
  }[recordType] || recordType;

  const message = `${fromName} assigned you a ${typeLabel}: ${recordTitle}`;

  try {
    // 1. Write in-app notification via security definer (bypasses RLS)
    await supabase.rpc("notify_assignment", {
      p_to_user_id:   toUserId,
      p_from_user_id: fromUserId,
      p_team_id:      teamId,
      p_record_type:  recordType,
      p_record_id:    recordId,
      p_record_title: recordTitle,
      p_message:      message,
    });

    // 2. Look up the target user's push subscriptions
    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", toUserId);

    if (!subs || subs.length === 0) return;

    // 3. Fire push via Edge Function for each subscription
    for (const sub of subs) {
      try {
        await supabase.functions.invoke("send-notifications", {
          body: {
            subscription: { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            title: "PowerMate — New Assignment",
            body: message,
            url: "/",
          },
        });
      } catch (e) {
        console.warn("Push failed for sub:", e);
      }
    }
  } catch (e) {
    console.warn("Assignment notification failed:", e);
  }
}

// Get unread notification count for the current user
export async function getUnreadCount(userId) {
  const { count } = await supabase
    .from("team_notifications")
    .select("id", { count: "exact", head: true })
    .eq("to_user_id", userId)
    .eq("read", false);
  return count || 0;
}

// Mark notifications as read
export async function markNotificationsRead(userId) {
  await supabase
    .from("team_notifications")
    .update({ read: true })
    .eq("to_user_id", userId)
    .eq("read", false);
}

// Get recent notifications for current user
export async function getNotifications(userId, limit = 20) {
  const { data } = await supabase
    .from("team_notifications")
    .select("*")
    .eq("to_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return data || [];
}
