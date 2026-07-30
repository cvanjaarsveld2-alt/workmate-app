// ─── Onboarding ──────────────────────────────────────────────────────────────
// Shown once, on first login. Four quick slides that orient a new teammate
// so they don't land in an empty app with no idea what to do.
// Dismissal is stored per-user so it never shows twice.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, Camera, Mic, Bell, ChevronRight, Check,
} from "lucide-react";
import { BRAND } from "../lib/constants";
import { haptic } from "../lib/haptics";

const SLIDES = [
  {
    icon: Users,
    title: "Welcome to PowerMate",
    body: "Your field CRM for Power Works. Clients, quotes, follow-ups and vehicle checks — all in one place, even offline on site.",
    color: BRAND.primary,
  },
  {
    icon: Camera,
    title: "Snap a receipt, done",
    body: "Photograph any slip and PowerMate reads the vendor, amount and VAT automatically. Your expense claim builds itself.",
    color: "#D97706",
  },
  {
    icon: Mic,
    title: "Talk instead of type",
    body: "Add notes by voice in English or Afrikaans. Record a site meeting and get structured minutes with action items.",
    color: "#16A34A",
  },
  {
    icon: Bell,
    title: "Never drop a client",
    body: "PowerMate warns you when a client's gone quiet, reminds you of follow-ups, and keeps the whole team in sync.",
    color: "#7C3AED",
  },
];

export function Onboarding({ userId, onDone }) {
  const [i, setI] = useState(0);
  const slide = SLIDES[i];
  const last = i === SLIDES.length - 1;
  const Icon = slide.icon;

  function next() {
    haptic.light();
    if (last) finish();
    else setI(i + 1);
  }
  function skip() { finish(); }
  function finish() {
    try { localStorage.setItem(`pm_onboarded_${userId}`, "1"); } catch {}
    haptic.success();
    onDone();
  }

  return (
    <div className="fixed inset-0 z-[200] flex flex-col" style={{ background: "#fff" }}>
      {/* Skip */}
      <div className="flex justify-end p-4">
        {!last && (
          <button onClick={skip} className="text-sm font-bold text-slate-400 px-3 py-2">
            Skip
          </button>
        )}
      </div>

      {/* Slide content */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={i}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="flex flex-col items-center">
            <div className="w-24 h-24 rounded-3xl flex items-center justify-center mb-8"
              style={{ background: `${slide.color}18` }}>
              <Icon size={44} style={{ color: slide.color }} />
            </div>
            <h1 className="text-2xl font-black text-slate-900 mb-3 leading-tight">
              {slide.title}
            </h1>
            <p className="text-base text-slate-500 leading-relaxed max-w-sm">
              {slide.body}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Dots + button */}
      <div className="px-8 pb-10 space-y-6">
        <div className="flex justify-center gap-2">
          {SLIDES.map((_, idx) => (
            <div key={idx}
              className="h-2 rounded-full transition-all duration-300"
              style={{
                width: idx === i ? 24 : 8,
                background: idx === i ? slide.color : "#E2E8F0",
              }} />
          ))}
        </div>
        <button onClick={next}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-white font-black text-base min-h-[56px]"
          style={{ background: slide.color }}>
          {last ? <><Check size={20} /> Get started</> : <>Next <ChevronRight size={20} /></>}
        </button>
      </div>
    </div>
  );
}

export function shouldShowOnboarding(userId) {
  try { return localStorage.getItem(`pm_onboarded_${userId}`) !== "1"; }
  catch { return false; }
}
