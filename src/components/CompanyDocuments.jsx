// ─── Company Documents Manager ───────────────────────────────────────────────
// Upload and manage company documents (PDFs, brochures, price lists).
// Lives in the More screen. Documents are stored in Supabase Storage and
// their metadata in the company_documents table.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, Upload, Trash2, Plus, X, FolderOpen } from "lucide-react";
import { supabase } from "../supabase";
import { genId } from "../lib/helpers";
import { Card, Btn, Toast, useConfirm } from "../components/ui";

const CATEGORIES = [
  "Company Profile",
  "Brochure",
  "Price List",
  "Capability Statement",
  "Product Datasheet",
  "Case Study",
  "Other",
];

const CATEGORY_COLORS = {
  "Company Profile":      { bg: "#EDE9FE", text: "#5B21B6" },
  "Brochure":             { bg: "#DBEAFE", text: "#1E40AF" },
  "Price List":           { bg: "#DCFCE7", text: "#166534" },
  "Capability Statement": { bg: "#FFE4D9", text: "#7C2D12" },
  "Product Datasheet":    { bg: "#FEF3C7", text: "#92400E" },
  "Case Study":           { bg: "#F0FDF4", text: "#15803D" },
  "Other":                { bg: "#F1F5F9", text: "#64748B" },
};

