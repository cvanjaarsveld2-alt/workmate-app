// Builds the app, serves it, records the demo (demo-video.cjs) and saves an
// MP4 that plays on phones and WhatsApp: docs/demo/powermate-demo.mp4.
//   node tests/sim/demo.cjs        (needs ffmpeg: pip install imageio-ffmpeg)
const { execSync, spawn } = require("child_process");
const fs = require("fs"),
  path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const DIST = path.join(__dirname, "out", "demo-dist");
const PORT = "4181";
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  execSync(`npx vite build --outDir ${DIST} --emptyOutDir`, {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, VITE_SUPABASE_URL: "https://hrqzqyfvbfzrfnuxovvr.supabase.co", VITE_SUPABASE_ANON_KEY: "sim-key" },
  });
  const server = spawn("npx", ["vite", "preview", "--outDir", DIST, "--port", PORT, "--strictPort"], { cwd: ROOT, stdio: "ignore", detached: true });
  try {
    for (let i = 0; i < 60; i++) {
      try {
        if ((await fetch(`http://localhost:${PORT}/`)).ok) break;
      } catch {}
      await sleep(500);
    }
    execSync(`node ${path.join(__dirname, "demo-video.cjs")}`, {
      cwd: ROOT,
      stdio: "inherit",
      env: { ...process.env, SIM_APP_URL: `http://localhost:${PORT}`, SIM_OUT: "demo", SIM_EMAIL: "anna@acme-hydraulics.example", SIM_NAME: "Anna Venter" },
    });
  } finally {
    try {
      process.kill(-server.pid);
    } catch {}
  }
  const ffmpeg = process.env.FFMPEG || execSync(`python3 -c "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())"`).toString().trim();
  const out = path.join(ROOT, "docs", "demo");
  fs.mkdirSync(out, { recursive: true });
  // H.264, even dimensions, starts playing before it's fully downloaded.
  execSync(
    `"${ffmpeg}" -y -loglevel error -i "${path.join(__dirname, "out", "demo", "demo.webm")}" -vf "scale=780:-2:flags=lanczos,fps=30" -c:v libx264 -preset slow -crf 23 -pix_fmt yuv420p -movflags +faststart "${path.join(out, "powermate-demo.mp4")}"`,
  );
  console.log("Saved docs/demo/powermate-demo.mp4");
})().catch(e => {
  console.error(e);
  process.exit(1);
});
