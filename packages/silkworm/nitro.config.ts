import { defineConfig } from 'nitro'

export default defineConfig({
  serverDir: './server',
  serveStatic: 'node',
  publicAssets: [
    {
      dir: './dist',
      maxAge: 0,
    },
  ],
})
