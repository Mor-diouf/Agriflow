/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Bac à sable du module : `pnpm dev:terrain` lance la collecte terrain seule, sans la plateforme.
export default defineConfig({
  root: "dev",
  plugins: [react()],
  server: {
    port: 5177,
    proxy: {
      "/api": { target: "http://localhost:8000", rewrite: (p) => p.replace(/^\/api/, "") },
    },
  },
  test: {
    root: ".",
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    css: false,
    env: { VITE_SM10_API_URL: "http://api.test" },
  },
});
