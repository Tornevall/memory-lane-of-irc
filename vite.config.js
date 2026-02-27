import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // No base path - can be deployed anywhere!
  // If you need a base path for subdirectory deployment, set it via:
  // base: process.env.BASE_URL || '/'
  base: '/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'https://tools.tornevall.net',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})
