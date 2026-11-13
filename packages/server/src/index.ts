import type { Buffer } from 'node:buffer'
import type { ChildProcessByStdio } from 'node:child_process'
import type { Readable } from 'node:stream'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'

const require = createRequire(import.meta.url)
type NitroProcess = ChildProcessByStdio<null, Readable, Readable>

export interface DebugServerOptions {
  host?: string
  port?: number
  rootDir?: string
  timeoutMs?: number
  onLog?: (line: string, stream: 'stdout' | 'stderr') => void
}

export interface DebugServer {
  localUrl: string
  process: NitroProcess
  close: () => Promise<void>
}

function nitroCliPath(): string {
  const packageJson = require.resolve('nitro/package.json')
  return join(dirname(packageJson), 'dist', 'cli', 'index.mjs')
}

function killProcess(child: NitroProcess): Promise<void> {
  if (child.exitCode !== null) {
    return Promise.resolve()
  }

  return new Promise((resolvePromise) => {
    const done = () => resolvePromise()
    child.once('exit', done)

    if (process.platform === 'win32' && child.pid) {
      spawn('taskkill', [
        '/PID',
        String(child.pid),
        '/T',
        '/F',
      ], { windowsHide: true, stdio: 'ignore' })
    }
    else {
      child.kill('SIGTERM')
    }

    setTimeout(done, 5000).unref()
  })
}

async function waitForHealth(url: string, child: NitroProcess, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let lastError: unknown

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Nitro exited before becoming ready with code ${child.exitCode}`)
    }

    try {
      const response = await fetch(`${url}/healthz`, {
        signal: AbortSignal.timeout(500),
      })
      if (response.ok) {
        return
      }
      lastError = new Error(`HTTP ${response.status}`)
    }
    catch (error) {
      lastError = error
    }

    await new Promise(resolvePromise => setTimeout(resolvePromise, 100))
  }

  throw new Error(`Nitro did not become ready within ${timeoutMs}ms: ${lastError instanceof Error
    ? lastError.message
    : String(lastError)}`)
}

/** Start the local Nitro origin that owns the Inspector API. */
export async function startDebugServer(options: DebugServerOptions = {}): Promise<DebugServer> {
  const host = options.host ?? '127.0.0.1'
  const port = options.port ?? 4317
  const rootDir = resolve(options.rootDir ?? process.cwd())
  const localUrl = `http://${host}:${port}`
  const child = spawn(process.execPath, [
    nitroCliPath(),
    'dev',
    '--dir',
    rootDir,
    '--host',
    host,
    '--port',
    String(port),
  ], {
    cwd: rootDir,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })

  const forward = (stream: 'stdout' | 'stderr') => (chunk: Buffer) => {
    for (const line of chunk.toString().split(/\r?\n/).filter(Boolean)) {
      options.onLog?.(line, stream)
    }
  }
  child.stdout.on('data', forward('stdout'))
  child.stderr.on('data', forward('stderr'))

  try {
    await waitForHealth(localUrl, child, options.timeoutMs ?? 30_000)
  }
  catch (error) {
    await killProcess(child)
    throw error
  }

  return {
    localUrl,
    process: child,
    close: () => killProcess(child),
  }
}
