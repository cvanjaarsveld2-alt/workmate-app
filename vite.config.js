import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    // Keep production output readable/stable while we eliminate the
    // production-only TDZ crash. The previous manual vendor chunking could
    // split modules involved in an import cycle and, after minification,
    // surface as "Cannot access 'n' before initialization".
    //
    // Dynamic imports still create separate lazy chunks automatically.
    rollupOptions: {},
    minify: false,
    sourcemap: true,
    chunkSizeWarningLimit: 600,
  },
});
