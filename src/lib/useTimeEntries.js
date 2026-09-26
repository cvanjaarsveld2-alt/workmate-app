// Time entries for the Jobs and Timesheets screens: what's on the device first,
// then the last 90 days from the server. Clocking in and out goes through the
// sync queue, so it works offline.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabase";
import { offlineGetAll, offlineSave } from "../offline/offlineDb";
import { saveAndSync } from "./sync";
import { genId } from "./helpers";
import { deleteRecord } from "./deleteHelpers";
import { newEntry, runningEntry, stopEntry } from "./timesheets";

export function useTimeEntries({ userId, teamId, online, setData }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) return;
    const local = await offlineGetAll("time_entries").catch(() => []);
    setEntries(local || []);
    if (online) {
      const since = new Date(Date.now() - 90 * 86400000).toISOString();
      const { data, error } = await supabase
        .from("time_entries")
        .select("*")
        .gte("started_at", since)
        .order("started_at", { ascending: false })
        .limit(5000);
      if (!error) {
        // Keep entries still waiting to sync from this device.
        const pending = (local || []).filter(e => e.sync_status === "pending" && !(data || []).some(d => d.id === e.id));
        const merged = [...(data || []), ...pending];
        setEntries(merged);
        await Promise.all((data || []).map(x => offlineSave("time_entries", { ...x, sync_status: "synced" }).catch(() => {})));
      }
    }
    setLoading(false);
  }, [userId, online]);

  useEffect(() => {
    load();
  }, [load, teamId]);

  const save = useCallback(
    async (entry, action) => {
      setEntries(list => [entry, ...list.filter(e => e.id !== entry.id)]);
      const saved = await saveAndSync(entry, "time_entries", action, setData || (() => {}), online);
      if (saved) setEntries(list => list.map(e => (e.id === entry.id ? saved : e)));
      return saved || entry;
    },
    [online, setData],
  );

  const running = runningEntry(entries, userId);

  // Starting a new clock stops the one that's running (one at a time).
  const clockIn = useCallback(
    async ({ job = null, kind = "work" } = {}) => {
      if (running) await save(stopEntry(running), "update");
      return save(newEntry({ id: genId(), userId, teamId, job, kind }), "insert");
    },
    [running, save, userId, teamId],
  );
  const clockOut = useCallback(async () => (running ? save(stopEntry(running), "update") : null), [running, save]);
  const remove = useCallback(
    async entry => {
      setEntries(list => list.filter(e => e.id !== entry.id));
      await deleteRecord("time_entries", entry.id, entry.user_id, setData || (() => {}));
    },
    [setData],
  );

  return { entries, loading, running, clockIn, clockOut, save, remove, reload: load };
}
