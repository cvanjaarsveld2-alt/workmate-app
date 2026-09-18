import React, { useMemo, useState } from "react";
import { Plus, ArrowLeft, CheckCircle2, Clock3, Wrench, Trash2, Camera, Save } from "lucide-react";
import { BRAND } from "../lib/constants";
import { genId, todayISO, uploadPhotoToSupabaseWithPath, createFreshMediaUrl, compressImage } from "../lib/helpers";
import { offlineSave } from "../offline/offlineDb";
import { Card, Btn, Field, PageHeader, Empty } from "../components/ui";
import { MediaPicker } from "../components/MediaComponents";

const CHECKS = ["Machine safe to work on", "Power isolated / lockout completed", "Visual inspection completed", "Fault identified", "Repair tested"];

export function TechnicianScreen({ data, setData, userId, teamId, onBack }) {
  const [editing, setEditing] = useState(null);
  const reports = useMemo(() => (data.serviceReports || []).slice().sort((a,b) => (b.updated_at || b.created_at || "").localeCompare(a.updated_at || a.created_at || "")), [data.serviceReports]);

  function newJob() {
    setEditing({ id: genId(), user_id: userId, team_id: teamId || null, client_id: null, client_name: "", machine: "", location: "", fault: "", work_done: "", parts_used: [], technician: "", status: "draft", started_at: null, completed_at: null, photos: [], checklist: CHECKS.map(label => ({ label, done: false })), created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  }

  function openJob(r) {
    setEditing({ ...r, parts_used: Array.isArray(r.parts_used) ? r.parts_used : [], photos: Array.isArray(r.photos) ? r.photos : [], checklist: Array.isArray(r.checklist) && r.checklist.length ? r.checklist : CHECKS.map(label => ({ label, done: false })) });
  }

  async function save(report) {
    const clean = { ...report, user_id: userId, team_id: teamId || report.team_id || null, updated_at: new Date().toISOString(), sync_status: "pending" };
    const exists = reports.some(r => r.id === clean.id);
    setData(d => ({ ...d, serviceReports: exists ? (d.serviceReports || []).map(r => r.id === clean.id ? clean : r) : [clean, ...(d.serviceReports || [])], syncQueue: [{ id: genId(), table: "service_reports", action: "upsert", data: clean, status: "pending", created_at: new Date().toISOString() }, ...(d.syncQueue || [])] }));
    await offlineSave("serviceReports", clean).catch(() => {});
    setEditing(null);
  }

  async function startJob() { await save({ ...editing, status: "in_progress", started_at: editing.started_at || new Date().toISOString() }); }
  async function completeJob() { await save({ ...editing, status: "completed", completed_at: new Date().toISOString() }); }

  async function addPhoto(media) {
    const file = media?.file || media;
    if (!file) return;
    try {
      const base64 = await compressImage(file, 1600, 0.75);
      const id = genId();
      const uploaded = await uploadPhotoToSupabaseWithPath(base64 || file, `service-reports/${userId}/${editing.id}/${id}.jpg`);
      setEditing(e => ({ ...e, photos: [...(e.photos || []), { id, url: uploaded?.url || base64, storage_path: uploaded?.path || null }] }));
    } catch { /* keep report usable offline */ }
  }

  function addPart() { setEditing(e => ({ ...e, parts_used: [...(e.parts_used || []), { id: genId(), description: "", quantity: 1 }] })); }

  if (editing) return (
    <div className="space-y-4 pb-28">
      <PageHeader title="Technician Job" subtitle={editing.status === "completed" ? "Completed service report" : editing.status === "in_progress" ? "Job in progress" : "Draft service report"} onBack={() => setEditing(null)} />
      <Card className="p-4 space-y-3">
        <Field label="Customer" value={editing.client_name} onChange={v => setEditing(e => ({...e, client_name:v}))} placeholder="Customer / company" />
        <Field label="Machine / Equipment" value={editing.machine} onChange={v => setEditing(e => ({...e, machine:v}))} placeholder="Machine or equipment" />
        <Field label="Location" value={editing.location} onChange={v => setEditing(e => ({...e, location:v}))} placeholder="Site / location" />
        <Field label="Technician" value={editing.technician} onChange={v => setEditing(e => ({...e, technician:v}))} placeholder="Technician name" />
      </Card>
      <Card className="p-4 space-y-3">
        <p className="text-sm font-black text-slate-700">Safety & job checklist</p>
        {editing.checklist.map((c, i) => <button key={c.label} onClick={() => setEditing(e => ({...e, checklist:e.checklist.map((x,j)=>j===i?{...x,done:!x.done}:x)}))} className="w-full flex items-center gap-3 text-left p-3 rounded-xl bg-slate-50"><span className={`w-6 h-6 rounded-lg flex items-center justify-center ${c.done ? "bg-green-100 text-green-700" : "bg-white border border-slate-200 text-transparent"}`}><CheckCircle2 size={16}/></span><span className="text-sm font-bold text-slate-700">{c.label}</span></button>)}
      </Card>
      <Card className="p-4 space-y-3">
        <Field label="Fault / diagnosis" value={editing.fault} onChange={v => setEditing(e => ({...e, fault:v}))} placeholder="What was found?" multiline />
        <Field label="Work done" value={editing.work_done} onChange={v => setEditing(e => ({...e, work_done:v}))} placeholder="What did you repair or service?" multiline />
      </Card>
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between"><p className="text-sm font-black text-slate-700">Parts used</p><Btn size="sm" variant="secondary" onClick={addPart}><Plus size={14}/> Add part</Btn></div>
        {editing.parts_used.map((p,i)=><div key={p.id} className="flex gap-2"><input value={p.description} onChange={e=>setEditing(x=>({...x,parts_used:x.parts_used.map((q,j)=>j===i?{...q,description:e.target.value}:q)}))} placeholder="Part / material" className="flex-1 rounded-xl border border-slate-200 px-3 py-2.5"/><input type="number" min="1" value={p.quantity} onChange={e=>setEditing(x=>({...x,parts_used:x.parts_used.map((q,j)=>j===i?{...q,quantity:Number(e.target.value)||1}:q)}))} className="w-20 rounded-xl border border-slate-200 px-3 py-2.5"/><button onClick={()=>setEditing(x=>({...x,parts_used:x.parts_used.filter(q=>q.id!==p.id)}))} className="p-2 text-red-500"><Trash2 size={17}/></button></div>)}
      </Card>
      <Card className="p-4 space-y-3">
        <p className="text-sm font-black text-slate-700">Service photos</p>
        <div className="grid grid-cols-2 gap-2">{editing.photos.map(p=><img key={p.id} src={p.url} onError={async e => { const fresh = await createFreshMediaUrl(p); if (fresh) e.currentTarget.src = fresh; }} alt="Service" className="w-full h-32 object-cover rounded-xl"/>)}</div>
        <MediaPicker onAdd={addPhoto}><Camera size={16}/> Add photo</MediaPicker>
      </Card>
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur border-t border-slate-100 p-3 max-w-2xl mx-auto flex gap-2">
        <Btn variant="secondary" className="flex-1" onClick={()=>save(editing)}><Save size={15}/> Save</Btn>
        {editing.status === "draft" && <Btn className="flex-1" onClick={startJob}><Clock3 size={15}/> Start job</Btn>}
        {editing.status === "in_progress" && <Btn className="flex-1" onClick={completeJob}><CheckCircle2 size={15}/> Complete</Btn>}
      </div>
    </div>
  );

  return <div className="space-y-4 pb-24"><PageHeader title="Technician" subtitle={reports.length ? `${reports.length} service report${reports.length===1?"":"s"}` : "Field service workflow"} onBack={onBack}/><button onClick={newJob} className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-white font-black min-h-[56px]" style={{background:BRAND.primary}}><Plus size={18}/> New service job</button>{reports.length===0?<Empty icon={Wrench} title="No service jobs yet" text="Start a job, complete the safety checklist, record the fault and work done, add parts and photos, then complete the service report." actionLabel="New service job" onAction={newJob}/>:<div className="space-y-2">{reports.map(r=><button key={r.id} onClick={()=>openJob(r)} className="w-full text-left"><Card className="p-4"><div className="flex items-start gap-3"><div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">{r.status==="completed"?<CheckCircle2 className="text-green-600" size={19}/>:<Wrench size={19}/>}</div><div className="min-w-0 flex-1"><p className="font-black text-slate-800 truncate">{r.client_name || "Service job"}</p><p className="text-sm text-slate-500 truncate">{r.machine || "Equipment not specified"}{r.location?` · ${r.location}`:""}</p><p className="text-xs text-slate-400 mt-1">{r.status === "completed" ? "Completed" : r.status === "in_progress" ? "In progress" : "Draft"}</p></div></div></Card></button>)}</div>}</div>;
}
