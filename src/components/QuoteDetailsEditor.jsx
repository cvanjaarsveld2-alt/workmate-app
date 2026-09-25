// ─── Detailed quote editor ────────────────────────────────────────────────────
// Optional write-up for a quote: cover page, title, introduction, sections
// with photos and captions, exclusions, and how long the quote is valid.
// Stored on the quote as `details` (see supabase/migrations/*_quote_details.sql)
// and printed by src/lib/documentPDF.js.
import React from "react";
import { ArrowDown, ArrowUp, Plus, Trash2, X, FileText } from "lucide-react";
import { Field } from "./ui";
import { MediaPicker } from "./MediaComponents";
import { genId } from "../lib/helpers";
import { useStoredPhoto } from "../lib/useStoredPhoto";

const SUGGESTED = ["Scope of work", "Site findings", "Recommendations", "Timeline", "Warranty"];
const MAX_PHOTOS_PER_SECTION = 12;

export const emptyDetails = () => ({ title: "", intro: "", cover: false, exclusions: "", sections: [] });

export function hasDetails(d) {
  return !!(d && (d.title || d.intro || d.exclusions || d.cover || (d.sections || []).length));
}

function Thumb({ photo }) {
  const stored = useStoredPhoto(photo.base64 ? null : photo.storage_path);
  const src = photo.base64 || stored.url;
  return src ? (
    <img src={src} alt={photo.caption || "Quote photo"} className="h-24 w-full object-cover rounded-lg" />
  ) : (
    <div className="h-24 w-full rounded-lg bg-slate-100 flex items-center justify-center text-[11px] text-slate-500 text-center px-1">
      {stored.status === "loading" ? "Loading…" : "Photo saved"}
    </div>
  );
}

export function QuoteDetailsEditor({ details, onChange }) {
  const d = details || emptyDetails();
  const set = patch => onChange({ ...d, ...patch });
  const setSection = (id, patch) => set({ sections: d.sections.map(s => (s.id === id ? { ...s, ...patch } : s)) });
  const addSection = title => set({ sections: [...d.sections, { id: genId(), title, body: "", photos: [] }] });
  const move = (i, dir) => {
    const next = [...d.sections];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    set({ sections: next });
  };

  return (
    <details
      className="rounded-xl border-2 border-slate-100 bg-white"
      open={hasDetails(d)}
      data-testid="quote-details"
    >
      <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer min-h-[56px]">
        <FileText size={16} className="text-slate-400 shrink-0" />
        <span className="flex-1">
          <span className="block text-sm font-black text-slate-800">Detailed quote (optional)</span>
          <span className="block text-xs text-slate-500">Cover page, write-up, photos, exclusions</span>
        </span>
      </summary>
      <div className="px-4 pb-4 stack-y-3">
        <label className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3 min-h-[52px] cursor-pointer">
          <span className="text-sm font-bold text-slate-700">Include a cover page</span>
          <input
            type="checkbox"
            checked={!!d.cover}
            onChange={e => set({ cover: e.target.checked })}
            aria-label="Include a cover page"
            className="h-6 w-6"
          />
        </label>
        <Field
          label="Quote title"
          value={d.title}
          onChange={v => set({ title: v })}
          placeholder="e.g. Hydraulic jack service – Shaft 2 shutdown"
          maxLength={160}
        />
        <Field
          label="Introduction"
          value={d.intro}
          onChange={v => set({ intro: v })}
          placeholder="Thank you for the opportunity to quote. Following our site visit on…"
          multiline
          maxLength={8000}
        />

        {d.sections.map((sec, i) => (
          <div key={sec.id} className="rounded-xl border border-slate-200 p-3 stack-y-3" data-testid="quote-section">
            <div className="flex items-center gap-1">
              <span className="flex-1 text-xs font-black text-slate-500 tracking-wider">SECTION {i + 1}</span>
              <button
                type="button"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                aria-label="Move section up"
                className="h-9 w-9 rounded-lg flex items-center justify-center text-slate-500 disabled:opacity-30"
              >
                <ArrowUp size={15} />
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === d.sections.length - 1}
                aria-label="Move section down"
                className="h-9 w-9 rounded-lg flex items-center justify-center text-slate-500 disabled:opacity-30"
              >
                <ArrowDown size={15} />
              </button>
              <button
                type="button"
                onClick={() => set({ sections: d.sections.filter(s => s.id !== sec.id) })}
                aria-label="Remove section"
                className="h-9 w-9 rounded-lg flex items-center justify-center text-red-500"
              >
                <Trash2 size={15} />
              </button>
            </div>
            <Field label="Heading" value={sec.title} onChange={v => setSection(sec.id, { title: v })} maxLength={120} />
            <Field
              label="Text"
              value={sec.body}
              onChange={v => setSection(sec.id, { body: v })}
              multiline
              maxLength={8000}
            />
            {(sec.photos || []).length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {sec.photos.map(p => (
                  <div key={p.id} className="relative">
                    <Thumb photo={p} />
                    <button
                      type="button"
                      onClick={() => setSection(sec.id, { photos: sec.photos.filter(x => x.id !== p.id) })}
                      aria-label="Remove photo"
                      className="absolute top-1 right-1 h-8 w-8 rounded-full bg-black/60 text-white flex items-center justify-center"
                    >
                      <X size={14} />
                    </button>
                    <input
                      value={p.caption || ""}
                      onChange={e =>
                        setSection(sec.id, {
                          photos: sec.photos.map(x => (x.id === p.id ? { ...x, caption: e.target.value } : x)),
                        })
                      }
                      placeholder="Caption"
                      maxLength={200}
                      aria-label="Photo caption"
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm"
                    />
                  </div>
                ))}
              </div>
            )}
            {(sec.photos || []).length < MAX_PHOTOS_PER_SECTION && (
              <MediaPicker
                onAdd={m => {
                  if (m.isVideo || !m.base64) return;
                  setSection(sec.id, {
                    photos: [
                      ...(sec.photos || []),
                      { id: m.id || genId(), base64: m.base64, caption: "", uploadStatus: "pending" },
                    ].slice(0, MAX_PHOTOS_PER_SECTION),
                  });
                }}
              />
            )}
          </div>
        ))}

        <div>
          <p className="mb-2 text-sm font-bold text-slate-500">Add a section</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED.filter(t => !d.sections.some(s => s.title === t)).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => addSection(t)}
                className="rounded-full border-2 border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 min-h-[36px]"
              >
                + {t}
              </button>
            ))}
            <button
              type="button"
              onClick={() => addSection("")}
              className="rounded-full border-2 border-dashed border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-600 min-h-[36px] inline-flex items-center gap-1"
            >
              <Plus size={12} /> Other
            </button>
          </div>
        </div>

        <Field
          label="Exclusions"
          value={d.exclusions}
          onChange={v => set({ exclusions: v })}
          placeholder="e.g. Scaffolding, crane hire and after-hours work are not included."
          multiline
          maxLength={4000}
        />
      </div>
    </details>
  );
}
