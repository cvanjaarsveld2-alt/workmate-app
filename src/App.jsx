import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Bell, BriefcaseBusiness, CalendarCheck, CalendarDays, Camera, ChevronRight,
  ClipboardList, Clock, FileText, Home, Link as LinkIcon, Mail, MapPin, Mic,
  Phone, Plus, Search, Upload, Users, Wrench
} from "lucide-react";

const today = new Date("2026-05-03T12:00:00+02:00");

const clients = [
  { id: 1, name: "ABC Mining", contact: "Pieter Botha", phone: "082 555 0142", email: "pieter@abcmining.co.za", location: "Rustenburg Shaft 3", lastConversation: "2026-04-28", nextFollowUp: "2026-05-06", status: "Quote follow-up", value: "R185,000", notes: "Interested in hydraulic starter solution for underground fleet." },
  { id: 2, name: "Kopano Plant Hire", contact: "Thabo Mokoena", phone: "073 222 1988", email: "thabo@kopanoplant.co.za", location: "Johannesburg", lastConversation: "2026-04-18", nextFollowUp: "2026-05-03", status: "Service required", value: "R42,500", notes: "Compressor starter system requires field service inspection." },
  { id: 3, name: "Northern Tooling Supply", contact: "Anika Smith", phone: "011 555 7830", email: "sales@northerntooling.co.za", location: "Benoni", lastConversation: "2026-03-27", nextFollowUp: "2026-05-10", status: "Cold lead", value: "R0", notes: "Potential distributor for field service equipment." },
];

const dailyPlan = [
  { id: 1, time: "09:00", title: "Inspect hydraulic starter", client: "ABC Mining", location: "Rustenburg Shaft 3", type: "Service" },
  { id: 2, time: "11:30", title: "Product demo", client: "Northern Tooling Supply", location: "Benoni", type: "Sales" },
  { id: 3, time: "15:00", title: "Follow up on quote", client: "Kopano Plant Hire", location: "Phone call", type: "Follow-up" },
];

const docs = [
  { id: 1, name: "ABC Mining starter photos", type: "Photos", date: "2026-04-28" },
  { id: 2, name: "Weekly sales report", type: "PDF", date: "2026-04-30" },
  { id: 3, name: "Kopano job card", type: "PDF", date: "2026-04-18" },
];

function Card({ className = "", children }) {
  return <div className={`bg-white ${className}`}>{children}</div>;
}

function CardContent({ className = "", children }) {
  return <div className={className}>{children}</div>;
}

function Button({ children, className = "", variant = "solid", size, onClick }) {
  const base = "inline-flex items-center justify-center font-semibold transition active:scale-[0.98]";
  const style = variant === "outline" ? "border border-slate-200 bg-white text-slate-900" : "bg-slate-900 text-white";
  return <button onClick={onClick} className={`${base} ${style} px-4 py-3 ${className}`}>{children}</button>;
}

function daysSince(dateString) {
  const date = new Date(dateString + "T12:00:00+02:00");
  return Math.max(0, Math.floor((today - date) / (1000 * 60 * 60 * 24)));
}

function FriendlyInput({ label, placeholder, multiline }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-semibold text-slate-800">{label}</label>
      {multiline ? (
        <textarea rows={4} placeholder={placeholder} className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-base outline-none focus:border-slate-500" />
      ) : (
        <input placeholder={placeholder} className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-base outline-none focus:border-slate-500" />
      )}
    </div>
  );
}

function BigAction({ icon: Icon, title, subtitle, onClick }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-4 rounded-3xl bg-white p-4 text-left shadow-sm transition hover:scale-[1.01] hover:shadow-md">
      <div className="rounded-2xl bg-slate-900 p-4 text-white"><Icon size={26} /></div>
      <div className="flex-1">
        <p className="text-lg font-bold text-slate-900">{title}</p>
        <p className="text-sm text-slate-500">{subtitle}</p>
      </div>
      <ChevronRight className="text-slate-400" />
    </button>
  );
}

function BottomTab({ icon: Icon, label, active, onClick }) {
  return (
    <button onClick={onClick} className={`flex flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-xs font-medium transition ${active ? "bg-slate-900 text-white" : "text-slate-500"}`}>
      <Icon size={20} />{label}
    </button>
  );
}

