import type { DebugClientAdapter, DebugClientSession, DebugDevice, DebugFilterValues, DebugLogRecord, DebugSourceDescriptor } from '@flash-debug/types'
import type { Buffer } from 'node:buffer'
import { execFile, spawn } from 'node:child_process'
import process from 'node:process'
import { promisify } from 'node:util'

export interface HdcAdapterOptions {
  hdcPath?: string
}

export interface HilogParseOptions {
  deviceId?: string
  now?: Date
}

export const HDC_DEFAULT_FILTERS = {
  logType: 'app',
  levels: ['W', 'E', 'F'],
} as const

const HDC_FILTER_DEFINITIONS = [
  {
    id: 'logType',
    label: 'Log type',
    kind: 'select',
    scope: 'capture',
    apply: 'restart',
    defaultValue: HDC_DEFAULT_FILTERS.logType,
    options: [
      { label: 'Application', value: 'app' },
      { label: 'Core', value: 'core' },
      { label: 'Init', value: 'init' },
      { label: 'Kernel', value: 'kmsg' },
    ],
  },
  {
    id: 'levels',
    label: 'Levels',
    kind: 'multi-select',
    scope: 'capture',
    apply: 'restart',
    defaultValue: [...HDC_DEFAULT_FILTERS.levels],
    options: [
      { label: 'Debug', value: 'D' },
      { label: 'Info', value: 'I' },
      { label: 'Warning', value: 'W' },
      { label: 'Error', value: 'E' },
      { label: 'Fatal', value: 'F' },
    ],
  },
  {
    id: 'domain',
    label: 'Domain',
    kind: 'text',
    scope: 'capture',
    apply: 'restart',
    placeholder: 'A03200',
    description: 'Pick a value from recent logs or enter a Domain ID.',
  },
  {
    id: 'tag',
    label: 'Tag',
    kind: 'text',
    scope: 'capture',
    apply: 'restart',
    placeholder: 'testTag',
    description: 'Pick a value from recent logs or enter a tag.',
  },
  {
    id: 'pid',
    label: 'PID',
    kind: 'number',
    scope: 'capture',
    apply: 'restart',
    placeholder: '5394',
    description: 'Pick a process ID from recent logs or enter one.',
  },
  {
    id: 'regex',
    label: 'Message regex',
    kind: 'text',
    scope: 'capture',
    apply: 'restart',
    placeholder: 'keyword or pattern',
  },
] as const

const execFileAsync = promisify(execFile)

const LOG_LEVELS = {
  V: 'debug',
  D: 'debug',
  I: 'info',
  W: 'warning',
  E: 'error',
  F: 'error',
} as const

const HILOG_LINE_PATTERN = /^\s*(\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2}\.\d+)\s+(\d+)(?:\s+|-)(\d+)\s+([VDIWEF])\s+/

export function parseHdcDevices(output: string): DebugDevice[] {
  return output
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0
      && line !== 'List of devices attached'
      && !line.startsWith('[Fail]'))
    .map((line) => {
      const [id = '', ...metadataParts] = line.split(/\s+/)
      const metadata = Object.fromEntries(
        metadataParts
          .map(part => part.split(':', 2))
          .filter(([key, value]) => Boolean(key && value)) as Array<[string, string]>,
      )
      return {
        id,
        name: metadata.name ?? metadata.model,
        platform: 'harmony' as const,
        transport: 'hdc',
        state: 'online' as const,
        metadata,
      }
    })
    .filter(device => device.id.length > 0)
}

export function getHdcSourceDescriptor(): DebugSourceDescriptor {
  return {
    id: 'hdc',
    label: 'HarmonyOS HDC',
    source: 'harmony',
    transport: 'hdc',
    filters: HDC_FILTER_DEFINITIONS,
  }
}

