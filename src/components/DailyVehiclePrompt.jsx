// ─── Daily Vehicle Quick-Check Prompt ────────────────────────────────────────
// Slides up on first app open each weekday if no check has been done today.
// "All Good" → marks every item OK in one tap.
// "Report Issue" → navigates to the Vehicle Check screen.
// Skipping (X) → re-shows next time the app opens.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, AlertTriangle, X, Car } from "lucide-react";
import { BRAND } from "../lib/constants";
import { todayISO, smartDate } from "../lib/helpers";
import { genId } from "../lib/helpers";
import { triggerImmediateSync } from "../lib/sync";
import { offlineSave } from "../offline/offlineDb";

// All checklist items — must match VehicleCheckScreen
const CHECKLIST = [
  { section: "Exterior",   items: ["Body / Frame","Cab / Load Bin","Tonneau Cover / Cargo Net","Bumpers","Tow Bar (if applicable)","License Disk & Plates","Windshield","Wipers & Washers","Locks","Mirrors","Tyres / Wheels (incl. Spare)","Underneath","Suspension"] },
  { section: "Engine",     items: ["Hoses","Fluids — Engine Oil","Fluids — Brake","Fluids — Transmission","Fluids — Radiator","Fluids — Washer","Fluids — Power Steering","Clutch (if applicable)","Belts","Fuel","Battery","Exhaust"] },
  { section: "Electrical", items: ["Daytime Running Lights (if fitted)","Headlight — Low Beam","Headlight — High Beam","Indicators & Hazard Lights","Reverse Lights"] },
  { section: "Interior",   items: ["Clean & Free of Clutter","Foot Wells Clean & Free of Clutter","Windows Clean","Instrument Panel / Warning Lights","Hooter","Driver Controls","Steering","Seats","Seat Belts","Accessories, Radio, BT etc.","Fan, Heater / Demister / Air Con","Fire Extinguisher","First Aid Kit","Warning Triangles","Star Bar","Reverse Hooter","Buggy Whips","Wheel Chocks"] },
  { section: "Operation",  items: ["Sounds (unusual)","Vibrations (unusual)","Indicator or Warning Lights"] },
];
const ALL_ITEMS = CHECKLIST.flatMap(s => s.items);

const SETTINGS_KEY  = "pm_vehicle_settings";
const DISMISSED_KEY = "pm_vehicle_prompt_dismissed"; // "YYYY-MM-DD" — skip until tomorrow

function isWeekday() {
  const day = new Date().getDay();
  return day !== 0 && day !== 6; // 0=Sun, 6=Sat
}

function todayAlreadyDone(vehicleChecks) {
  const today = todayISO();
  const dayData = vehicleChecks?.[today];
  if (!dayData?.items) return false;
  const statuses = Object.values(dayData.items);
  return statuses.length > 0; // any items touched = already started
}

