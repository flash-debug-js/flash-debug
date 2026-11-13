import type { Plugin } from 'vite'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { nitro } from 'nitro/vite'
import { defineConfig } from 'vite'

const modernMonacoDist = dirname(fileURLToPath(import.meta.resolve('modern-monaco/core')))
const inspectorRoot = dirname(fileURLToPath(import.meta.url))
const modernMonacoAssets = ['editor-core.mjs', 'editor-worker-main.mjs', 'editor-worker.mjs'] as const

function modernMonacoCoreAssets(): Plugin {
  return {
    name: 'flash-debug-modern-monaco-core-assets',
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
      server.middlewares.use('/modern-monaco', (request, response, next) => {
        const name = request.url?.split('?')[0]?.replace(/^\//, '')
        if (!name || !modernMonacoAssets.includes(name as typeof modernMonacoAssets[number])) {
          next()
          return
        }

        response.statusCode = 200
        response.setHeader('Content-Type', 'text/javascript; charset=utf-8')
        response.end(readFileSync(join(modernMonacoDist, name)))
      })
    },
    generateBundle() {
      for (const name of modernMonacoAssets) {
        this.emitFile({
          type: 'asset',
          fileName: `modern-monaco/${name}`,
          source: readFileSync(join(modernMonacoDist, name)),
        })
      }
    },
  }
}

export default defineConfig({
  plugins: [
    vue(),
    modernMonacoCoreAssets(),
    ...nitro(),
  ],
  server: {
    host: '127.0.0.1',
    port: 4517,
  },
  build: {
    rollupOptions: {
      input: {
        inspector: resolve(inspectorRoot, 'index.html'),
        monaco: resolve(inspectorRoot, 'monaco.html'),
      },
    },
  },
})