/** Parse the standard `hdc hilog -v long` output shape into the shared protocol. */
export function parseHilogLine(line: string, options: HilogParseOptions = {}): DebugLogRecord | undefined {
  const match = HILOG_LINE_PATTERN.exec(line)
  if (!match) {
    return undefined
  }

  const monthDay = match[1]
  const time = match[2]
  const pidText = match[3]
  const tidText = match[4]
  const rawLevel = match[5]
  const payload = line.slice(match[0].length)
  if (!monthDay || !time || !pidText || !tidText || !rawLevel) {
    return undefined
  }
  const separator = payload.indexOf(':')
  if (separator < 0) {
    return undefined
  }
  const sourceText = payload.slice(0, separator).trim()
  const message = payload.slice(separator + 1).trimStart()
  const level = LOG_LEVELS[rawLevel as keyof typeof LOG_LEVELS]
  const sourceParts = sourceText.split('/').map(part => part.trim()).filter(Boolean)
  const domain = sourceParts[0]
  const tag = sourceParts.at(-1) ?? 'hilog'
  const processName = sourceParts.length >= 3
    ? sourceParts.at(-2)
    : undefined
  const timestamp = parseHilogTimestamp(monthDay, time, options.now ?? new Date())
  const pid = Number(pidText)
  const tid = Number(tidText)

  return {
    id: `hdc-${options.deviceId ?? 'device'}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp,
    level,
    type: 'log',
    source: 'harmony',
    deviceId: options.deviceId,
    tag,
    message,
    attributes: {
      transport: 'hdc',
      ...(domain
        ? { domain }
        : {}),
      ...(processName
        ? { process: processName }
        : {}),
      ...(Number.isFinite(pid)
        ? { pid }
        : {}),
      ...(Number.isFinite(tid)
        ? { tid }
        : {}),
    },
  }
}

function parseHilogTimestamp(monthDay: string, time: string, now: Date): string {
  const [monthText, dayText] = monthDay.split('-')
  const [hourText = '00', minuteText = '00', secondText = '0'] = time.split(':')
  const [secondWholeText = '0', fractionText = '0'] = secondText.split('.')
  const year = now.getFullYear()
  const timestamp = new Date(
    year,
    Number(monthText) - 1,
    Number(dayText),
    Number(hourText),
    Number(minuteText),
    Number(secondWholeText),
    Number(fractionText.slice(0, 3).padEnd(3, '0')),
  )

  if (timestamp.getTime() - now.getTime() > 24 * 60 * 60 * 1000) {
    timestamp.setFullYear(year - 1)
  }
  return timestamp.toISOString()
}

/** HDC adapter for HarmonyOS device discovery and HiLog streaming. */
export function createHdcAdapter(options: HdcAdapterOptions = {}): DebugClientAdapter {
  const hdcPath = options.hdcPath ?? 'hdc'

  return {
    id: 'hdc',
    capabilities: ['devices', 'hilog'],
    getSourceDescriptor: getHdcSourceDescriptor,

    async listDevices(listOptions = {}): Promise<DebugDevice[]> {
      const result = await execFileAsync(hdcPath, ['list', 'targets'], {
        encoding: 'utf8',
        windowsHide: true,
        signal: listOptions.signal,
      })
      return parseHdcDevices(result.stdout)
    },

    async startLogs({ deviceId, onRecord, signal, filters }): Promise<DebugClientSession> {
      const resolvedFilters = {
        ...HDC_DEFAULT_FILTERS,
        ...filters,
      }
      const child = spawn(hdcPath, [
        '-t',
        deviceId,
        'hilog',
        '-v',
        'long',
        ...buildHilogFilterArgs(resolvedFilters),
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
          const record = parseHilogLine(line, { deviceId })
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
        id: `hdc:${deviceId}:${Date.now()}`,
        device: {
          id: deviceId,
          platform: 'harmony',
          transport: 'hdc',
          state: 'online',
        },
        stop,
      }
    },
  }
}

function buildHilogFilterArgs(filters: DebugFilterValues): string[] {
  const args: string[] = []
  const logType = typeof filters.logType === 'string'
    ? filters.logType
    : undefined
  const levels = Array.isArray(filters.levels)
    ? filters.levels.filter((value): value is string => typeof value === 'string')
    : []
  const domain = typeof filters.domain === 'string'
    ? filters.domain.trim()
    : ''
  const tag = typeof filters.tag === 'string'
    ? filters.tag.trim()
    : ''
  const pid = typeof filters.pid === 'number' || typeof filters.pid === 'string'
    ? String(filters.pid).trim()
    : ''
  const regex = typeof filters.regex === 'string'
    ? filters.regex.trim()
    : ''

  if (logType) {
    args.push('-t', logType)
  }
  if (levels.length) {
    args.push('-L', levels.join('/'))
  }
  if (domain) {
    args.push('-D', domain)
  }
  if (tag) {
    args.push('-T', tag)
  }
  if (pid) {
    args.push('-P', pid)
  }
  if (regex) {
    args.push('-e', regex)
  }
  return args
}

export type { DebugClientAdapter, DebugClientSession, DebugDevice, DebugLogRecord } from '@flash-debug/types'
