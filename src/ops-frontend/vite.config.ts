/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/v1/agent': {
        target: 'http://ai-agent:8004',
        changeOrigin: true,
      },
      '/api': 'http://ops-api:8003',
      '/ws': {
        target: 'ws://ops-api:8003',
        ws: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    exclude: ['e2e/**', 'node_modules/**'],
  },
})