export function DailyVehiclePrompt({ userId, data, setData, onNavigate }) {
  const [open, setOpen] = useState(false);
  const [done, setDone]  = useState(false);
  const today = todayISO();

  const settings = (() => {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"); } catch { return {}; }
  })();
  const vehicle      = settings.vehicle      || "your vehicle";
  const registration = settings.registration || "";
  const driver       = settings.driver       || "";

  useEffect(() => {
    // Only show on weekdays
    if (!isWeekday()) return;
    // Already dismissed today (skipped without completing)
    const dismissed = localStorage.getItem(DISMISSED_KEY);
    if (dismissed === today) return;
    // Already did a check today
    if (todayAlreadyDone(data.vehicleChecks)) return;
    // No vehicle configured yet
    if (!settings.vehicle) return;

    // Small delay so the app renders first
    const t = setTimeout(() => setOpen(true), 800);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line

  function handleSkip() {
    // Don't persist — re-show next time app opens (not set to today)
    setOpen(false);
  }

  function handleAllGood() {
    const items = {};
    ALL_ITEMS.forEach(item => { items[item] = { status: "ok", comment: "" }; });
    const dayData = { items, generalComment: "Quick check — all good." };

    const row = {
      id: `vehicle_check_${userId}_${today}`,
      user_id: userId,
      check_date: today,
      vehicle: settings.vehicle || "",
      registration: settings.registration || "",
      driver: settings.driver || "",
      data: JSON.stringify(dayData),
      sync_status: "pending",
      updated_at: new Date().toISOString(),
    };

    setData(d => ({
      ...d,
      vehicleChecks: { ...(d.vehicleChecks || {}), [today]: dayData },
      syncQueue: [{
        id: genId(), table: "vehicle_checks", action: "upsert",
        data: row, status: "pending", created_at: new Date().toISOString(),
      }, ...(d.syncQueue || [])],
    }));

    offlineSave("vehicle_checks", row).catch(() => {});
    triggerImmediateSync();
    setDone(true);
    setTimeout(() => setOpen(false), 1800);
  }

  function handleReportIssue() {
    setOpen(false);
    onNavigate?.("VehicleCheck");
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm" />

          {/* Sheet */}
          <motion.div
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 280 }}
            className="fixed bottom-0 left-0 right-0 z-[91] rounded-t-3xl bg-white pb-safe"
            style={{ maxWidth: 480, margin: "0 auto" }}>

            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-slate-200" />
            </div>

            <div className="px-6 pb-8 pt-2">

              {/* Success state */}
              {done ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center py-8 gap-3">
                  <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center">
                    <CheckCircle2 size={36} className="text-green-500" />
                  </div>
                  <p className="text-lg font-black text-slate-900">Vehicle check complete</p>
                  <p className="text-sm text-slate-400">All items marked OK ✓</p>
                </motion.div>
              ) : (
                <>
                  {/* Header */}
                  <div className="flex items-start justify-between mb-5">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                        style={{ background: "#F7F3F3" }}>
                        <Car size={22} style={{ color: BRAND.primary }} />
                      </div>
                      <div>
                        <p className="text-base font-black text-slate-900">Daily Vehicle Check</p>
                        <p className="text-sm text-slate-400">{smartDate(today)}</p>
                      </div>
                    </div>
                    <button onClick={handleSkip}
                      className="w-9 h-9 rounded-xl flex items-center justify-center bg-slate-100 text-slate-400 shrink-0">
                      <X size={16} />
                    </button>
                  </div>

                  {/* Vehicle info */}
                  <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4 mb-5">
                    <p className="text-sm font-black text-slate-800">{vehicle}</p>
                    <div className="flex items-center gap-3 mt-1">
                      {registration && <span className="text-xs font-bold text-slate-500 bg-white rounded-lg px-2 py-0.5 border border-slate-200">{registration}</span>}
                      {driver       && <span className="text-xs text-slate-400">{driver}</span>}
                    </div>
                    <p className="text-xs text-slate-400 mt-2">{ALL_ITEMS.length} checklist items</p>
                  </div>

                  {/* Question */}
                  <p className="text-base font-bold text-slate-700 mb-4 text-center">
                    Is everything in order today?
                  </p>

                  {/* Buttons */}
                  <div className="flex gap-3">
                    <button
                      onClick={handleReportIssue}
                      className="flex-1 flex flex-col items-center gap-2 py-4 rounded-2xl border-2 border-amber-200 bg-amber-50 min-h-[80px] active:scale-95 transition-transform">
                      <AlertTriangle size={22} className="text-amber-600" />
                      <span className="text-sm font-black text-amber-700">Report Issue</span>
                      <span className="text-[10px] text-amber-500">Full checklist</span>
                    </button>

                    <button
                      onClick={handleAllGood}
                      className="flex-1 flex flex-col items-center gap-2 py-4 rounded-2xl min-h-[80px] active:scale-95 transition-transform text-white"
                      style={{ background: BRAND.primary }}>
                      <CheckCircle2 size={22} className="text-white" />
                      <span className="text-sm font-black">All Good</span>
                      <span className="text-[10px] text-white/70">Mark all items ✓</span>
                    </button>
                  </div>

                  <p className="text-xs text-slate-300 text-center mt-4">
                    Tap × to skip — you'll be reminded again when you reopen the app
                  </p>
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
