import { defineConfig } from 'nitro'

export default defineConfig({
  serverDir: './server',
  serveStatic: 'node',
  publicAssets: [
    {
      dir: '../inspector/dist',
      maxAge: 0,
    },
  ],
})
