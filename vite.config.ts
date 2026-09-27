import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Relative asset paths so the build works from any sub-path (e.g. GitHub Pages).
  base: './',
  // Listen on the LAN so the app can be opened from a phone on the same Wi-Fi.
  server: { host: true },
  preview: { host: true },
})
