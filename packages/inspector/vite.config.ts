import type { Plugin } from 'vite'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

const inspectorRoot = dirname(fileURLToPath(import.meta.url))
const apiDevOrigin = 'http://127.0.0.1:4518'

function inspectorHtmlEntries(): Plugin {
  return {
    name: 'flash-debug-inspector-html-entries',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathname = request.url?.split('?')[0]
        if (pathname !== '/' && pathname !== '/index.html' && pathname !== '/monaco.html') {
          next()
          return
        }

        const fileName = pathname === '/monaco.html'
          ? 'monaco.html'
          : 'index.html'
        const source = readFileSync(resolve(inspectorRoot, fileName), 'utf8')
        void server.transformIndexHtml(pathname ?? '/', source).then((html) => {
          response.statusCode = 200
          response.setHeader('Content-Type', 'text/html; charset=utf-8')
          response.end(html)
        })
      })
    },
  }
}

export default defineConfig({
  plugins: [
    vue(),
    inspectorHtmlEntries(),
  ],
  server: {
    host: '0.0.0.0',
    port: 4517,
    proxy: {
      '/api': {
        target: apiDevOrigin,
        changeOrigin: true,
      },
      '/healthz': {
        target: apiDevOrigin,
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      input: {
        index: resolve(inspectorRoot, 'index.html'),
        monaco: resolve(inspectorRoot, 'monaco.html'),
      },
    },
  },
})