function HomeScreen({ go, planList, setPlanList, followUps = [], setFollowUps }) {
  const [viewMode, setViewMode] = useState("main");
  const [editingId, setEditingId] = useState(null);
useEffect(() => {
  if (!("Notification" in window)) return;

  if (Notification.permission === "default") {
    Notification.requestPermission();
  }
}, []);

useEffect(() => {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  if (dueFollowUps.length > 0) {
    new Notification("PowerMate follow-up reminder", {
      body: `You have ${dueFollowUps.length} client follow-up(s) due.`,
    });
  }

  if (staleClients.length > 0) {
    new Notification("PowerMate client reminder", {
      body: `${staleClients.length} client(s) have not been contacted in 7 days.`,
    });
  }

  if (planList.length > 0) {
    new Notification("PowerMate daily plan", {
      body: `You have ${planList.length} job(s) or visit(s) today.`,
    });
  }
}, []);
  const dueFollowUps = clients.filter(
    (client) => new Date(client.nextFollowUp) <= today
  );

  const staleClients = clients.filter(
    (client) => daysSince(client.lastConversation) >= 7
  );

  const updatePlanItem = (id, field, value) => {
    setPlanList((current) =>
      current.map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      )
    );
  };

  if (viewMode === "today") {
  return (
    <div className="space-y-5">
      <Button variant="outline" className="rounded-2xl" onClick={() => setViewMode("main")}>
        ← Back
      </Button>

      <h1 className="text-2xl font-bold text-slate-900">Today’s jobs / visits</h1>

      {planList.map((item) => (
        <Card key={item.id} className="rounded-3xl shadow-sm">
          <CardContent className="space-y-3 p-4">
            <input value={item.time} onChange={(e) => updatePlanItem(item.id, "time", e.target.value)} className="w-full rounded-xl border p-2" />
            <input value={item.title} onChange={(e) => updatePlanItem(item.id, "title", e.target.value)} className="w-full rounded-xl border p-2" />
            <input value={item.client} onChange={(e) => updatePlanItem(item.id, "client", e.target.value)} className="w-full rounded-xl border p-2" />
            <input value={item.location} onChange={(e) => updatePlanItem(item.id, "location", e.target.value)} className="w-full rounded-xl border p-2" />
            <input value={item.type} onChange={(e) => updatePlanItem(item.id, "type", e.target.value)} className="w-full rounded-xl border p-2" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

  if (viewMode === "followups") {
  const updateFollowUp = (id, field, value) => {
    setFollowUps((current) =>
      current.map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      )
    );
  };

  return (
    <div className="space-y-5">
      <Button variant="outline" className="rounded-2xl" onClick={() => setViewMode("main")}>
        ← Back
      </Button>

      <h1 className="text-2xl font-bold text-slate-900">Follow-ups</h1>

      {followUps.length === 0 && (
        <div className="rounded-3xl bg-white p-4 text-sm text-slate-500 shadow-sm">
          No follow-ups created yet.
        </div>
      )}

      {followUps.map((item) => (
        <Card key={item.id} className="rounded-3xl shadow-sm">
          <CardContent className="space-y-3 p-4">
            <h2 className="text-lg font-bold text-slate-900">{item.clientName}</h2>

            <input
              type="date"
              value={item.dueDate || ""}
              onChange={(e) => updateFollowUp(item.id, "dueDate", e.target.value)}
              className="w-full rounded-xl border p-2"
            />

            <input
              value={item.status || ""}
              onChange={(e) => updateFollowUp(item.id, "status", e.target.value)}
              className="w-full rounded-xl border p-2"
            />

            <textarea
              value={item.outcome || ""}
              onChange={(e) => updateFollowUp(item.id, "outcome", e.target.value)}
              placeholder="Outcome..."
              className="w-full rounded-xl border p-2"
            />

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={!!item.completed}
                onChange={(e) => updateFollowUp(item.id, "completed", e.target.checked)}
              />
              Completed
            </label>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

  return (
    <div className="space-y-5">
      <div className="rounded-3xl bg-slate-900 p-5 text-white shadow-sm">
        <p className="text-sm text-slate-300">
  Today, {new Date().toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  })}
</p>
        <h1 className="mt-1 text-3xl font-bold">Your day is ready</h1>
        <p className="mt-2 text-slate-300">
          You have {planList.length} planned items, {dueFollowUps.length} follow-up due, and {staleClients.length} clients needing attention.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => setViewMode("today")} className="text-left">
          <Card className="rounded-3xl shadow-sm">
            <CardContent className="p-4">
              <p className="text-sm text-slate-500">Today</p>
              <p className="text-3xl font-bold text-slate-900">{planList.length}</p>
              <p className="text-sm text-slate-500">jobs / visits</p>
            </CardContent>
          </Card>
        </button>

        <button onClick={() => setViewMode("followups")} className="text-left">
          <Card className="rounded-3xl shadow-sm">
            <CardContent className="p-4">
              <p className="text-sm text-slate-500">Follow-ups</p>
              <p className="text-3xl font-bold text-slate-900">{dueFollowUps.length}</p>
              <p className="text-sm text-slate-500">due now</p>
            </CardContent>
          </Card>
        </button>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-bold text-slate-900">Quick actions</h2>

        <BigAction
          icon={CalendarDays}
          title="Calendar"
          subtitle="View, edit and link your calendar"
          onClick={() => go("Calendar")}
        />

        <BigAction icon={Plus} title="Add conversation" subtitle="Log a client call, WhatsApp, email, or visit" onClick={() => go("QuickAdd")} />
        <BigAction icon={Wrench} title="Create service report" subtitle="Fault, work done, parts, photos and PDF" onClick={() => go("Service")} />
        <BigAction icon={Camera} title="Take photos / upload document" subtitle="Attach evidence to a client or job" onClick={() => go("Documents")} />
      </div>

      <Card className="rounded-3xl shadow-sm">
        <CardContent className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">Next up</h2>
            <Button variant="outline" className="rounded-xl" onClick={() => go("Calendar")}>
              View all
            </Button>
          </div>

          <div className="space-y-3">
            {planList.map((item) => (
              <div key={item.id} className="rounded-2xl bg-slate-50 p-3">
                {editingId === item.id ? (
                  <div className="space-y-2">
                    <input value={item.time} onChange={(e) => updatePlanItem(item.id, "time", e.target.value)} className="w-full rounded-xl border p-2" />
                    <input value={item.title} onChange={(e) => updatePlanItem(item.id, "title", e.target.value)} className="w-full rounded-xl border p-2" />
                    <input value={item.client} onChange={(e) => updatePlanItem(item.id, "client", e.target.value)} className="w-full rounded-xl border p-2" />
                    <input value={item.location} onChange={(e) => updatePlanItem(item.id, "location", e.target.value)} className="w-full rounded-xl border p-2" />
                    <input value={item.type} onChange={(e) => updatePlanItem(item.id, "type", e.target.value)} className="w-full rounded-xl border p-2" />

                    <Button className="w-full rounded-2xl" onClick={() => setEditingId(null)}>
                      Done
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-3">
                    <div className="w-16 rounded-2xl bg-white p-2 text-center shadow-sm">
                      <p className="text-sm font-bold text-slate-900">{item.time}</p>
                      <p className="text-xs text-slate-500">{item.type}</p>
                    </div>

                    <div className="flex-1">
                      <p className="font-semibold text-slate-900">{item.title}</p>
                      <p className="text-sm text-slate-500">{item.client}</p>
                      <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                        <MapPin size={13} /> {item.location}
                      </p>
                    </div>

                    <Button variant="outline" className="rounded-xl" onClick={() => setEditingId(item.id)}>
                      Edit
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function QuickAddScreen() {
  const [recording, setRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [audioURL, setAudioURL] = useState(null);
  const [audioError, setAudioError] = useState("");
  const [mediaFiles, setMediaFiles] = useState([]);
const [selectedClient, setSelectedClient] = useState("");
const [conversationNote, setConversationNote] = useState("");
  const startRecording = async () => {
    try {
      setAudioError("");

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setAudioError("Voice recording is not supported on this browser.");
        return;
      }

      if (typeof MediaRecorder === "undefined") {
        setAudioError("Voice recording is not supported on this device/browser.");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        setAudioURL(URL.createObjectURL(blob));
        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.start();
      setMediaRecorder(recorder);
      setRecording(true);
    } catch (err) {
      setAudioError("Microphone permission was blocked. Check browser permissions.");
      console.error(err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && recording) {
      mediaRecorder.stop();
      setRecording(false);
      setMediaRecorder(null);
    }
  };

  const deleteVoiceNote = () => {
    if (audioURL) URL.revokeObjectURL(audioURL);
    setAudioURL(null);
    setAudioError("");
  };

  const handleMediaUpload = (e) => {
    const selectedFiles = Array.from(e.target.files || []);

    const newFiles = selectedFiles.map((file) => ({
      file,
      name: file.name,
      type: file.type,
      url: URL.createObjectURL(file),
    }));

    setMediaFiles((current) => [...current, ...newFiles]);

    e.target.value = "";
  };

  const deleteMediaFile = (indexToDelete) => {
    setMediaFiles((currentFiles) => {
      const fileToDelete = currentFiles[indexToDelete];
      if (fileToDelete?.url) URL.revokeObjectURL(fileToDelete.url);
      return currentFiles.filter((_, index) => index !== indexToDelete);
    });
  };

  const deleteAllMedia = () => {
    mediaFiles.forEach((item) => {
      if (item.url) URL.revokeObjectURL(item.url);
    });
    setMediaFiles([]);
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Add conversation</h1>
        <p className="text-sm text-slate-500">
          Capture notes, photos, videos and voice notes quickly.
        </p>
      </div>

      <Card className="rounded-3xl shadow-sm">
        <CardContent className="space-y-4 p-4">
         <select
  className="w-full rounded-2xl border border-slate-200 p-4"
  value={selectedClient}
  onChange={(e) => setSelectedClient(e.target.value)}
>
  <option value="">Select existing client</option>
<option value="__new__">+ Add new client</option>

{clients.map((c) => (
  <option key={c.id} value={c.name}>
    {c.name}
  </option>
))}
</select>
          {selectedClient === "__new__" && (
  <div className="space-y-3 rounded-2xl bg-slate-50 p-3">
    <FriendlyInput label="New client name" placeholder="Example: New Mine / Company" />
    <FriendlyInput label="Contact person" placeholder="Example: Johan Smith" />
    <FriendlyInput label="Phone number" placeholder="Example: 082 000 0000" />
    <FriendlyInput label="Email" placeholder="Example: client@email.com" />
    <FriendlyInput label="Location" placeholder="Example: Rustenburg" />
  </div>
)}
          <div>
  <label className="mb-1 block text-sm font-semibold text-slate-800">
    What was discussed?
  </label>
  <textarea
    rows={4}
    value={conversationNote}
    onChange={(e) => setConversationNote(e.target.value)}
    placeholder="Notes..."
    className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-base outline-none focus:border-slate-500"
  />
</div>

          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="outline"
              className={`rounded-2xl py-6 ${
                recording ? "border-red-300 bg-red-100 text-red-700" : ""
              }`}
              onClick={recording ? stopRecording : startRecording}
            >
              <Mic size={18} className="mr-2" />
              {recording ? "Stop recording" : "Voice note"}
            </Button>

            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white py-6 font-semibold">
              <Camera size={18} />
              Add photo/video

              <input
                type="file"
                accept="image/*,video/*"
                multiple
                className="hidden"
                onChange={handleMediaUpload}
              />
            </label>
          </div>

          <div className="rounded-2xl bg-slate-50 p-3 text-xs text-slate-600">
            Tip: On Android you can select from Gallery or Google Photos. On iPhone use Safari and choose Photo Library, Take Photo, or Choose File.
          </div>

          {audioError && (
            <div className="rounded-2xl bg-red-50 p-3 text-sm font-semibold text-red-700">
              {audioError}
            </div>
          )}

          {recording && (
            <div className="rounded-2xl bg-red-50 p-3 text-sm font-semibold text-red-700">
              Recording... tap Stop recording when finished.
            </div>
          )}

          {audioURL && (
            <div className="rounded-2xl bg-slate-50 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold">Voice note:</p>
                <button
                  type="button"
                  onClick={deleteVoiceNote}
                  className="rounded-xl bg-red-100 px-3 py-1 text-xs font-semibold text-red-700"
                >
                  Delete voice
                </button>
              </div>

              <audio controls src={audioURL} className="w-full" />
            </div>
          )}

          {mediaFiles.length > 0 && (
            <div className="rounded-2xl bg-slate-50 p-3">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold">Selected files:</p>
                <button
                  type="button"
                  onClick={deleteAllMedia}
                  className="rounded-xl bg-red-100 px-3 py-1 text-xs font-semibold text-red-700"
                >
                  Delete all
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {mediaFiles.map((item, index) => (
                  <div key={`${item.name}-${index}`} className="rounded-2xl bg-white p-2">
                    {item.type.startsWith("video/") ? (
                      <video
                        controls
                        src={item.url}
                        className="h-32 w-full rounded-xl object-cover"
                      />
                    ) : (
                      <img
                        src={item.url}
                        alt={item.name}
                        className="h-32 w-full rounded-xl object-cover"
                      />
                    )}

                    <p className="mt-2 truncate text-xs text-slate-600">
                      {item.type.startsWith("video/") ? "🎥" : "📷"} {item.name}
                    </p>

                    <button
                      type="button"
                      onClick={() => deleteMediaFile(index)}
                      className="mt-2 w-full rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Button
  className="w-full rounded-2xl py-6 text-base"
  onClick={() => {
    if (!selectedClient) {
      alert("Please select a client first.");
      return;
    }

    console.log("Saved conversation:", {
      client: selectedClient,
      note: conversationNote,
      files: mediaFiles,
      voiceNote: audioURL,
      date: new Date().toISOString(),
    });

    alert("Conversation saved to client.");
  }}
>
  Save conversation
</Button>
        </CardContent>
      </Card>
    </div>
  );
}
    

function CalendarScreen({ planList, setPlanList }) {
  const [newItem, setNewItem] = useState({
    time: "",
    title: "",
    client: "",
    location: "",
    type: "Follow-up",
  });

  const updateNewItem = (field, value) => {
    setNewItem((current) => ({ ...current, [field]: value }));
  };

  const addCalendarItem = () => {
    if (!newItem.time || !newItem.title) {
      alert("Please add at least a time and title.");
      return;
    }

    setPlanList((current) => [
      ...current,
      {
        id: Date.now(),
        ...newItem,
      },
    ]);

    setNewItem({
      time: "",
      title: "",
      client: "",
      location: "",
      type: "Follow-up",
    });
  };

  const deleteCalendarItem = (id) => {
    setPlanList((current) => current.filter((item) => item.id !== id));
  };

  const updateCalendarItem = (id, field, value) => {
    setPlanList((current) =>
      current.map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      )
    );
  };

  const createGoogleCalendarLink = (item) => {
    const title = encodeURIComponent(item.title);
    const location = encodeURIComponent(item.location);
    const details = encodeURIComponent(`${item.client} - ${item.type}`);

    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${details}&location=${location}`;
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Calendar</h1>
        <p className="text-sm text-slate-500">
          Add, edit, delete and send items to Google Calendar.
        </p>
      </div>

      <Card className="rounded-3xl shadow-sm">
        <CardContent className="space-y-3 p-4">
          <h2 className="text-lg font-bold text-slate-900">Add new item</h2>

          <input
            type="time"
            value={newItem.time}
            onChange={(e) => updateNewItem("time", e.target.value)}
            className="w-full rounded-2xl border border-slate-200 p-4"
          />

          <input
            placeholder="Title"
            value={newItem.title}
            onChange={(e) => updateNewItem("title", e.target.value)}
            className="w-full rounded-2xl border border-slate-200 p-4"
          />

          <input
            placeholder="Client"
            value={newItem.client}
            onChange={(e) => updateNewItem("client", e.target.value)}
            className="w-full rounded-2xl border border-slate-200 p-4"
          />

          <input
            placeholder="Location"
            value={newItem.location}
            onChange={(e) => updateNewItem("location", e.target.value)}
            className="w-full rounded-2xl border border-slate-200 p-4"
          />

          <select
            value={newItem.type}
            onChange={(e) => updateNewItem("type", e.target.value)}
            className="w-full rounded-2xl border border-slate-200 p-4"
          >
            <option>Follow-up</option>
            <option>Service</option>
            <option>Sales</option>
            <option>Meeting</option>
            <option>Site visit</option>
          </select>

          <Button className="w-full rounded-2xl py-6" onClick={addCalendarItem}>
            Add calendar item
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {planList.map((item) => (
          <Card key={item.id} className="rounded-3xl shadow-sm">
            <CardContent className="space-y-3 p-4">
              <input
                type="time"
                value={item.time}
                onChange={(e) =>
                  updateCalendarItem(item.id, "time", e.target.value)
                }
                className="w-full rounded-2xl border border-slate-200 p-3"
              />

              <input
                value={item.title}
                onChange={(e) =>
                  updateCalendarItem(item.id, "title", e.target.value)
                }
                className="w-full rounded-2xl border border-slate-200 p-3"
              />

              <input
                value={item.client}
                onChange={(e) =>
                  updateCalendarItem(item.id, "client", e.target.value)
                }
                className="w-full rounded-2xl border border-slate-200 p-3"
              />

              <input
                value={item.location}
                onChange={(e) =>
                  updateCalendarItem(item.id, "location", e.target.value)
                }
                className="w-full rounded-2xl border border-slate-200 p-3"
              />

              <input
                value={item.type}
                onChange={(e) =>
                  updateCalendarItem(item.id, "type", e.target.value)
                }
                className="w-full rounded-2xl border border-slate-200 p-3"
              />

              <a
                href={createGoogleCalendarLink(item)}
                target="_blank"
                rel="noreferrer"
              >
                <Button className="w-full rounded-2xl">
                  <CalendarDays size={18} className="mr-2" />
                  Add to Google Calendar
                </Button>
              </a>

              <button
                type="button"
                onClick={() => deleteCalendarItem(item.id)}
                className="w-full rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
              >
                Delete item
              </button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function ClientsScreen({ clientList, setClientList }) {
  const [search, setSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState(null);
  const [editMode, setEditMode] = useState(false);

  const filtered = useMemo(
    () =>
      clientList.filter((client) =>
        `${client.name} ${client.contact}`
          .toLowerCase()
          .includes(search.toLowerCase())
      ),
    [search, clientList]
  );

  const updateClientField = (field, value) => {
    const updatedClient = { ...selectedClient, [field]: value };
    setSelectedClient(updatedClient);

    setClientList((current) =>
      current.map((client) =>
        client.id === updatedClient.id ? updatedClient : client
      )
    );
  };

  if (selectedClient) {
    return (
      <div className="space-y-5">
        <Button
          variant="outline"
          className="rounded-2xl"
          onClick={() => {
            setSelectedClient(null);
            setEditMode(false);
          }}
        >
          ← Back to clients
        </Button>

        <Card className="rounded-3xl shadow-sm">
          <CardContent className="space-y-4 p-4">

            {/* HEADER */}
            <div className="flex items-start justify-between gap-3">
              <div>
                {editMode ? (
                  <input
                    value={selectedClient.name}
                    onChange={(e) => updateClientField("name", e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 p-3 text-xl font-bold"
                  />
                ) : (
                  <h1 className="text-2xl font-bold text-slate-900">
                    {selectedClient.name}
                  </h1>
                )}

                {editMode ? (
                  <input
                    value={selectedClient.contact}
                    onChange={(e) => updateClientField("contact", e.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 p-3 text-sm"
                  />
                ) : (
                  <p className="text-sm text-slate-500">
                    {selectedClient.contact}
                  </p>
                )}
              </div>

              <Button
                variant="outline"
                className="rounded-2xl"
                onClick={() => setEditMode(!editMode)}
              >
                {editMode ? "Done" : "Edit"}
              </Button>
            </div>

            {/* DETAILS */}
            <div className="space-y-3 rounded-2xl bg-slate-50 p-3">
              {[
                ["phone", "Phone"],
                ["email", "Email"],
                ["location", "Location"],
                ["status", "Status"],
                ["value", "Value"],
              ].map(([field, label]) => (
                <div key={field}>
                  <label className="mb-1 block text-xs font-bold text-slate-500">
                    {label}
                  </label>

                  {editMode ? (
                    <input
                      value={selectedClient[field] || ""}
                      onChange={(e) => updateClientField(field, e.target.value)}
                      className="w-full rounded-2xl border border-slate-200 bg-white p-3 text-sm"
                    />
                  ) : (
                    <p className="text-sm text-slate-700">
                      {selectedClient[field]}
                    </p>
                  )}
                </div>
              ))}
            </div>

            {/* NOTES */}
            <div className="rounded-2xl bg-slate-50 p-3">
              <p className="text-sm font-semibold text-slate-800">Notes</p>

              {editMode ? (
                <textarea
                  rows={4}
                  value={selectedClient.notes}
                  onChange={(e) => updateClientField("notes", e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white p-3 text-sm"
                />
              ) : (
                <p className="mt-1 text-sm text-slate-600">
                  {selectedClient.notes}
                </p>
              )}
            </div>

            {/* ACTIONS */}
            <div className="grid grid-cols-3 gap-2">
              <a href={`tel:${selectedClient.phone}`}>
                <button
  type="button"
  onClick={() => {
    if (!confirm("Are you sure you want to delete this client?")) return;

    setClientList((current) =>
      current.filter((c) => c.id !== selectedClient.id)
    );

    setSelectedClient(null);
  }}
  className="w-full rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
>
  Delete client
</button>
                <Button variant="outline" className="w-full rounded-2xl">
                  <Phone size={16} />
                </Button>
              </a>

              <a href={`mailto:${selectedClient.email}`}>
                <Button variant="outline" className="w-full rounded-2xl">
                  <Mail size={16} />
                </Button>
              </a>

              <Button className="rounded-2xl">
                Add entry
              </Button>
            </div>

            {/* HISTORY */}
            <div>
              <h2 className="mb-2 text-lg font-bold text-slate-900">
                Client history
              </h2>

              <div className="space-y-2">
                <div className="rounded-2xl bg-slate-50 p-3">
                  <p className="text-sm font-semibold text-slate-900">
                    Last conversation
                  </p>

                  {editMode ? (
                    <input
                      type="date"
                      value={selectedClient.lastConversation}
                      onChange={(e) =>
                        updateClientField("lastConversation", e.target.value)
                      }
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white p-3 text-sm"
                    />
                  ) : (
                    <p className="text-xs text-slate-500">
                      {selectedClient.lastConversation}
                    </p>
                  )}
                </div>

                <div className="rounded-2xl bg-slate-50 p-3">
                  <p className="text-sm font-semibold text-slate-900">
                    Next follow-up
                  </p>

                  {editMode ? (
                    <input
                      type="date"
                      value={selectedClient.nextFollowUp}
                      onChange={(e) =>
                        updateClientField("nextFollowUp", e.target.value)
                      }
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white p-3 text-sm"
                    />
                  ) : (
                    <p className="text-xs text-slate-500">
                      {selectedClient.nextFollowUp}
                    </p>
                  )}
                </div>
              </div>
            </div>

          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Clients</h1>
        <p className="text-sm text-slate-500">
          Tap a client to open and edit their profile.
        </p>
      </div>

      <div className="flex items-center gap-2 rounded-3xl bg-white p-3 shadow-sm">
        <Search size={20} className="text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search client or contact"
          className="w-full bg-transparent p-2 text-base outline-none"
        />
      </div>

      <div className="space-y-3">
        {filtered.map((client) => (
          <button
            key={client.id}
            onClick={() => setSelectedClient(client)}
            className="w-full text-left"
          >
            <Card className="rounded-3xl shadow-sm">
              <CardContent className="p-4">
                <h2 className="text-lg font-bold text-slate-900">
                  {client.name}
                </h2>
                <p className="text-sm text-slate-500">{client.contact}</p>
              </CardContent>
            </Card>
          </button>
        ))}
      </div>
    </div>
  );
}
function ServiceScreen() {
  const [report, setReport] = useState({
    client: "",
    machine: "",
    fault: "",
    workDone: "",
    partsUsed: "",
    technician: "",
  });

  const [serviceFiles, setServiceFiles] = useState([]);

  const updateReport = (field, value) => {
    setReport((current) => ({ ...current, [field]: value }));
  };

  const handleServiceFiles = (e) => {
    const files = Array.from(e.target.files || []);

    const newFiles = files.map((file) => ({
      id: Date.now() + Math.random(),
      name: file.name,
      type: file.type,
      url: URL.createObjectURL(file),
    }));

    setServiceFiles((current) => [...current, ...newFiles]);
    e.target.value = "";
  };

  const deleteServiceFile = (id) => {
    setServiceFiles((current) => {
      const file = current.find((item) => item.id === id);
      if (file?.url) URL.revokeObjectURL(file.url);
      return current.filter((item) => item.id !== id);
    });
  };

  const createPDF = () => {
    const printWindow = window.open("", "_blank");

    printWindow.document.write(`
      <html>
        <head>
          <title>Service Report</title>
          <style>
            body { font-family: Arial; padding: 30px; color: #111827; }
            h1 { border-bottom: 2px solid #111827; padding-bottom: 10px; }
            .section { margin-bottom: 20px; }
            .label { font-weight: bold; }
            img { max-width: 100%; margin-top: 10px; border-radius: 10px; }
          </style>
        </head>
        <body>
          <h1>PowerMate Service Report</h1>

          <div class="section"><span class="label">Client / Site:</span> ${report.client}</div>
          <div class="section"><span class="label">Machine / Equipment:</span> ${report.machine}</div>
          <div class="section"><span class="label">Technician:</span> ${report.technician}</div>
          <div class="section"><span class="label">Fault Found:</span><br/>${report.fault}</div>
          <div class="section"><span class="label">Work Done:</span><br/>${report.workDone}</div>
          <div class="section"><span class="label">Parts Used:</span><br/>${report.partsUsed}</div>

          <h2>Attached Files</h2>
          ${serviceFiles
            .map(
              (file) =>
                file.type.startsWith("image/")
                  ? `<div><p>${file.name}</p><img src="${file.url}" /></div>`
                  : `<p>${file.name}</p>`
            )
            .join("")}

          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `);

    printWindow.document.close();
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Service report</h1>
        <p className="text-sm text-slate-500">
          Complete the report and create a PDF.
        </p>
      </div>

      <Card className="rounded-3xl shadow-sm">
        <CardContent className="space-y-4 p-4">
          <input
            placeholder="Client / Site"
            value={report.client}
            onChange={(e) => updateReport("client", e.target.value)}
            className="w-full rounded-2xl border border-slate-200 p-4"
          />

          <input
            placeholder="Machine / Equipment"
            value={report.machine}
            onChange={(e) => updateReport("machine", e.target.value)}
            className="w-full rounded-2xl border border-slate-200 p-4"
          />

          <input
            placeholder="Technician"
            value={report.technician}
            onChange={(e) => updateReport("technician", e.target.value)}
            className="w-full rounded-2xl border border-slate-200 p-4"
          />

          <textarea
            rows={4}
            placeholder="Fault found"
            value={report.fault}
            onChange={(e) => updateReport("fault", e.target.value)}
            className="w-full rounded-2xl border border-slate-200 p-4"
          />

          <textarea
            rows={4}
            placeholder="Work done"
            value={report.workDone}
            onChange={(e) => updateReport("workDone", e.target.value)}
            className="w-full rounded-2xl border border-slate-200 p-4"
          />

          <textarea
            rows={3}
            placeholder="Parts used"
            value={report.partsUsed}
            onChange={(e) => updateReport("partsUsed", e.target.value)}
            className="w-full rounded-2xl border border-slate-200 p-4"
          />

          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white py-6 font-semibold">
            <Upload size={18} />
            Add photos / files

            <input
              type="file"
              accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx"
              multiple
              className="hidden"
              onChange={handleServiceFiles}
            />
          </label>

          {serviceFiles.map((file) => (
            <div key={file.id} className="rounded-2xl bg-slate-50 p-3">
              <p className="text-sm font-semibold">{file.name}</p>

              {file.type.startsWith("image/") && (
                <img
                  src={file.url}
                  alt={file.name}
                  className="mt-2 max-h-56 w-full rounded-2xl object-cover"
                />
              )}

              <button
                type="button"
                onClick={() => deleteServiceFile(file.id)}
                className="mt-2 w-full rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700"
              >
                Delete
              </button>
            </div>
          ))}

          <Button
            className="w-full rounded-2xl py-6 text-base"
            onClick={createPDF}
          >
            Save & create PDF
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function DocumentsScreen() {
  const [uploadedDocs, setUploadedDocs] = useState([]);

  const handleDocsUpload = (e) => {
    const files = Array.from(e.target.files || []);

    const newDocs = files.map((file) => ({
      id: Date.now() + Math.random(),
      name: file.name,
      type: file.type || "File",
      url: URL.createObjectURL(file),
    }));

    setUploadedDocs((current) => [...current, ...newDocs]);
    e.target.value = "";
  };

  const deleteDoc = (id) => {
    setUploadedDocs((current) => {
      const doc = current.find((item) => item.id === id);
      if (doc?.url) URL.revokeObjectURL(doc.url);
      return current.filter((item) => item.id !== id);
    });
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Documents</h1>
        <p className="text-sm text-slate-500">
          Upload, view and manage your files.
        </p>
      </div>

      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-6 font-semibold text-white">
        <Upload size={18} />
        Upload photo, video or document

        <input
          type="file"
          accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx"
          multiple
          className="hidden"
          onChange={handleDocsUpload}
        />
      </label>

      <div className="space-y-3">
        {uploadedDocs.length === 0 && (
          <div className="rounded-3xl bg-white p-4 text-sm text-slate-500 shadow-sm">
            No documents uploaded yet.
          </div>
        )}

        {uploadedDocs.map((doc) => (
          <Card key={doc.id} className="rounded-3xl shadow-sm">
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">
                  <FileText size={22} />
                </div>

                <div className="flex-1">
                  <p className="font-bold text-slate-900">{doc.name}</p>
                  <p className="text-sm text-slate-500">{doc.type}</p>
                </div>
              </div>

              {doc.type.startsWith("image/") && (
                <img
                  src={doc.url}
                  alt={doc.name}
                  className="max-h-72 w-full rounded-2xl object-cover"
                />
              )}

              {doc.type.startsWith("video/") && (
                <video
                  controls
                  src={doc.url}
                  className="max-h-72 w-full rounded-2xl"
                />
              )}

              {doc.type === "application/pdf" && (
                <iframe
                  src={doc.url}
                  title={doc.name}
                  className="h-96 w-full rounded-2xl border"
                />
              )}

              {!doc.type.startsWith("image/") &&
                !doc.type.startsWith("video/") &&
                doc.type !== "application/pdf" && (
                  <a href={doc.url} target="_blank" rel="noreferrer">
                    <Button className="w-full rounded-2xl">
                      Open document
                    </Button>
                  </a>
                )}

              <button
                type="button"
                onClick={() => deleteDoc(doc.id)}
                className="w-full rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
              >
                Delete document
              </button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
function NotificationSettingsScreen() {
  const reminderOptions = ["Remind me before meetings", "Remind me to follow up on quotes", "Alert me when a client has not been contacted for 7 days", "Remind me to complete open service reports", "Send me a morning summary of my day"];
  return <div className="space-y-5"><div><h1 className="text-2xl font-bold text-slate-900">Calendar & Notifications</h1><p className="text-sm text-slate-500">Connect your calendar and control when WorkMate reminds you.</p></div><Card className="rounded-3xl shadow-sm"><CardContent className="space-y-4 p-4"><div className="flex items-center gap-3"><div className="rounded-2xl bg-slate-900 p-3 text-white"><CalendarCheck size={24} /></div><div className="flex-1"><h2 className="font-bold text-slate-900">Link your calendar</h2><p className="text-sm text-slate-500">Sync meetings, site visits, service jobs and follow-ups.</p></div></div><div className="grid grid-cols-1 gap-3"><Button className="rounded-2xl py-6"><LinkIcon size={18} className="mr-2" /> Connect Google Calendar</Button><Button variant="outline" className="rounded-2xl py-6"><LinkIcon size={18} className="mr-2" /> Connect Outlook Calendar</Button></div><div className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">Once connected, new jobs, visits and follow-ups can automatically appear in your phone calendar.</div></CardContent></Card><Card className="rounded-3xl shadow-sm"><CardContent className="space-y-4 p-4"><div className="flex items-center gap-3"><div className="rounded-2xl bg-slate-100 p-3 text-slate-700"><Bell size={24} /></div><div><h2 className="font-bold text-slate-900">Notification rules</h2><p className="text-sm text-slate-500">Choose what WorkMate must remind you about.</p></div></div><div className="space-y-3">{reminderOptions.map((option, index) => <label key={option} className="flex items-center justify-between rounded-2xl bg-slate-50 p-4"><span className="pr-4 text-sm font-medium text-slate-800">{option}</span><input type="checkbox" defaultChecked={index < 4} className="h-6 w-6 accent-slate-900" /></label>)}</div></CardContent></Card><Card className="rounded-3xl shadow-sm"><CardContent className="space-y-3 p-4"><h2 className="font-bold text-slate-900">Default reminder times</h2><FriendlyInput label="Before meetings" placeholder="Example: 30 minutes before" /><FriendlyInput label="Quote follow-ups" placeholder="Example: 3 days after quote sent" /><FriendlyInput label="No client contact" placeholder="Example: 14 days after last conversation" /><Button className="w-full rounded-2xl py-6 text-base">Save notification settings</Button></CardContent></Card></div>;
}

function InstallAppScreen() {
  return <div className="space-y-5"><div><h1 className="text-2xl font-bold text-slate-900">Install WorkMate</h1><p className="text-sm text-slate-500">Add this app to your phone home screen so it opens like a normal mobile app.</p></div><Card className="rounded-3xl shadow-sm"><CardContent className="space-y-4 p-4"><div className="rounded-2xl bg-slate-900 p-4 text-white"><h2 className="text-lg font-bold">For iPhone / iPad</h2><p className="mt-1 text-sm text-slate-300">Open the app in Safari, then use Share → Add to Home Screen.</p></div><ol className="space-y-3 text-sm text-slate-700"><li className="rounded-2xl bg-slate-50 p-3"><strong>1.</strong> Open WorkMate in Safari.</li><li className="rounded-2xl bg-slate-50 p-3"><strong>2.</strong> Tap the Share button.</li><li className="rounded-2xl bg-slate-50 p-3"><strong>3.</strong> Tap Add to Home Screen.</li><li className="rounded-2xl bg-slate-50 p-3"><strong>4.</strong> Tap Add. WorkMate will now appear like an app.</li></ol></CardContent></Card><Card className="rounded-3xl shadow-sm"><CardContent className="space-y-4 p-4"><div className="rounded-2xl bg-slate-900 p-4 text-white"><h2 className="text-lg font-bold">For Android</h2><p className="mt-1 text-sm text-slate-300">Open the app in Chrome, then use Install app or Add to Home screen.</p></div><ol className="space-y-3 text-sm text-slate-700"><li className="rounded-2xl bg-slate-50 p-3"><strong>1.</strong> Open WorkMate in Chrome.</li><li className="rounded-2xl bg-slate-50 p-3"><strong>2.</strong> Tap the three dots menu.</li><li className="rounded-2xl bg-slate-50 p-3"><strong>3.</strong> Tap Install app or Add to Home screen.</li><li className="rounded-2xl bg-slate-50 p-3"><strong>4.</strong> WorkMate will install on your phone.</li></ol></CardContent></Card></div>;
}

function MoreScreen({ go }) {
  const [moreView, setMoreView] = useState("main");

  if (moreView === "sales") {
    return (
      <div className="space-y-5">
        <Button variant="outline" className="rounded-2xl" onClick={() => setMoreView("main")}>
          ← Back
        </Button>

        <h1 className="text-2xl font-bold text-slate-900">Sales reports</h1>

        <Card className="rounded-3xl shadow-sm">
          <CardContent className="space-y-4 p-4">
            <FriendlyInput label="Week / Date" placeholder="Example: Week 18 / 03 May 2026" />
            <FriendlyInput label="Total visits" placeholder="Example: 12" />
            <FriendlyInput label="Quotes sent" placeholder="Example: 5" />
            <FriendlyInput label="Follow-ups completed" placeholder="Example: 8" />
            <FriendlyInput label="New leads" placeholder="Example: 3" />
            <FriendlyInput label="Weekly summary" placeholder="Short summary of the week" multiline />

            <Button className="w-full rounded-2xl py-6">
              Save sales report
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (moreView === "settings") {
    return (
      <div className="space-y-5">
        <Button variant="outline" className="rounded-2xl" onClick={() => setMoreView("main")}>
          ← Back
        </Button>

        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>

        <Card className="rounded-3xl shadow-sm">
          <CardContent className="space-y-4 p-4">
            <FriendlyInput label="Company name" placeholder="Example: CC Innovations (PTY) Ltd" />
            <FriendlyInput label="Technician / Rep name" placeholder="Your name" />
            <FriendlyInput label="Default reminder time" placeholder="Example: 08:00" />
            <FriendlyInput label="Follow-up reminder days" placeholder="Example: 7" />
            <FriendlyInput label="PDF footer note" placeholder="Example: Generated by PowerMate" multiline />

            <Button className="w-full rounded-2xl py-6">
              Save settings
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">More</h1>
        <p className="text-sm text-slate-500">Reports, reminders and settings.</p>
      </div>

      <div className="space-y-3">
        <BigAction
          icon={Bell}
          title="Calendar & Notifications"
          subtitle="Link calendar and set reminder rules"
          onClick={() => go("Notifications")}
        />

        <BigAction
          icon={Home}
          title="Install on phone"
          subtitle="Add PowerMate to iOS or Android home screen"
          onClick={() => go("Install")}
        />

        <BigAction
          icon={BriefcaseBusiness}
          title="Sales reports"
          subtitle="Weekly visit report and pipeline"
          onClick={() => setMoreView("sales")}
        />

        <BigAction
          icon={ClipboardList}
          title="Settings"
          subtitle="PDF templates and account"
          onClick={() => setMoreView("settings")}
        />
      </div>
    </div>
  );
}

export default function WorkMateApp() {
  const [screen, setScreen] = useState("Home");
const [clientList, setClientList] = useState(clients);
const [planList, setPlanList] = useState(dailyPlan);
  const [followUps, setFollowUps] = useState([]);
  const views = {
  Home: <HomeScreen go={setScreen} planList={planList} setPlanList={setPlanList} followUps={followUps} setFollowUps={setFollowUps} />,
  QuickAdd: <QuickAddScreen />,
  Calendar: <CalendarScreen planList={planList} setPlanList={setPlanList} />,
  Clients: <ClientsScreen clientList={clientList} setClientList={setClientList} setFollowUps={setFollowUps} />,
  Service: <ServiceScreen />,
  Documents: <DocumentsScreen />,
  More: <MoreScreen go={setScreen} />,
  Notifications: <NotificationSettingsScreen />,
  Install: <InstallAppScreen />,
};
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto max-w-2xl px-4 pb-28 pt-4">
        <header className="mb-4 flex items-center justify-between rounded-3xl bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3"><div className="rounded-2xl bg-slate-900 p-3 text-white"><ClipboardList size={22} /></div><div><p className="text-lg font-black leading-tight">WorkMate</p><p className="text-xs text-slate-500">Installable on iOS & Android</p></div></div>
          <Button className="rounded-2xl" onClick={() => setScreen("QuickAdd")}><Plus size={18} /></Button>
        </header>
        <motion.main key={screen} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>{views[screen]}</motion.main>
      </div>
      <nav className="fixed bottom-0 left-0 right-0 border-t border-slate-200 bg-white/95 p-2 shadow-lg backdrop-blur">
        <div className="mx-auto grid max-w-2xl grid-cols-5 gap-1">
          <BottomTab icon={Home} label="Home" active={screen === "Home"} onClick={() => setScreen("Home")} />
          <BottomTab icon={Users} label="Clients" active={screen === "Clients"} onClick={() => setScreen("Clients")} />
          <BottomTab icon={Wrench} label="Service" active={screen === "Service"} onClick={() => setScreen("Service")} />
          <BottomTab icon={FileText} label="Docs" active={screen === "Documents"} onClick={() => setScreen("Documents")} />
          <BottomTab icon={Bell} label="More" active={screen === "More"} onClick={() => setScreen("More")} />
        </div>
      </nav>
    </div>
  );
}
