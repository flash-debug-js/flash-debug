import vue from '@vitejs/plugin-vue'
import { nitro } from 'nitro/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    vue(),
    ...nitro(),
  ],
  server: {
    host: '127.0.0.1',
    port: 4517,
  },
})
