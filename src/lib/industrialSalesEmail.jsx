import { PRODUCT_NAME } from "./brand";
import { emailSignature } from "./me";
import React, { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronLeft, Mail, Sparkles, X } from "lucide-react";
import { supabase } from "../supabase";

export const SALES_INTERACTIONS = [
  ["site", "🏭", "Met at site"],
  ["expo", "🎪", "Met at an expo/event"],
  ["meeting", "🤝", "Client meeting"],
  ["call", "📞", "Phone call"],
  ["referral", "👥", "Referral / introduction"],
  ["email", "📧", "Previous email"],
];

export const SALES_GOALS = [
  ["conversation", "Start a conversation"],
  ["site_visit", "Arrange a site visit"],
  ["meeting", "Book a meeting/call"],
  ["quote", "Discuss a quote / RFQ"],
  ["information", "Send information"],
  ["followup", "Continue the discussion"],
];

export const INDUSTRIAL_IMPACTS = [
  "Production / throughput",
  "Equipment availability",
  "Reliability",
  "Downtime",
  "Maintenance workload",
  "Repair turnaround time",
  "Lead time / spares",
  "Safety / compliance",
  "Project / shutdown schedule",
  "Cost / operating efficiency",
];

function clean(v) { return String(v || "").trim(); }
function firstName(name) { return clean(name).split(/\s+/)[0] || "there"; }

export function gapCheck(input, email) {
  const checks = [
    ["context", "Interaction is established", !!clean(input.interaction)],
    ["current", "Current situation is clear", !!clean(input.currentSituation)],
    ["problem", "Problem / requirement is identified", !!clean(input.problem)],
    ["impact", "Operational impact is supported by known facts", !clean(input.impact) || !/\b(no concern|none|n\/a|not known|unknown)\b/i.test(clean(input.impact))],
    ["desired", "Desired outcome is clear", !!clean(input.desiredOutcome)],
    ["gap", "Current-to-desired gap is understandable", !!clean(input.problem) && !!clean(input.desiredOutcome)],
    ["evidence", "No unsupported financial or operational claims", !/R\\s?\\d|\\$\\s?\\d|\\d+%|\\bguarantee(d)?\\b|\\bwill save\\b|\\bwill reduce\\b/i.test(email)],
    ["cta", "One clear next step", !!clean(input.goal)],
    ["length", "Email is concise", email.length <= 2200],
  ];
  return checks.map(([id, label, pass]) => ({ id, label, pass }));
}

function interactionPhrase(id) {
  return ({
    site: "at the site",
    expo: "at the expo/event",
    meeting: "at our meeting",
    call: "on our call",
    referral: "through the introduction",
    email: "in our recent emails",
  })[id] || "recently";
}
function goalText(id) {
  return ({
    conversation: "have a short conversation",
    site_visit: "arrange a site visit",
    meeting: "arrange a short meeting or call",
    quote: "discuss the requirement and next steps",
    information: "send through the relevant information",
    followup: "continue the discussion",
  })[id] || "continue the discussion";
}

export function generateIndustrialSalesEmail(contact, input) {
  const name = firstName(contact?.name);
  const company = clean(contact?.company) || "your team";
  const interaction = interactionPhrase(input.interaction);
  const current = clean(input.currentSituation);
  const problem = clean(input.problem);
  const impact = clean(input.impact);
  const desired = clean(input.desiredOutcome);
  const goal = goalText(input.goal);
  const metAt = clean(input.metAt) || clean(contact?.met_at);
  const topic = clean(input.topic);

  const subject = input.interaction === "expo"
    ? `Good meeting you at ${metAt || "the expo"}`
    : input.interaction === "site"
      ? `Following up after our site visit`
      : `Following up on our conversation`;

  const lines = [
    `Hi ${name},`,
    "",
    `It was great meeting you ${metAt ? `at ${metAt}` : interaction}.`,
    topic ? `We spoke about ${topic}.` : "",
    current ? `From our conversation, I understand that ${current}.` : "",
    problem ? `You mentioned that ${problem}.` : "",
    impact ? `You also mentioned that this is affecting ${impact}.` : "",
    desired ? `It sounds like the outcome you'd like to achieve is ${desired}.` : "",
    problem && desired ? `I'd be interested to understand a little more about the gap between the current situation and where you'd like to be.` : "",
    "",
    `If this is still a priority for ${company}, I'd be happy to ${goal} and see whether there is an opportunity for us to assist.`,
    "",
    "Would you be available for a short discussion next week?",
    "",
    ...emailSignature("Kind regards,").split("\n"),
  ];

  return {
    subject,
    body: lines.filter((line, i, arr) => !(line === "" && arr[i - 1] === "")).join("\n"),
  };
}