function formatBytes(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

export function CompanyDocuments({ userId }) {
  const [docs, setDocs]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showForm, setShowForm]   = useState(false);
  const [toast, setToast]         = useState("");
  const [docName, setDocName]     = useState("");
  const [category, setCategory]   = useState("Company Profile");
  const [selectedFile, setSelectedFile] = useState(null);
  const fileInputRef = useRef(null);
  const { confirm, dialog } = useConfirm();

  useEffect(() => {
    loadDocs();
  }, [userId]);

  async function loadDocs() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("company_documents")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (!error) setDocs(data || []);
    } catch (e) {
      console.warn("Failed to load docs:", e);
    }
    setLoading(false);
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    // Pre-fill name from filename if blank
    if (!docName) {
      setDocName(file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " "));
    }
  }

  async function handleUpload() {
    if (!selectedFile || !docName.trim()) {
      setToast("Please select a file and enter a name");
      return;
    }
    setUploading(true);
    setUploadProgress(10);

    try {
      // Upload to Supabase Storage
      const ext      = selectedFile.name.split(".").pop();
      const path     = `company-docs/${userId}/${genId()}.${ext}`;
      setUploadProgress(30);

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("company-docs")
        .upload(path, selectedFile, { upsert: false });

      if (uploadError) throw uploadError;
      setUploadProgress(70);

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("company-docs")
        .getPublicUrl(path);

      setUploadProgress(85);

      // Save metadata to table
      const { data: doc, error: insertError } = await supabase
        .from("company_documents")
        .insert({
          user_id:   userId,
          name:      docName.trim(),
          category,
          file_url:  urlData.publicUrl,
          file_name: selectedFile.name,
          file_size: selectedFile.size,
        })
        .select()
        .single();

      if (insertError) throw insertError;
      setUploadProgress(100);

      setDocs(d => [doc, ...d]);
      setToast(`"${docName}" uploaded ✓`);
      setDocName("");
      setCategory("Company Profile");
      setSelectedFile(null);
      setShowForm(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (e) {
      console.error("Upload failed:", e);
      setToast("Upload failed: " + (e.message || "check your connection"));
    }

    setUploading(false);
    setUploadProgress(0);
  }

  async function handleDelete(doc) {
    const ok = await confirm(`Delete "${doc.name}"? This cannot be undone.`, { confirmLabel: "Delete" });
    if (!ok) return;

    try {
      // Remove from storage
      const path = doc.file_url.split("/company-docs/")[1];
      if (path) {
        await supabase.storage.from("company-docs").remove([path]);
      }
      // Remove from table
      await supabase.from("company_documents").delete().eq("id", doc.id);
      setDocs(d => d.filter(x => x.id !== doc.id));
      setToast("Document deleted");
    } catch (e) {
      console.error("Delete failed:", e);
      setToast("Delete failed");
    }
  }

  const grouped = docs.reduce((acc, doc) => {
    if (!acc[doc.category]) acc[doc.category] = [];
    acc[doc.category].push(doc);
    return acc;
  }, {});

  return (
    <Card className="p-4 space-y-3">
      {dialog}
      <AnimatePresence>{toast && <Toast message={toast} onDone={() => setToast("")} />}</AnimatePresence>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FolderOpen size={16} style={{ color: "#8B1A1A" }} />
          <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">Company Documents</p>
        </div>
        <Btn size="sm" onClick={() => setShowForm(v => !v)}>
          {showForm ? <X size={14} /> : <Plus size={14} />}
          {showForm ? "Cancel" : "Upload"}
        </Btn>
      </div>

      <p className="text-sm text-slate-500">
        Upload company profiles, brochures and price lists once — then send them to any contact or client directly from their card.
      </p>

      {/* Upload form */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-3">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">New Document</p>

              {/* File picker */}
              <div>
                <label className="mb-1.5 block text-sm font-bold text-slate-500">File (PDF, Word, etc.)</label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full rounded-xl border-2 border-dashed border-slate-200 bg-white p-4 text-center cursor-pointer hover:border-red-300 hover:bg-red-50 transition-colors min-h-[72px] flex flex-col items-center justify-center gap-1">
                  {selectedFile ? (
                    <>
                      <FileText size={20} className="text-green-600" />
                      <p className="text-sm font-bold text-slate-700">{selectedFile.name}</p>
                      <p className="text-xs text-slate-400">{formatBytes(selectedFile.size)}</p>
                    </>
                  ) : (
                    <>
                      <Upload size={20} className="text-slate-400" />
                      <p className="text-sm font-bold text-slate-500">Tap to choose file</p>
                      <p className="text-xs text-slate-400">PDF, Word, Excel, PowerPoint</p>
                    </>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                  onChange={handleFileChange}
                  className="hidden" />
              </div>

              {/* Name */}
              <div>
                <label className="mb-1.5 block text-sm font-bold text-slate-500">Display Name</label>
                <input
                  value={docName}
                  onChange={e => setDocName(e.target.value)}
                  placeholder="e.g. Company Profile 2026"
                  className="w-full rounded-xl border-2 border-slate-100 bg-white p-3 text-sm outline-none focus:border-red-300 min-h-[44px]" />
              </div>

              {/* Category */}
              <div>
                <label className="mb-1.5 block text-sm font-bold text-slate-500">Category</label>
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  className="w-full rounded-xl border-2 border-slate-100 bg-white p-3 text-sm outline-none focus:border-red-300 min-h-[44px]">
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {/* Progress */}
              {uploading && (
                <div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <motion.div className="h-full rounded-full" style={{ background: "#8B1A1A" }}
                      animate={{ width: `${uploadProgress}%` }} transition={{ duration: 0.3 }} />
                  </div>
                  <p className="text-xs text-slate-500 mt-1 text-center">Uploading… {uploadProgress}%</p>
                </div>
              )}

              <Btn className="w-full" onClick={handleUpload} disabled={uploading || !selectedFile || !docName.trim()}>
                <Upload size={15} /> {uploading ? "Uploading…" : "Upload Document"}
              </Btn>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Document list */}
      {loading ? (
        <p className="text-sm text-slate-400 text-center py-4">Loading documents…</p>
      ) : docs.length === 0 ? (
        <div className="rounded-xl bg-slate-50 p-4 text-center">
          <FileText size={28} className="text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-bold text-slate-500">No documents yet</p>
          <p className="text-xs text-slate-400 mt-1">Upload your company profile, brochures and price lists to send them directly from contact cards.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {Object.entries(grouped).map(([cat, catDocs]) => {
            const cc = CATEGORY_COLORS[cat] || CATEGORY_COLORS.Other;
            return (
              <div key={cat}>
                <p className="text-xs font-bold uppercase tracking-wider px-1 mb-1.5"
                  style={{ color: cc.text }}>{cat}</p>
                <div className="space-y-1.5">
                  {catDocs.map(doc => (
                    <div key={doc.id}
                      className="flex items-center gap-3 rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                        style={{ background: cc.bg, color: cc.text }}>
                        <FileText size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-800 truncate">{doc.name}</p>
                        <p className="text-xs text-slate-400">{doc.file_name}{doc.file_size ? ` · ${formatBytes(doc.file_size)}` : ""}</p>
                      </div>
                      <a href={doc.file_url} target="_blank" rel="noreferrer"
                        className="p-2 rounded-lg text-slate-400 hover:text-blue-600 min-w-[36px] min-h-[36px] flex items-center justify-center">
                        <FileText size={14} />
                      </a>
                      <button onClick={() => handleDelete(doc)}
                        className="p-2 rounded-lg text-slate-400 hover:text-red-600 min-w-[36px] min-h-[36px] flex items-center justify-center">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
