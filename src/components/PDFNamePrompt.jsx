// ─── PDF Name Prompt ──────────────────────────────────────────────────────────
// Slides up before any PDF download allowing the user to customise the filename.
// Usage:
//   <PDFNamePrompt
//     open={showNamePrompt}
//     defaultName="Quote_Anglo_Sishen_2026-07"
//     onConfirm={(name) => downloadPDF(blob, name)}
//     onCancel={() => setShowNamePrompt(false)}
//   />
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Download } from "lucide-react";
import { BRAND } from "../lib/constants";

export function PDFNamePrompt({ open, defaultName = "PowerMate-Export", onConfirm, onCancel }) {
  const [name, setName] = useState(defaultName.replace(/\.pdf$/i, ""));
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setName(defaultName.replace(/\.pdf$/i, ""));
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [open, defaultName]);

  function handleConfirm() {
    const clean = (name.trim() || defaultName).replace(/\.pdf$/i, "");
    onConfirm(`${clean}.pdf`);
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onCancel} className="fixed inset-0 z-[90] bg-black/50 backdrop-blur-sm" />
          <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-[91] rounded-t-3xl bg-white"
            style={{ maxWidth: 480, margin: "0 auto" }}>
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-slate-200" />
            </div>
            <div className="px-6 pb-8 pt-3 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-base font-black text-slate-900">Name your PDF</p>
                <button onClick={onCancel} className="w-9 h-9 rounded-xl flex items-center justify-center bg-slate-100 text-slate-500">
                  <X size={16} />
                </button>
              </div>

              <div className="relative">
                <input
                  ref={inputRef}
                  value={name}
                  onChange={e => setName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleConfirm()}
                  className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50 px-4 py-4 pr-16 text-sm font-bold text-slate-900 outline-none focus:border-red-300 focus:bg-white transition-colors"
                  placeholder="Enter filename…"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-300">.pdf</span>
              </div>

              <p className="text-xs text-slate-400">This is the filename when saved or shared.</p>

              <button onClick={handleConfirm}
                className="w-full flex items-center justify-center gap-2 rounded-2xl py-4 text-sm font-black text-white min-h-[56px]"
                style={{ background: BRAND.primary }}>
                <Download size={16} /> Download PDF
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
