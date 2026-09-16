import fs from "node:fs";
import path from "node:path";
const root=process.cwd();
const read=f=>fs.readFileSync(path.join(root,f),"utf8");
const app=read("src/App.jsx");
const required=["src/offline/offlineDb.js","src/lib/sync.js","src/lib/notifications.js","src/components/QuickCaptureFAB.jsx","src/components/VoiceInput.jsx","src/screens/JobsScreen.jsx","src/screens/InvoicesScreen.jsx","src/screens/Client360Screen.jsx","src/screens/TeamDashboardScreen.jsx","src/lib/jobInvoiceAutomation.js","src/lib/quoteAutomation.js","public/service-worker.js","manifest.webmanifest"];
const fail=[];
for(const f of required)if(!fs.existsSync(path.join(root,f)))fail.push(`Missing ${f}`);
const lazy=[...app.matchAll(/const\s+(\w+)\s*=\s*lazy\(\(\)\s*=>\s*import\("\.\/screens\/([^\"]+)"\)/g)];
for(const[,name,file]of lazy){const candidate=path.join(root,"src/screens",file);if(!fs.existsSync(candidate)&&!fs.existsSync(`${candidate}.jsx`)&&!fs.existsSync(`${candidate}.js`))fail.push(`Missing lazy screen ${name}: ${file}`)}
const screenKeys=[...app.matchAll(/^\s{4}(\w+):\s*</gm)].map(m=>m[1]);
for(const key of ["Home","Clients","Contacts","Followups","Notes","Equipment","Quotes","Meeting","VehicleCheck","Breakdown","Repair","Analytics","Leads","Team","Expenses","Jobs","Invoices","More","Diagnostics","Notifications","SharedInbox","Client360","Calendar","TeamDashboard"])if(!screenKeys.includes(key))fail.push(`Screen not registered: ${key}`);
if(!app.includes("<QuickCaptureFAB currentScreen={screen} onTrigger={handleQuickCapture} />"))fail.push("Quick capture FAB is not mounted");
const all=[app,...required.filter(f=>f.endsWith(".js")||f.endsWith(".jsx")).map(read)].join("\n");
for(const[label,needle]of [["offline sync","pushSyncQueue"],["realtime sync","setupRealtimeSync"],["notifications","scheduleNotificationsViaSW"],["voice","transcribe-audio"],["technician AI","technician-assist"],["routing","google.com/maps"],["quote to job","createJobFromAcceptedQuote"],["job to invoice","createInvoiceFromJob"]])if(!all.includes(needle))fail.push(`Missing integration: ${label}`);
const sw=read("public/service-worker.js");if(!sw.includes('CACHE_NAME = "powermate-v10"'))fail.push("Unexpected service-worker version");
if(fail.length){console.error("FIELD READINESS FAILED");fail.forEach(x=>console.error(`- ${x}`));process.exit(1)}
console.log(`FIELD READINESS OK — ${lazy.length} lazy screens, ${screenKeys.length} registered routes, core offline/PWA/voice/AI/workflow checks passed.`);
