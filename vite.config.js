import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  define: {
    // Tags error reports with the deployed commit (Vercel sets this at build time).
    "import.meta.env.VITE_BUILD_SHA": JSON.stringify((process.env.VERCEL_GIT_COMMIT_SHA || "dev").slice(0, 7)),
  },
  build: {
    // The old TDZ crash ("Cannot access 'n' before initialization") came from
    // manual vendor chunking splitting an import cycle. With automatic chunking,
    // minified builds were verified by opening all 28 screens and running the
    // save/sync flows in a browser (2026-09-22); main bundle 1.68 MB -> 755 KB.
    rollupOptions: {},
    minify: "esbuild",
    // Source maps stay out of the public deploy; they exposed the full source tree.
    sourcemap: false,
    chunkSizeWarningLimit: 600,
  },
});
