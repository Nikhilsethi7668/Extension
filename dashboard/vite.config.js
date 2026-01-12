import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ['extension-dashboard-1', 'flash.adaptusgroup.ca', 'localhost'],
    port: 3682,
    proxy: {
      '/api': {
        target: 'http://localhost:5573',
        changeOrigin: true,
      }
    }
  }
})
