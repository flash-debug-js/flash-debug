import { defineConfig } from 'nitro'

export default defineConfig({
  serverDir: '../server/server',
  publicAssets: [
    {
      dir: './dist',
      maxAge: 0,
    },
  ],
})
