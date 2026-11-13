import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import process from 'node:process'

const require = createRequire(import.meta.url)
const nitroCli = join(dirname(require.resolve('nitro/package.json')), 'dist', 'cli', 'index.mjs')
const viteCli = join(dirname(require.resolve('vite/package.json')), 'bin', 'vite.js')
const children = []

function start(command, args) {
  const child = spawn(process.execPath, [command, ...args], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
    windowsHide: true,
  })
  children.push(child)
  return child
}

const nitro = start(nitroCli, [
  'dev',
  '--dir',
  '.',
  '--host',
  '127.0.0.1',
  '--port',
  '4328',
])
const vite = start(viteCli, [
  '--host',
  '127.0.0.1',
  '--port',
  '4330',
])

function openBrowser(url) {
  if (process.platform === 'win32') {
    spawn('explorer.exe', [url], { detached: true, stdio: 'ignore', windowsHide: true }).unref()
  }
  else if (process.platform === 'darwin') {
    spawn('open', [url], { detached: true, stdio: 'ignore' }).unref()
  }
  else {
    spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref()
  }
}

setTimeout(openBrowser, 700, 'http://127.0.0.1:4330').unref()

function stop() {
  for (const child of children) {
    if (child.exitCode === null) {
      child.kill()
    }
  }
}

process.once('SIGINT', stop)
process.once('SIGTERM', stop)

const [result] = await Promise.race([
  once(nitro, 'exit'),
  once(vite, 'exit'),
])

stop()
process.exitCode = result?.[0] ?? 0
