import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    // Let Rollup/Vite determine chunk boundaries automatically.
    // The previous hand-written vendor chunks could split modules involved in
    // an import cycle and produce a production-only TDZ error such as
    // "Cannot access 'n' before initialization" after minification.
    // Lazy-loaded screens are still split automatically by dynamic import().
    rollupOptions: {},
    chunkSizeWarningLimit: 600,
  },
});
