import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Default to relative assets so deployment path is auto-resolved from current URL.
  // Only explicit VITE_BASE_URL can override this behavior.
  const rawBase = (env.VITE_BASE_URL || './').trim()
  let finalBase = rawBase === '' ? './' : rawBase
  if (finalBase !== './' && finalBase !== '/' && !finalBase.endsWith('/')) {
    finalBase = `${finalBase}/`
  }

  return {
    plugins: [react()],
    base: finalBase,
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      emptyOutDir: true,
    },
    server: {
      port: 3000,
      proxy: {
        '/api': {
          target: env.VITE_API_URL || 'https://tools.tornevall.net',
          changeOrigin: true,
          secure: false,
        }
      }
    }
  }
})
