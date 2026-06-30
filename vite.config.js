import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Web dev server on 5173, API server on 5174. Proxy /api to the data server.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:5174',
    },
  },
})
