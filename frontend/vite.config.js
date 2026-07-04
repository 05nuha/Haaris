import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev server runs on :3000 — the FastAPI backend's CORS policy allows this origin.
export default defineConfig({
  plugins: [react()],
  server: { port: 3000 },
})
