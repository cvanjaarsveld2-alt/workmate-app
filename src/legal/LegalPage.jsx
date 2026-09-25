// ─── Terms, privacy policy and data processing agreement ─────────────────────
// Public pages at /?legal=terms | privacy | dpa, readable before signing in.
// Text lives in src/legal/*.md (drafts for legal review).
import React from "react";
import terms from "./terms.md?raw";
import privacy from "./privacy.md?raw";
import dpa from "./dpa.md?raw";
import { PRODUCT_NAME } from "../lib/brand";

export const TERMS_VERSION = "2026-09";
const DOCS = { terms, privacy, dpa };
export const legalHref = which => `/?legal=${which}`;

// Just enough Markdown for these documents: headings, lists, bold, paragraphs.
function inline(text) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <React.Fragment key={i}>{part}</React.Fragment>,
  );
}
export function renderMarkdown(md) {
  const out = [];
  let list = [];
  const flush = () => {
    if (list.length) out.push(<ul key={`l${out.length}`} className="list-disc pl-5 stack-y-1 my-2">{list}</ul>);
    list = [];
  };
  md.split("\n").forEach((line, i) => {
    if (/^- /.test(line)) return list.push(<li key={i}>{inline(line.slice(2))}</li>);
    flush();
    if (/^# /.test(line)) out.push(<h1 key={i} className="text-2xl font-black text-slate-900 mt-2 mb-3">{line.slice(2)}</h1>);
    else if (/^## /.test(line)) out.push(<h2 key={i} className="text-lg font-black text-slate-800 mt-5 mb-1">{line.slice(3)}</h2>);
    else if (line.trim()) out.push(<p key={i} className="my-2 leading-relaxed">{inline(line)}</p>);
  });
  flush();
  return out;
}

export function legalPageFromUrl() {
  try {
    const which = new URLSearchParams(window.location.search).get("legal");
    return DOCS[which] ? which : null;
  } catch {
    return null;
  }
}

export function LegalPage({ which }) {
  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-2xl px-4 py-6 text-[15px] text-slate-700">
        <a href="/" className="text-sm font-bold text-red-700">
          ← Back to {PRODUCT_NAME}
        </a>
        <nav className="mt-3 flex gap-3 text-sm">
          <a href={legalHref("terms")} className={which === "terms" ? "font-bold" : "text-slate-500"}>Terms</a>
          <a href={legalHref("privacy")} className={which === "privacy" ? "font-bold" : "text-slate-500"}>Privacy</a>
          <a href={legalHref("dpa")} className={which === "dpa" ? "font-bold" : "text-slate-500"}>Data processing</a>
        </nav>
        <article className="mt-2">{renderMarkdown(DOCS[which])}</article>
      </div>
    </div>
  );
}