export function SalesFollowupComposer({ contact, onClose }) {
  const [step, setStep] = useState(1);
  const [copied, setCopied] = useState(false);
  const [aiPolishing, setAiPolishing] = useState(false);
  const [aiMessage, setAiMessage] = useState("");
  const [input, setInput] = useState({
    interaction: contact?.met_at ? "site" : "site",
    metAt: contact?.met_at || "",
    topic: "",
    currentSituation: "",
    problem: "",
    impact: "",
    desiredOutcome: "",
    goal: "conversation",
  });
  const [email, setEmail] = useState(null);

  const checks = useMemo(() => email ? gapCheck(input, email.body) : [], [input, email]);
  const passed = checks.filter(c => c.pass).length;

  function generate() {
    setEmail(generateIndustrialSalesEmail(contact, input));
    setStep(3);
  }
  async function professionaliseWithAI() {
    if (!email || aiPolishing) return;
    setAiPolishing(true);
    setAiMessage("");
    try {
      const { data, error } = await supabase.functions.invoke("polish-sales-email", {
        body: {
          subject: email.subject,
          email: email.body,
          context: {
            name: contact?.name,
            company: contact?.company,
            interaction: input.interaction,
            metAt: input.metAt,
            topic: input.topic,
            currentSituation: input.currentSituation,
            problem: input.problem,
            impact: input.impact,
            desiredOutcome: input.desiredOutcome,
            goal: input.goal,
          },
        },
      });
      if (error) throw error;
      if (!data?.email?.body) throw new Error("No polished email returned");
      setEmail({ subject: data.email.subject || email.subject, body: data.email.body });
      setAiMessage(data.mode === "ai" ? "AI refined the wording without adding new facts." : data?.reason ? `AI unavailable (${data.reason}) — original email retained.` : "AI service unavailable — original email retained.");
    } catch {
      setAiMessage("AI could not refine this email right now. Your original draft is still available.");
    } finally {
      setAiPolishing(false);
    }
  }

  async function copy() {
    if (!email) return;
    try {
      await navigator.clipboard.writeText(`Subject: ${email.subject}\n\n${email.body}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  }
  function openEmail() {
    if (!email || !contact?.email) return;
    window.location.href = `mailto:${contact.email}?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`;
  }

  const set = (key, value) => setInput(v => ({ ...v, [key]: value }));
  if (!contact) return null;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-130 flex items-end justify-center bg-black/50" onClick={onClose}>
      <motion.div initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }}
        className="w-full max-w-md bg-white rounded-t-3xl overflow-hidden max-h-[94vh] flex flex-col"
        onClick={e => e.stopPropagation()} style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="flex items-center justify-between p-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-red-50 text-red-700"><Sparkles size={17}/></div>
            <div className="min-w-0">
              <p className="text-sm font-black text-slate-900">Sales Follow-Up</p>
              <p className="text-xs text-slate-400 truncate">{contact.name} · {contact.company || "Industrial contact"}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl bg-slate-50 text-slate-400"><X size={16}/></button>
        </div>

        <div className="px-4 pt-3">
          <div className="flex gap-1">
            {[1,2,3].map(n => <div key={n} className="h-1.5 flex-1 rounded-full" style={{background: n <= step ? "#8B1A1A" : "#E2E8F0"}} />)}
          </div>
        </div>

        <div className="p-4 overflow-y-auto stack-y-4">
          {step === 1 && <>
            <div>
              <p className="text-base font-black text-slate-900">How did you meet?</p>
              <p className="text-xs text-slate-500 mt-1">This keeps the opening natural and relevant.</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {SALES_INTERACTIONS.map(([id, emoji, label]) => (
                <button key={id} onClick={() => set("interaction", id)}
                  className="text-left rounded-xl border-2 p-3 min-h-[64px]"
                  style={input.interaction === id ? {borderColor:"#8B1A1A",background:"#FFF5F5"} : {borderColor:"#E2E8F0"}}>
                  <span className="text-lg">{emoji}</span><p className="text-xs font-bold text-slate-700 mt-1">{label}</p>
                </button>
              ))}
            </div>
            <Field label="Site / expo / event name" value={input.metAt} onChange={v=>set("metAt",v)} placeholder="e.g. Electra Mining, Anglo site" />
            <Field label="What did you discuss?" value={input.topic} onChange={v=>set("topic",v)} placeholder="e.g. conveyor maintenance, fabrication, hydraulic repairs" multiline />
            <button onClick={()=>setStep(2)} className="w-full rounded-xl py-3 text-sm font-bold text-white" style={{background:"#8B1A1A"}}>Next →</button>
          </>}

          {step === 2 && <>
            <div>
              <p className="text-base font-black text-slate-900">Find the gap</p>
              <p className="text-xs text-slate-500 mt-1">Only enter what you actually know. {PRODUCT_NAME} will not invent costs, downtime or operational impact.</p>
            </div>
            <Field label="Current situation" value={input.currentSituation} onChange={v=>set("currentSituation",v)} placeholder="e.g. The plant is dealing with recurring conveyor failures." multiline />
            <Field label="Problem / requirement" value={input.problem} onChange={v=>set("problem",v)} placeholder="e.g. Repair turnaround is causing maintenance delays." multiline />
            <Field label="Operational impact (if known)" value={input.impact} onChange={v=>set("impact",v)} placeholder="e.g. Unplanned maintenance interruptions." multiline />
            <Field label="Desired outcome" value={input.desiredOutcome} onChange={v=>set("desiredOutcome",v)} placeholder="e.g. Improve equipment reliability and turnaround time." multiline />
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Next step</label>
              <select value={input.goal} onChange={e=>set("goal",e.target.value)} className="w-full rounded-xl border-2 border-slate-100 bg-slate-50 p-3 text-sm" style={{fontSize:16}}>
                {SALES_GOALS.map(([id,label])=><option key={id} value={id}>{label}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={()=>setStep(1)} className="rounded-xl border-2 border-slate-200 py-3 text-sm font-bold text-slate-600"><ChevronLeft size={14} className="inline"/> Back</button>
              <button onClick={generate} className="rounded-xl py-3 text-sm font-bold text-white" style={{background:"#8B1A1A"}}>Generate →</button>
            </div>
          </>}

          {step === 3 && email && <>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-black uppercase tracking-wider text-slate-500">Gap-Selling check</p>
              <div className="grid grid-cols-1 gap-1.5 mt-2">
                {checks.map(c=><div key={c.id} className="flex items-center gap-2 text-xs">
                  <span className={c.pass ? "text-green-600" : "text-amber-600"}>{c.pass ? "✓" : "•"}</span>
                  <span className={c.pass ? "text-slate-600" : "text-amber-700"}>{c.label}{!c.pass ? " — add this if you know it" : ""}</span>
                </div>)}
              </div>
              <p className="text-[11px] font-bold text-slate-400 mt-2">{passed}/{checks.length} checks supported</p>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Subject</label>
              <input value={email.subject} onChange={e=>setEmail(v=>({...v,subject:e.target.value}))} className="w-full rounded-xl border-2 border-slate-100 bg-slate-50 p-3 text-sm" style={{fontSize:16}} />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Email — edit before sending</label>
              <textarea value={email.body} onChange={e=>setEmail(v=>({...v,body:e.target.value}))} rows={13} className="w-full rounded-xl border-2 border-slate-100 bg-slate-50 p-3 text-sm resize-none" style={{fontSize:16}} />
            </div>
            <button
              onClick={professionaliseWithAI}
              disabled={aiPolishing}
              className="w-full rounded-xl py-3 text-sm font-bold border-2 disabled:opacity-60"
              style={{borderColor:"#F3C4C4",background:"#FFF7F7",color:"#8B1A1A"}}>
              <Sparkles size={15} className="inline mr-1" />
              {aiPolishing ? "Professionalising…" : "Professionalise with AI"}
            </button>
            {aiMessage && <p className="text-[11px] text-center text-slate-400">{aiMessage}</p>}
            <div className="grid grid-cols-2 gap-2">
              <button onClick={copy} className="rounded-xl border-2 py-3 text-sm font-bold" style={{borderColor:copied?"#16A34A":"#E2E8F0",color:copied?"#16A34A":"#475569"}}>{copied ? "Copied ✓" : "Copy"}</button>
              <button onClick={openEmail} disabled={!contact.email} className="rounded-xl py-3 text-sm font-bold text-white disabled:opacity-40" style={{background:"#0078D4"}}><Mail size={14} className="inline mr-1"/> Open Email</button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={()=>setStep(2)} className="rounded-xl border-2 border-slate-200 py-2.5 text-xs font-bold text-slate-600">← Improve inputs</button>
              <button onClick={generate} className="rounded-xl border-2 border-slate-200 py-2.5 text-xs font-bold text-slate-600">↻ Regenerate</button>
            </div>
          </>}
        </div>
      </motion.div>
    </motion.div>
  );
}

function Field({label,value,onChange,placeholder,multiline=false}) {
  const C = multiline ? "textarea" : "input";
  return <div>
    <label className="text-xs font-bold text-slate-500 mb-1 block">{label}</label>
    <C value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
      rows={multiline ? 3 : undefined} className="w-full rounded-xl border-2 border-slate-100 bg-slate-50 p-3 text-sm outline-hidden focus:border-red-200 resize-none" style={{fontSize:16}} />
  </div>;
}
