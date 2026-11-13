import type { DebugContentFormat, DebugLogRecord } from '@flash-debug/types'

export function detectContentFormat(record: DebugLogRecord): DebugContentFormat {
  if (record.contentFormat) {
    return record.contentFormat
  }

  const content = record.content ?? record.message
  if (content.includes('\u001B') && /\[[0-9;]*m/.test(content)) {
    return 'ansi'
  }

  try {
    JSON.parse(content)
    return 'json'
  }
  catch {
    // Fall through to the lightweight YAML shape check.
  }

  if (/^(?:---\s*$|[\w.-]+\s*:\s*(?:\S.*|[\t\v\f \xA0\u1680\u2000-\u200A\u202F\u205F\u3000\uFEFF])$|-\s+(?:\S.*|[\t\v\f \xA0\u1680\u2000-\u200A\u202F\u205F\u3000\uFEFF])$)/m.test(content)) {
    return 'yaml'
  }

  return 'text'
}

export function contentFor(record: DebugLogRecord): string {
  return record.content ?? record.message
}

export function languageFor(format: DebugContentFormat): string {
  return format === 'ansi'
    ? 'text'
    : format
}

export function formattedContent(record: DebugLogRecord): string {
  const content = contentFor(record)
  const format = detectContentFormat(record)
  if (format !== 'json' && format !== 'jsonc') {
    return content
  }

  try {
    return JSON.stringify(JSON.parse(content), null, 2)
  }
  catch {
    return content
  }
}
