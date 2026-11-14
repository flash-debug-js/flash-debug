import { describe, expect, it } from 'vitest'
import { getHdcSourceDescriptor, parseHdcDevices, parseHilogLine } from '../src'

describe('hDC protocol parsing', () => {
  it('parses connected targets', () => {
    expect(parseHdcDevices('List of devices attached\nabc123\n')).toEqual([
      expect.objectContaining({
        id: 'abc123',
        platform: 'harmony',
        transport: 'hdc',
        state: 'online',
      }),
    ])
  })

  it('parses standard HiLog lines', () => {
    const record = parseHilogLine(
      '04-19 17:02:14.735  5394  5394 I A03200/test_server/testTag: this is a info level hilog',
      {
        deviceId: 'abc123',
        now: new Date('2026-04-19T18:00:00+08:00'),
      },
    )

    expect(record).toEqual(expect.objectContaining({
      source: 'harmony',
      level: 'info',
      tag: 'testTag',
      message: 'this is a info level hilog',
      deviceId: 'abc123',
      attributes: {
        transport: 'hdc',
        domain: 'A03200',
        process: 'test_server',
        pid: 5394,
        tid: 5394,
      },
    }))
  })

  it('accepts compact pid and tid separators', () => {
    expect(parseHilogLine(
      '04-19 17:02:14.735  5394-5394 E A03200/testTag: failed',
      { deviceId: 'abc123' },
    )).toEqual(expect.objectContaining({
      level: 'error',
      tag: 'testTag',
      message: 'failed',
    }))
  })

  it('ignores non-log output', () => {
    expect(parseHilogLine('[Info] hdc server connected')).toBeUndefined()
  })

  it('exposes source-owned capture filters', () => {
    const descriptor = getHdcSourceDescriptor()
    expect(descriptor.source).toBe('harmony')
    expect(descriptor.filters.map(filter => filter.id)).toEqual([
      'logType',
      'levels',
      'domain',
      'tag',
      'pid',
      'regex',
    ])
  })
})
