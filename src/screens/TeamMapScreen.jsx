// ─── Technician map ───────────────────────────────────────────────────────────
// Where each technician was last seen (in the last 12 hours, while clocked
// in), on a map and as a list: to send the closest one. Master account and
// admins only; the database checks. Locations are only shared if the company
// switched it on (Company Details → Technician locations).
import React, { useEffect, useRef, useState } from "react";
import { MapPin, Navigation, RefreshCw } from "lucide-react";
import "leaflet/dist/leaflet.css";
import { supabase } from "../supabase";
import { minutesAgo } from "../lib/location";
import { useCompanyProfile } from "../lib/companyProfile";
import { Btn, Card, PageHeader } from "../components/ui";

const initials = name =>
  String(name || "?")
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join("");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function TeamMapScreen({ teamId, teamMembers = [], isManager = false, isOwner = false, onOpenCompany }) {
  const profile = useCompanyProfile(teamId);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const mapEl = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const name = id => {
    const m = teamMembers.find(t => t.user_id === id);
    return m ? m.full_name || m.email : "Teammate";
  };

  async function load() {
    setError("");
    const { data, error: e } = await supabase.rpc("latest_tech_locations", { p_team_id: teamId });
    if (e) {
      setRows([]);
      return setError(e.message);
    }
    setRows(data || []);
  }
  useEffect(() => {
    if (!teamId || !isManager) return;
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
    // Refreshes every minute while open.
  }, [teamId, isManager]);

  // The map (Leaflet is loaded only on this screen).
  useEffect(() => {
    // The map's element is unmounted while the list is empty; drop the old map
    // so a new one is made on the new element.
    if (map.current && map.current.getContainer() !== mapEl.current) {
      map.current.remove();
      map.current = null;
      layer.current = null;
    }
    if (!rows || !rows.length || !mapEl.current) return;
    let cancelled = false;
    import("leaflet").then(({ default: L }) => {
      if (cancelled || !mapEl.current) return;
      if (!map.current) {
        map.current = L.map(mapEl.current, { zoomControl: true, attributionControl: true });
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 18,
          attribution: "© OpenStreetMap contributors",
        }).addTo(map.current);
      }
      if (layer.current) layer.current.remove();
      layer.current = L.layerGroup().addTo(map.current);
      const points = [];
      for (const r of rows) {
        const ll = [Number(r.lat), Number(r.lng)];
        points.push(ll);
        L.marker(ll, {
          icon: L.divIcon({
            className: "",
            html: `<div style="background:#8B1A1A;color:#fff;border:2px solid #fff;border-radius:999px;width:34px;height:34px;display:flex;align-items:center;justify-content:center;font:700 12px system-ui;box-shadow:0 1px 4px rgba(0,0,0,.4)">${esc(initials(name(r.user_id)))}</div>`,
            iconSize: [34, 34],
            iconAnchor: [17, 17],
          }),
        })
          .bindPopup(`<b>${esc(name(r.user_id))}</b><br>${esc(minutesAgo(r.recorded_at))}${r.job_title ? `<br>${esc(r.job_number || "")} ${esc(r.job_title)}` : ""}`)
          .addTo(layer.current);
      }
      if (points.length === 1) map.current.setView(points[0], 13);
      else map.current.fitBounds(points, { padding: [30, 30], maxZoom: 14 });
    });
    return () => {
      cancelled = true;
    };
    // name() reads teamMembers, which only changes with the team.
  }, [rows]);
  useEffect(
    () => () => {
      if (map.current) map.current.remove();
      map.current = null;
    },
    [],
  );

  if (!isManager) return <Card className="p-6 text-center text-slate-500">Only the master account and admins can see where technicians are.</Card>;

  return (
    <div className="stack-y-4">
      <div className="flex items-start gap-2">
        <PageHeader title="Technician map" subtitle="Where your team was last seen while clocked in (last 12 hours)" />
        <Btn size="sm" variant="secondary" onClick={load} aria-label="Refresh">
          <RefreshCw size={14} />
        </Btn>
      </div>
      {!profile.share_location && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
          Location sharing is off for your company.{" "}
          {isOwner ? (
            <button type="button" onClick={onOpenCompany} className="font-bold underline">
              Switch it on in Company Details
            </button>
          ) : (
            "Your master account can switch it on in Company Details."
          )}
        </div>
      )}
      {error && <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}
      {rows && rows.length > 0 && <div ref={mapEl} className="h-72 w-full rounded-2xl overflow-hidden border border-slate-100" aria-label="Map of technicians" />}
      {rows && rows.length === 0 && !error && (
        <Card className="p-6 text-center text-slate-500">
          <MapPin size={24} className="mx-auto mb-2 text-slate-400" />
          Nobody has shared a location in the last 12 hours. Positions appear while technicians are clocked in on a job.
        </Card>
      )}
      {(rows || []).map(r => (
        <Card key={r.user_id} className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-black shrink-0" style={{ background: "#8B1A1A" }}>
            {initials(name(r.user_id))}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-black text-slate-900 truncate">{name(r.user_id)}</p>
            <p className="text-xs text-slate-500 truncate">
              {minutesAgo(r.recorded_at)}
              {r.job_title ? ` · ${r.job_number || ""} ${r.job_title}` : ""}
              {r.accuracy_m ? ` · within ${r.accuracy_m} m` : ""}
            </p>
          </div>
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${r.lat},${r.lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 rounded-xl border-2 border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 min-h-[44px] flex items-center gap-1"
          >
            <Navigation size={13} /> Directions
          </a>
        </Card>
      ))}
    </div>
  );
}
