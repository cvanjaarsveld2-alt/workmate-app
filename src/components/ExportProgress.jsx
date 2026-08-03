// ─── Export progress overlay ─────────────────────────────────────────────────
// A shared, app-wide progress indicator for any document export (PDF, Word, or
// an external document). Shows the current stage, an animated progress bar, and
// a live elapsed-time counter so the user can see it's working and how long it's
// taking.
//
// Usage (via the useExportProgress hook):
//
//   const exportProgress = useExportProgress();
//   ...
//   exportProgress.start("Building expense PDF");
//   exportProgress.setStage("Fetching receipt images", 0.4);
//   ... do work ...
//   exportProgress.setStage("Rendering pages", 0.75);
//   ... finish ...
//   exportProgress.done();           // shows ✓ then auto-hides
//   // or on failure:
//   exportProgress.fail("Couldn't build PDF");
//
// Mount <ExportProgressHost/> once near the app root. The hook talks to it.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useRef, useCallback, createContext, useContext } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, Check, AlertTriangle, Loader2 } from "lucide-react";
import { BRAND } from "../lib/constants";

const BRAND_PRIMARY = BRAND.primary;

const ExportProgressContext = createContext(null);

export function ExportProgressProvider({ children }) {
  const [state, setState] = useState({
    open: false,
    label: "Preparing document",
    stage: "",
    progress: 0,      // 0..1
    status: "working", // "working" | "done" | "error"
  });
  const startTimeRef = useRef(null);
  const autoHideRef = useRef(null);

  const clearAutoHide = () => {
    if (autoHideRef.current) { clearTimeout(autoHideRef.current); autoHideRef.current = null; }
  };

  const start = useCallback((label = "Preparing document") => {
    clearAutoHide();
    startTimeRef.current = Date.now();
    setState({ open: true, label, stage: "Preparing…", progress: 0.08, status: "working" });
  }, []);

  const setStage = useCallback((stage, progress) => {
    setState(s => ({
      ...s,
      open: true,
      stage: stage ?? s.stage,
      progress: progress != null ? Math.min(0.95, Math.max(s.progress, progress)) : s.progress,
      status: "working",
    }));
  }, []);

  const done = useCallback((finalLabel) => {
    setState(s => ({ ...s, stage: finalLabel || "Done", progress: 1, status: "done" }));
    clearAutoHide();
    autoHideRef.current = setTimeout(() => setState(s => ({ ...s, open: false })), 1400);
  }, []);

  const fail = useCallback((msg) => {
    setState(s => ({ ...s, stage: msg || "Export failed", status: "error" }));
    clearAutoHide();
    autoHideRef.current = setTimeout(() => setState(s => ({ ...s, open: false })), 3000);
  }, []);

  const hide = useCallback(() => {
    clearAutoHide();
    setState(s => ({ ...s, open: false }));
  }, []);

  useEffect(() => () => clearAutoHide(), []);

  const api = { start, setStage, done, fail, hide };

  return (
    <ExportProgressContext.Provider value={api}>
      {children}
      <ExportProgressHost state={state} startTimeRef={startTimeRef} />
    </ExportProgressContext.Provider>
  );
}

export function useExportProgress() {
  const ctx = useContext(ExportProgressContext);
  // Fallback no-op API if provider isn't mounted (keeps callers safe)
  if (!ctx) {
    return { start: () => {}, setStage: () => {}, done: () => {}, fail: () => {}, hide: () => {} };
  }
  return ctx;
}

function ExportProgressHost({ state, startTimeRef }) {
  const [elapsed, setElapsed] = useState(0);

  // Live elapsed-time ticker while working
  useEffect(() => {
    if (!state.open || state.status !== "working") return;
    const id = setInterval(() => {
      if (startTimeRef.current) setElapsed((Date.now() - startTimeRef.current) / 1000);
    }, 100);
    return () => clearInterval(id);
  }, [state.open, state.status, startTimeRef]);

  // While "working", creep the bar slowly toward 90% so it always feels alive
  // even during a long synchronous render that can't report real progress.
  const [creep, setCreep] = useState(0);
  useEffect(() => {
    if (!state.open || state.status !== "working") { setCreep(0); return; }
    const id = setInterval(() => {
      setCreep(c => Math.min(0.9 - state.progress, c + 0.015));
    }, 200);
    return () => clearInterval(id);
  }, [state.open, state.status, state.progress]);

  const shownProgress = state.status === "done" ? 1
    : state.status === "error" ? state.progress
    : Math.min(0.95, state.progress + creep);

  const pct = Math.round(shownProgress * 100);
  const elapsedLabel = elapsed < 1 ? "under a second" : `${elapsed.toFixed(1)}s`;

  return (
    <AnimatePresence>
      {state.open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm" />
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ type: "spring", damping: 24, stiffness: 320 }}
            className="fixed inset-0 z-[201] flex items-center justify-center px-6 pointer-events-none">
            <div className="w-full max-w-xs rounded-3xl bg-white p-6 shadow-2xl pointer-events-auto">
              {/* Icon */}
              <div className="flex justify-center mb-4">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                  style={{
                    background: state.status === "error" ? "#FEF2F2"
                      : state.status === "done" ? "#F0FDF4" : "#FEF2F2",
                  }}>
                  {state.status === "working" && (
                    <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}>
                      <Loader2 size={26} style={{ color: BRAND_PRIMARY }} />
                    </motion.div>
                  )}
                  {state.status === "done" && (
                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", damping: 12 }}>
                      <Check size={28} style={{ color: "#16A34A" }} />
                    </motion.div>
                  )}
                  {state.status === "error" && <AlertTriangle size={26} style={{ color: BRAND_PRIMARY }} />}
                </div>
              </div>

              {/* Label */}
              <p className="text-center text-base font-black text-slate-900 mb-1">{state.label}</p>
              <p className="text-center text-xs text-slate-400 mb-4 min-h-[16px]">{state.stage}</p>

              {/* Progress bar */}
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden mb-2">
                <motion.div
                  className="h-full rounded-full"
                  style={{
                    background: state.status === "error" ? "#DC2626"
                      : state.status === "done" ? "#16A34A" : BRAND_PRIMARY,
                  }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.3, ease: "easeOut" }} />
              </div>

              {/* Footer: percent + elapsed */}
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-400">
                <span>{state.status === "done" ? "Complete" : state.status === "error" ? "Failed" : `${pct}%`}</span>
                {state.status === "working" && <span>{elapsedLabel}</span>}
                {state.status === "done" && <span>Done in {elapsedLabel}</span>}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
