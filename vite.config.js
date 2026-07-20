import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const TARGET_BASES = {
  prod: 'https://tools.tornevall.net',
  test: 'https://tools.tornevall.com',
}

function normalizeBaseUrl(raw) {
  const base = String(raw || '').trim()
  if (!base) return ''
  return base.endsWith('/') ? base.slice(0, -1) : base
}

function resolveApiTarget(env) {
  const explicit = normalizeBaseUrl(env.VITE_API_URL)
  if (explicit) {
    return explicit
  }
  const target = String(env.VITE_API_TARGET || '').trim().toLowerCase()
  if (target && TARGET_BASES[target]) {
    return TARGET_BASES[target]
  }
  return TARGET_BASES.prod
}

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
          target: resolveApiTarget(env),
          changeOrigin: true,
          secure: false,
        }
      }
    }
  }
})
