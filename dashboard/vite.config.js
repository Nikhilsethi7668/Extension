import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// When accessed via app.flashfender.com (tunnel), HMR must use that host so the browser can connect.
const hmrHost = process.env.VITE_HMR_PUBLIC_HOST; // e.g. app.flashfender.com

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: ['react', 'react-dom'],
  },
  server: {
    allowedHosts: ['extension-dashboard-1', 'flash.adaptusgroup.ca', 'localhost', 'app.flashfender.com', 'api.flashfender.com'],
    port: 3682,
    hmr: hmrHost
      ? { host: hmrHost, port: 443, protocol: 'wss', clientPort: 443 }
      : true,
    proxy: {
      '/api': {
        target: 'https://api.flashfender.com',
        changeOrigin: true,
      }
    }
  }
})
