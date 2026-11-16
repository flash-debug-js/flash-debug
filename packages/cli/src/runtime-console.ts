import type { DebugRuntime } from '@flash-debug/core'
import { spawn, spawnSync } from 'node:child_process'
import process from 'node:process'
import { createInterface } from 'node:readline'

type RuntimeLogStream = 'stdout' | 'stderr'

const ANSI_MUTED = '\u001B[90m'
const ANSI_RESET = '\u001B[0m'

export function createRuntimeConsole(): {
  writeLog: (line: string, stream: RuntimeLogStream) => void
  run: (runtime: Pick<DebugRuntime, 'publicUrl' | 'stop'>) => Promise<void>
} {
  return {
    writeLog: writeRuntimeLog,
    run: runRuntimeConsole,
  }
}

async function runRuntimeConsole(runtime: Pick<DebugRuntime, 'publicUrl' | 'stop'>): Promise<void> {
  const input = process.stdin.isTTY && process.stdout.isTTY && !process.env.CI
    ? createInterface({ input: process.stdin, output: process.stdout })
    : undefined
  let stopped = false
  let resolveDone: () => void = () => {}
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve
  })

  const stop = async (): Promise<void> => {
    if (stopped) {
      return
    }
    stopped = true
    input?.close()
    try {
      await runtime.stop()
      process.exitCode = 0
    }
    catch (error) {
      process.stderr.write(`${error instanceof Error
        ? error.message
        : String(error)}\n`)
      process.exitCode = 1
    }
    finally {
      resolveDone()
    }
  }

  const onSigint = (): void => {
    void stop()
  }
  const onSigterm = (): void => {
    void stop()
  }

  input?.on('line', (line) => {
    const command = line.trim().toLowerCase()
    if (command === 'q' || command === 'quit') {
      void stop()
    }
    else if (command === 'c' || command === 'copy') {
      copyPublicUrl(runtime.publicUrl)
    }
    else if (command === 'o' || command === 'open') {
      openPublicUrl(runtime.publicUrl)
    }
    else if (command === 'h' || command === 'help') {
      writeCommandHelp()
    }
  })
  process.once('SIGINT', onSigint)
  process.once('SIGTERM', onSigterm)

  if (input) {
    writeCommandHelp()
  }

  await done
  process.off('SIGINT', onSigint)
  process.off('SIGTERM', onSigterm)
}

function writeCommandHelp(): void {
  process.stdout.write(`${muted('Commands: q + Enter quit · c + Enter copy URL · o + Enter open URL · h + Enter help')}\n`)
}

function copyPublicUrl(url: string | undefined): void {
  if (!url) {
    process.stdout.write(`${muted('No public URL is available.')}\n`)
    return
  }

  const copied = process.platform === 'win32'
    ? runClipboardCommand('clip', [], url)
    : process.platform === 'darwin'
      ? runClipboardCommand('pbcopy', [], url)
      : runClipboardCommand('wl-copy', [], url) || runClipboardCommand('xclip', ['-selection', 'clipboard'], url)
  const message = copied
    ? `Copied ${url}`
    : 'No clipboard command is available.'
  process.stdout.write(`${muted(message)}\n`)
}

function runClipboardCommand(command: string, args: string[], value: string): boolean {
  try {
    return spawnSync(command, args, {
      input: value,
      stdio: ['pipe', 'ignore', 'ignore'],
      windowsHide: true,
    }).status === 0
  }
  catch {
    return false
  }
}

function openPublicUrl(url: string | undefined): void {
  if (!url) {
    process.stdout.write(`${muted('No public URL is available.')}\n`)
    return
  }

  const [command, args] = openCommand(url)
  const child = spawn(command, args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  })
  child.on('error', () => {})
  child.unref()
  process.stdout.write(`${muted(`Opening ${url}`)}\n`)
}

function openCommand(url: string): [string, string[]] {
  if (process.platform === 'win32') {
    return [
      'explorer.exe',
      [url],
    ]
  }
  if (process.platform === 'darwin') {
    return [
      'open',
      [url],
    ]
  }
  return [
    'xdg-open',
    [url],
  ]
}

function muted(value: string): string {
  return process.env.NO_COLOR
    ? value
    : `${ANSI_MUTED}${value}${ANSI_RESET}`
}

function writeRuntimeLog(line: string, stream: RuntimeLogStream): void {
  process.stderr.write(`${muted(`[${stream}] ${line}`)}\n`)
}
