import type { DebugFilterValues, DebugSessionSnapshot } from '@flash-debug/types'
import type { ChildProcess } from 'node:child_process'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Readable } from 'node:stream'
import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { DEFAULT_DEBUG_PORT } from '@flash-debug/config/constants'

const require = createRequire(import.meta.url)
type NitroProcess = ChildProcess & { stdout: Readable, stderr: Readable }

export interface DebugServerOptions {
  host?: string
  port?: number
  rootDir?: string
  timeoutMs?: number
  onControlRequest?: (request: {
    action: 'get-session' | 'update-filters'
    filters?: DebugFilterValues
  }) => Promise<DebugSessionSnapshot>
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
  const port = options.port ?? DEFAULT_DEBUG_PORT
  const rootDir = resolve(options.rootDir ?? process.cwd())
  const localUrl = `http://${host}:${port}`
  const controlServer = options.onControlRequest
    ? await startControlServer(options.onControlRequest)
    : undefined
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
    env: {
      ...process.env,
      ...(controlServer
        ? { FLASH_DEBUG_CONTROL_URL: controlServer.url }
        : {}),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  }) as NitroProcess

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
    await controlServer?.close()
    throw error
  }

  return {
    localUrl,
    process: child,
    close: async () => {
      await killProcess(child)
      await controlServer?.close()
    },
  }
}

async function startControlServer(
  handler: NonNullable<DebugServerOptions['onControlRequest']>,
): Promise<{ url: string, close: () => Promise<void> }> {
  const server = createServer((request, response) => {
    void handleControlRequest(request, response, handler)
  })
  await new Promise<void>((resolvePromise, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolvePromise()
    })
  })

  const address = server.address()
  if (!address || typeof address === 'string') {
    await closeControlServer(server)
    throw new Error('Flash Debug control server did not expose a TCP port')
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => closeControlServer(server),
  }
}

async function handleControlRequest(
  request: IncomingMessage,
  response: ServerResponse,
  handler: NonNullable<DebugServerOptions['onControlRequest']>,
): Promise<void> {
  if (request.method !== 'POST' || request.url !== '/control') {
    response.statusCode = 404
    response.end()
    return
  }

  try {
    const body = await readRequestBody(request)
    if (!isControlRequest(body)) {
      response.statusCode = 400
      response.end('Invalid control request')
      return
    }
    const result = await handler(body)
    response.statusCode = 200
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify(result))
  }
  catch (error) {
    response.statusCode = 500
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify({
      error: error instanceof Error
        ? error.message
        : String(error),
    }))
  }
}

function readRequestBody(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolvePromise, reject) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => {
      try {
        resolvePromise(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      }
      catch (error) {
        reject(error)
      }
    })
    request.on('error', reject)
  })
}

function isControlRequest(message: unknown): message is {
  action: 'get-session' | 'update-filters'
  filters?: DebugFilterValues
} {
  return typeof message === 'object'
    && message !== null
    && ((message as { action?: unknown }).action === 'get-session'
      || (message as { action?: unknown }).action === 'update-filters')
}

function closeControlServer(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    server.close(error => error
      ? reject(error)
      : resolvePromise())
  })
}
