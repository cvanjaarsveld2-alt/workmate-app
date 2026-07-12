// ─── Note → Follow-up Converter ──────────────────────────────────────────────
// One-tap button that converts a note into a follow-up, pre-filled with the
// client and note link. Uses the existing linked_note_id field on followups.
//
// Usage (inside NotesScreen card):
//   <NoteToFollowupBtn note={note} userId={userId} data={data} setData={setData} onDone={() => setToast("Follow-up created")} />
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from "react";
import { Calendar } from "lucide-react";
import { todayISO, genId } from "../lib/helpers";
import { offlineSave } from "../offline/offlineDb";
import { triggerImmediateSync } from "../lib/sync";
import { withTeamId } from "../lib/teamId";

export function NoteToFollowupBtn({ note, userId, teamId, data, setData, onDone }) {
  const [creating, setCreating] = useState(false);

  async function convert() {
    if (creating) return;
    setCreating(true);

    // Find client name from client_id
    const client = (data.clients || []).find(c => c.id === note.client_id);

    // Default date: tomorrow (or resolve_by if set and in future)
    const tomorrow = (() => {
      const d = new Date(); d.setDate(d.getDate() + 1);
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    })();
    const fuDate = note.resolve_by && note.resolve_by >= todayISO() ? note.resolve_by : tomorrow;

    const item = withTeamId({
      id: genId(),
      user_id: userId,
      client_id: note.client_id || null,
      client: client?.company || note.client || "",
      branch: client?.branch || "",
      title: (note.note || "").slice(0, 100).trim(),
      date: fuDate,
      time: "09:00",
      reminder: "morning",
      notes: `From note: ${(note.note || "").slice(0, 200)}`,
      completed: false,
      linked_note_id: note.id,
      created_at: new Date().toISOString(),
      sync_status: "pending",
    }, teamId);
    };

    setData(d => ({
      ...d,
      followups: [item, ...(d.followups || [])],
      syncQueue: [{
        id: genId(), table: "followups", action: "insert",
        data: item, status: "pending", created_at: new Date().toISOString(),
      }, ...(d.syncQueue || [])],
    }));

    await offlineSave("followups", item);
    triggerImmediateSync();
    setCreating(false);
    onDone?.();
  }

  return (
    <button onClick={e => { e.stopPropagation(); convert(); }} disabled={creating}
      className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold border border-blue-200 bg-blue-50 text-blue-700 min-h-[36px] disabled:opacity-40 transition-opacity"
      title="Create follow-up from this note">
      <Calendar size={12} />
      {creating ? "Creating…" : "→ Follow-up"}
    </button>
  );
}
