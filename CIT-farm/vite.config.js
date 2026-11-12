import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: false,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:55555',
        changeOrigin: true
      },
      '/ws': {
        target: 'ws://127.0.0.1:55555',
        ws: true,
        configure: (proxy) => {
          proxy.on('error', (err) => {
            // Ignore standard browser tab refresh / close disconnect signals
            if (['ECONNRESET', 'ECONNABORTED', 'EPIPE'].includes(err.code)) {
              return;
            }
            console.warn('[Vite WS Proxy Warning]:', err.message);
          });
        }
      }
    }
  }
})
