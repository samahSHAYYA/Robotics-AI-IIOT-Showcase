import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://ops-api:8003',
      '/ws': {
        target: 'ws://ops-api:8003',
        ws: true,
      },
    },
  },
})
