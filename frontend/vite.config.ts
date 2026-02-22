import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    headers: {
      // Allow OAuth popups to communicate back without COOP restrictions
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    },
  },
})
