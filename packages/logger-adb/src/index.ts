import type { DebugClientAdapter, DebugClientSession, DebugDevice, DebugFilterValues, DebugLogRecord, DebugSourceDescriptor } from '@flash-debug/types'
import type { Buffer } from 'node:buffer'
import { execFile, spawn } from 'node:child_process'
import process from 'node:process'
import { promisify } from 'node:util'

export interface AdbAdapterOptions {
  adbPath?: string
}

const execFileAsync = promisify(execFile)

const LOG_LEVELS = {
  V: 'debug',
  D: 'debug',
  I: 'info',
  W: 'warning',
  E: 'error',
  F: 'error',
} as const

const ADB_FILTER_DEFINITIONS = [
  {
    id: 'filterSpecs',
    label: 'Filter specs',
    kind: 'text',
    scope: 'capture',
    apply: 'restart',
    placeholder: '*:S ActivityManager:I',
    description: 'Use adb logcat filter syntax, for example *:S ActivityManager:I.',
  },
  {
    id: 'pid',
    label: 'PID',
    kind: 'number',
    scope: 'capture',
    apply: 'restart',
    placeholder: '12345',
  },
] as const

export function parseAdbDevices(output: string): DebugDevice[] {
  return output
    .split(/\r?\n/)
    .slice(1)
    .map(line => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [id = '', state = 'unknown', ...metadataParts] = line.split(/\s+/)
      const metadata = Object.fromEntries(
        metadataParts
          .map(part => part.split(':', 2))
          .filter(([key, value]) => Boolean(key && value)) as Array<[string, string]>,
      )
      return {
        id,
        name: metadata.model?.replace(/_/g, ' '),
        platform: 'android' as const,
        transport: 'adb',
        state: state === 'device'
          ? 'online' as const
          : state === 'offline'
            ? 'offline' as const
            : state === 'unauthorized'
              ? 'unauthorized' as const
              : 'unknown' as const,
        metadata,
      }
    })
    .filter(device => device.id.length > 0)
}

export function getAdbSourceDescriptor(): DebugSourceDescriptor {
  return {
    id: 'adb',
    label: 'Android ADB',
    source: 'adb',
    transport: 'adb',
    filters: ADB_FILTER_DEFINITIONS,
  }
}

/** Parse the common `adb logcat -v threadtime` shape into the shared protocol. */
export function parseLogcatLine(line: string, deviceId?: string): DebugLogRecord | undefined {
  const trimmed = line.trim()
  const parts = trimmed.split(/\s+/)
  if (parts.length < 6) {
    return undefined
  }

  const rawTimestamp = `${parts[0]} ${parts[1]}`
  const rawLevel = parts[4]
  if (!rawLevel || !/^[VDIWEF]$/.test(rawLevel)) {
    return undefined
  }

  const level = LOG_LEVELS[rawLevel as keyof typeof LOG_LEVELS] ?? 'info'
  const year = new Date().getFullYear()
  const timestamp = new Date(`${year}-${rawTimestamp.replace(' ', 'T')}`).toISOString()
  const levelIndex = trimmed.indexOf(` ${rawLevel} `)
  const payload = levelIndex >= 0
    ? trimmed.slice(levelIndex + rawLevel.length + 2)
    : ''
  const separator = payload.indexOf(':')
  const rawTag = separator >= 0
    ? payload.slice(0, separator).trim()
    : 'logcat'
  const message = separator >= 0
    ? payload.slice(separator + 1).trimStart()
    : payload

  return {
    id: `${deviceId ?? 'adb'}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp,
    level,
    type: 'log',
    source: 'adb',
    deviceId,
    tag: rawTag.trim(),
    message,
  }
}

/**
 * ADB adapter contract. Process management is intentionally kept behind this
 * package so the generic client package never knows about adb or logcat.
 */
export function createAdbAdapter(_options: AdbAdapterOptions = {}): DebugClientAdapter {
  const adbPath = _options.adbPath ?? 'adb'

  return {
    id: 'adb',
    capabilities: ['devices', 'logcat'],
    getSourceDescriptor: getAdbSourceDescriptor,

    async listDevices(options = {}): Promise<DebugDevice[]> {
      const result = await execFileAsync(adbPath, ['devices', '-l'], {
        encoding: 'utf8',
        windowsHide: true,
        signal: options.signal,
      })
      return parseAdbDevices(result.stdout)
    },

    async startLogs({ deviceId, onRecord, signal, filters }): Promise<DebugClientSession> {
      const child = spawn(adbPath, [
        '-s',
        deviceId,
        'logcat',
        '-v',
        'threadtime',
        ...buildLogcatFilterArgs(filters),
      ], {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      })
      let buffered = ''
      const emitLines = (chunk: Buffer) => {
        buffered += chunk.toString()
        const lines = buffered.split(/\r?\n/)
        buffered = lines.pop() ?? ''
        for (const line of lines) {
          const record = parseLogcatLine(line, deviceId)
          if (record) {
            onRecord(record)
          }
        }
      }
      child.stdout.on('data', emitLines)

      const stop = async (): Promise<void> => {
        if (child.exitCode !== null) {
          return
        }
        await new Promise<void>((resolve) => {
          child.once('exit', () => resolve())
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
          setTimeout(resolve, 5000).unref()
        })
      }

      if (signal) {
        if (signal.aborted) {
          await stop()
        }
        else {
          signal.addEventListener('abort', () => {
            void stop()
          }, { once: true })
        }
      }

      return {
        id: `adb:${deviceId}:${Date.now()}`,
        device: {
          id: deviceId,
          platform: 'android',
          transport: 'adb',
          state: 'online',
        },
        stop,
      }
    },
  }
}

function buildLogcatFilterArgs(filters: DebugFilterValues | undefined): string[] {
  if (!filters) {
    return []
  }
  const args: string[] = []
  const filterSpecs = typeof filters.filterSpecs === 'string'
    ? filters.filterSpecs.trim()
    : ''
  const pid = typeof filters.pid === 'number' || typeof filters.pid === 'string'
    ? String(filters.pid).trim()
    : ''
  if (filterSpecs) {
    args.push(...filterSpecs.split(/\s+/).filter(Boolean))
  }
  if (pid) {
    args.push('--pid', pid)
  }
  return args
}

export type { DebugClientAdapter, DebugClientSession, DebugDevice, DebugLogRecord } from '@flash-debug/types'
