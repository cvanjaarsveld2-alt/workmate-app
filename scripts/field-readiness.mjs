import fs from "node:fs";
import path from "node:path";
const root=process.cwd();
const read=f=>fs.readFileSync(path.join(root,f),"utf8");
const app=read("src/App.jsx");
const required=["src/offline/offlineDb.js","src/lib/sync.js","src/lib/notifications.js","src/components/QuickCaptureFAB.jsx","src/components/VoiceInput.jsx","src/screens/JobsScreen.jsx","src/screens/InvoicesScreen.jsx","src/screens/Client360Screen.jsx","src/screens/TeamDashboardScreen.jsx","src/lib/jobInvoiceAutomation.js","src/lib/quoteAutomation.js","public/service-worker.js","public/manifest.webmanifest"];
const fail=[];
for(const f of required)if(!fs.existsSync(path.join(root,f)))fail.push(`Missing ${f}`);
const lazy=[...app.matchAll(/const\s+(\w+)\s*=\s*lazy\(\(\)\s*=>\s*import\("\.\/screens\/([^\"]+)"\)/g)];
for(const[,name,file]of lazy){const candidate=path.join(root,"src/screens",file);if(!fs.existsSync(candidate)&&!fs.existsSync(`${candidate}.jsx`)&&!fs.existsSync(`${candidate}.js`))fail.push(`Missing lazy screen ${name}: ${file}`)}
const screenKeys=[...app.matchAll(/(?:const\s+screens\s*=\s*\{|,)\s*(\w+):\s*\(?\s*</g)].map(m=>m[1]);
for(const key of ["Home","Clients","Contacts","Followups","Notes","Equipment","Quotes","Meeting","VehicleCheck","Breakdown","Repair","Analytics","Leads","Team","Expenses","Jobs","Invoices","More","Diagnostics","Notifications","SharedInbox","Client360","Calendar","TeamDashboard","Assistant"])if(!screenKeys.includes(key))fail.push(`Screen not registered: ${key}`);
if(!/<QuickCaptureFAB\s+currentScreen=\{screen\}\s+onTrigger=\{handleQuickCapture\}\s*\/>/.test(app))fail.push("Quick capture FAB is not mounted");
const all=[app,...required.filter(f=>f.endsWith(".js")||f.endsWith(".jsx")).map(read)].join("\n");
for(const[label,needle]of [["offline sync","pushSyncQueue"],["realtime sync","setupRealtimeSync"],["notifications","scheduleNotificationsViaSW"],["voice","transcribe-audio"],["technician AI","technician-assist"],["routing","google.com/maps"],["quote to job","createJobFromAcceptedQuote"],["job to invoice","createInvoiceFromJob"]])if(!all.includes(needle))fail.push(`Missing integration: ${label}`);
const sw=read("public/service-worker.js");if(!/CACHE_NAME\s*=\s*"powermate-v\d+"/.test(sw))fail.push("Unexpected service-worker cache name");
if(fail.length){console.error("FIELD READINESS FAILED");fail.forEach(x=>console.error(`- ${x}`));process.exit(1)}
console.log(`FIELD READINESS OK — ${lazy.length} lazy screens, ${screenKeys.length} registered routes, core offline/PWA/voice/AI/workflow checks passed.`);
