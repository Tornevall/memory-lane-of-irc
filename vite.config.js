import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const rawBase = (env.BASE_URL || env.VITE_BASE_URL || '/').trim()
  const normalizedBase = rawBase === '' ? '/' : (rawBase.startsWith('/') ? rawBase : `/${rawBase}`)
  const finalBase = normalizedBase.endsWith('/') ? normalizedBase : `${normalizedBase}/`

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
