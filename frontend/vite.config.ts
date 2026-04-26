import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Split vendor deps into separate chunks so the main bundle stays small
// and caches survive app code changes.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:8000",
    },
  },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          leaflet: ["leaflet", "leaflet.markercluster", "react-leaflet", "react-leaflet-cluster"],
          charts: ["recharts"],
          axios: ["axios"],
        },
      },
    },
  },
});
