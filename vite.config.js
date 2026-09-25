import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

// Offline support: lazy screens are separate files, and the service worker used
// to cache each one only after it had been opened online. After an install or a
// deploy, any screen not yet visited failed to open offline. This writes the
// full list of built files into dist/service-worker.js so it downloads all of
// them at install, and stamps the cache name with a build hash so every deploy
// changes the worker and triggers that download again.
function precacheServiceWorker() {
  let outDir = "dist";
  let files = [];
  return {
    name: "powermate-precache-service-worker",
    apply: "build",
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    writeBundle(_options, bundle) {
      files = Object.keys(bundle)
        .filter(f => !f.endsWith(".map") && !f.endsWith(".html"))
        .sort();
    },
    closeBundle() {
      const swPath = path.join(outDir, "service-worker.js");
      if (!fs.existsSync(swPath)) return;
      const hash = crypto.createHash("sha256").update(files.join("\n")).digest("hex").slice(0, 10);
      let sw = fs.readFileSync(swPath, "utf8");
      const assets = `const BUILD_ASSETS = ${JSON.stringify(files.map(f => `/${f}`))};`;
      if (!sw.includes("const BUILD_ASSETS = [];")) throw new Error("service-worker.js: BUILD_ASSETS placeholder missing");
      sw = sw.replace("const BUILD_ASSETS = [];", assets);
      sw = sw.replace(/const CACHE_NAME = "(powermate-v\d+)";/, (_m, v) => `const CACHE_NAME = "${v}-${hash}";`);
      fs.writeFileSync(swPath, sw);
    },
  };
}

export default defineConfig({
  plugins: [react(), precacheServiceWorker()],
  define: {
    // Tags error reports with the deployed commit (Vercel sets this at build time).
    "import.meta.env.VITE_BUILD_SHA": JSON.stringify((process.env.VERCEL_GIT_COMMIT_SHA || "dev").slice(0, 7)),
  },
  build: {
    // The old TDZ crash ("Cannot access 'n' before initialization") came from
    // manual vendor chunking splitting an import cycle. With automatic chunking,
    // minified builds were verified by opening all 28 screens and running the
    // save/sync flows in a browser (2026-09-22); main bundle 1.68 MB -> 755 KB.
    // Vite 8 builds with Rolldown and minifies with Oxc (its default); the
    // simulation re-checks every screen and flow against the minified build.
    minify: true,
    // Source maps stay out of the public deploy; they exposed the full source tree.
    sourcemap: false,
    chunkSizeWarningLimit: 600,
  },
});
