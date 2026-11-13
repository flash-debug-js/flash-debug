import type { DebugClientAdapter, DebugClientSession, DebugDevice, DebugLogRecord } from '@flash-debug/types'

export interface AdbAdapterOptions {
  adbPath?: string
}

const LOG_LEVELS = {
  V: 'debug',
  D: 'debug',
  I: 'info',
  W: 'warning',
  E: 'error',
  F: 'error'
} as const

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
          .filter(([key, value]) => Boolean(key && value)) as Array<[string, string]>
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
        metadata
      }
    })
    .filter(device => device.id.length > 0)
}

/** Parse the common `adb logcat -v threadtime` shape into the shared protocol. */
export function parseLogcatLine(line: string, deviceId?: string): DebugLogRecord | undefined {
  const match = /^(\d\d-\d\d\s+\d\d:\d\d:\d\d\.\d+)\s+\d+\s+\d+\s+([VDIWEF])\s+([^:]+):\s?(.*)$/.exec(line.trim())
  if (!match) {
    return undefined
  }

  const [, rawTimestamp, rawLevel, rawTag, message = ''] = match
  if (!rawTimestamp || !rawLevel || !rawTag) {
    return undefined
  }

  const level = LOG_LEVELS[rawLevel as keyof typeof LOG_LEVELS] ?? 'info'
  const year = new Date().getFullYear()
  const timestamp = new Date(`${year}-${rawTimestamp.replace(' ', 'T')}`).toISOString()
  return {
    id: `${deviceId ?? 'adb'}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp,
    level,
    source: 'adb',
    deviceId,
    tag: rawTag.trim(),
    message
  }
}

/**
 * ADB adapter contract. Process management is intentionally kept behind this
 * package so the generic client package never knows about adb or logcat.
 */
export function createAdbAdapter(_options: AdbAdapterOptions = {}): DebugClientAdapter {
  throw new Error('ADB process integration is not implemented yet')
}

export type { DebugClientAdapter, DebugClientSession, DebugDevice, DebugLogRecord } from '@flash-debug/types'
