import React from "react";
import { ArrowLeft, User, Building2, Calendar, FileText } from "lucide-react";
import { Card } from "../components/ui";
import { smartDate } from "../lib/helpers";

const CONFIG = {
  contacts: { title: r => r.name || "Contact", icon: User, fields: [["Company","company"],["Job title","title"],["Email","email"],["Phone","phone"],["Status","status"],["Met at","met_at"],["Met date","met_date"],["Notes","notes"]] },
  leads: { title: r => r.title || r.client_name || "Opportunity", icon: Building2, fields: [["Client","client_name"],["Contact","contact_name"],["Stage","stage"],["Estimated value","estimated_value"],["Lead date","lead_date"],["Follow-up date","follow_up_date"],["Description","description"],["Notes","notes"],["Outcome","outcome_notes"]] },
  followups: { title: r => r.title || "Follow-up", icon: Calendar, fields: [["Client","client"],["Branch","branch"],["Date","date"],["Time","time"],["Reminder","reminder"],["Completed","completed"],["Assigned to","assigned_to"],["Notes","notes"]] },
};

function displayValue(key, value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (key.includes("date") && /^\d{4}-\d{2}-\d{2}/.test(String(value))) return smartDate(String(value).slice(0,10));
  if (key === "estimated_value") return `R ${Number(value || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`;
  return String(value);
}

export function TeamRecordDetailScreen({ data, teamMembers = [], recordType, recordId, onBack }) {
  const config = CONFIG[recordType];
  const record = config ? (data[recordType] || []).find(r => r.id === recordId) : null;
  if (!config || !record) return <div className="space-y-4"><button onClick={onBack} className="p-3 rounded-xl bg-white"><ArrowLeft size={18}/></button><Card className="p-8 text-center text-slate-400">Record not found</Card></div>;
  const Icon = config.icon || FileText;
  const owner = teamMembers.find(m => m.user_id === record.user_id);
  return <div className="space-y-4">
    <button onClick={onBack} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-100 text-sm font-bold text-slate-600"><ArrowLeft size={16}/> Team Overview</button>
    <Card className="p-5">
      <div className="flex items-center gap-3 mb-5"><div className="w-11 h-11 rounded-2xl bg-red-50 text-red-700 flex items-center justify-center"><Icon size={20}/></div><div><h2 className="text-lg font-black text-slate-900">{config.title(record)}</h2><p className="text-xs text-slate-400">Owner: {owner?.email || record.user_id || "Unknown"}</p></div></div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{config.fields.map(([label,key]) => <div key={key} className={`${key === "notes" || key === "description" || key === "outcome_notes" ? "sm:col-span-2" : ""} rounded-xl bg-slate-50 p-3`}><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p><p className="text-sm font-semibold text-slate-800 whitespace-pre-wrap break-words mt-1">{displayValue(key, record[key])}</p></div>)}</div>
    </Card>
  </div>;
}
