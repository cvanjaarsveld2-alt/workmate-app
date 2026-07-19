import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Core React runtime — loads first, cached aggressively
          "vendor-react": ["react", "react-dom"],

          // Framer Motion — animations, medium size
          "vendor-motion": ["framer-motion"],

          // Supabase client
          "vendor-supabase": ["@supabase/supabase-js"],

          // Lucide icons
          "vendor-icons": ["lucide-react"],

          // PDF generation — only loads when user generates a PDF
          "chunk-pdf": ["jspdf", "jspdf-autotable"],

          // Excel export — only loads when user exports to Excel
          "chunk-excel": ["exceljs"],
        },
      },
    },
    // Increase warning threshold — chunks are intentionally split
    chunkSizeWarningLimit: 600,
  },
});
