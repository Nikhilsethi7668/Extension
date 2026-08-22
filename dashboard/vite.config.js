import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode`
  const env = loadEnv(mode, process.cwd(), '')
  const backendTarget = env.VITE_API_BASE_URL ? env.VITE_API_BASE_URL.replace('/api', '') : (process.env.API_BASE_URL || 'http://localhost:5573');

  return {
    plugins: [react()],
    server: {
      allowedHosts: ['extension-dashboard-1', 'flash.adaptusgroup.ca', 'localhost', 'app.flashfender.com'],
      port: 3682,
      proxy: {
        '/api': {
          target: backendTarget,
          changeOrigin: true,
        },
        '/uploads': {
          target: backendTarget,
          changeOrigin: true,
        }
      }
    }
  }
})
