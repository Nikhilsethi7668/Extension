import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ['extension-dashboard-1', 'flash.adaptusgroup.ca', 'localhost', 'app.flashfender.com'],
    port: 3682,
    proxy: {
      '/api': {
        target: 'https://api.flashfender.com',
        changeOrigin: true,
      }
    }
  }
})
