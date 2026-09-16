import fs from "node:fs";
import path from "node:path";
const root=process.cwd();
const app=fs.readFileSync(path.join(root,"src/App.jsx"),"utf8");
const required=["src/offline/offlineDb.js","src/lib/sync.js","src/lib/notifications.js","src/components/QuickCaptureFAB.jsx","src/components/VoiceInput.jsx","src/screens/JobsScreen.jsx","src/screens/InvoicesScreen.jsx","src/screens/Client360Screen.jsx","src/screens/TeamDashboardScreen.jsx","public/service-worker.js","manifest.webmanifest"];
const fail=[];
for(const f of required)if(!fs.existsSync(path.join(root,f)))fail.push(`Missing ${f}`);
const lazy=[...app.matchAll(/const\s+(\w+)\s*=\s*lazy\(\(\)\s*=>\s*import\("\.\/screens\/([^\"]+)"\)/g)];
for(const[,name,file]of lazy)if(!fs.existsSync(path.join(root,"src/screens",file)))fail.push(`Missing lazy screen ${name}: ${file}`);
const screenKeys=[...app.matchAll(/^\s{4}(\w+):\s*</gm)].map(m=>m[1]);
for(const key of ["Home","Clients","Contacts","Followups","Notes","Equipment","Quotes","Meeting","VehicleCheck","Breakdown","Repair","Analytics","Leads","Team","Expenses","Jobs","Invoices","More","Diagnostics","Notifications","SharedInbox","Client360","Calendar","TeamDashboard"])if(!screenKeys.includes(key))fail.push(`Screen not registered: ${key}`);
if(!app.includes("<QuickCaptureFAB currentScreen={screen} onTrigger={handleQuickCapture} />"))fail.push("Quick capture FAB is not mounted");
const checks=[["offline sync","pushSyncQueue"],["realtime sync","setupRealtimeSync"],["notifications","scheduleNotificationsViaSW"],["voice","transcribe-audio"],["technician AI","technician-assist"],["routing","google.com/maps"],["quote to job","createJobFromAcceptedQuote"],["job to invoice","createInvoiceFromJob"]];
const all=app+fs.readFileSync(path.join(root,"src/lib/sync.js"),"utf8")+fs.readFileSync(path.join(root,"src/lib/jobInvoiceAutomation.js"),"utf8");
for(const[label,needle]of checks)if(!all.includes(needle))fail.push(`Missing integration: ${label}`);
const sw=fs.readFileSync(path.join(root,"public/service-worker.js"),"utf8");if(!sw.includes('CACHE_NAME = "powermate-v10"'))fail.push("Unexpected service-worker version");
if(fail.length){console.error("FIELD READINESS FAILED");fail.forEach(x=>console.error(`- ${x}`));process.exit(1)}
console.log(`FIELD READINESS OK — ${lazy.length} lazy screens, ${screenKeys.length} registered routes, core offline/PWA/voice/AI/workflow checks passed.`);
