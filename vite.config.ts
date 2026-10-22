import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Client dev server: fixed port 5173 (DESIGN.md 9.2 rule 5). strictPort makes it fail
// instead of silently moving to another port.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
});
