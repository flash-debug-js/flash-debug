import { describe, expect, it } from 'vitest'
import { getAdbSourceDescriptor, parseAdbDevices, parseLogcatLine } from '../src'

describe('adb protocol parsing', () => {
  it('parses online devices', () => {
    expect(parseAdbDevices('List of devices attached\nabc123\tdevice product:foo model:Pixel_8\n')).toEqual([
      expect.objectContaining({ id: 'abc123', state: 'online', name: 'Pixel 8' }),
    ])
  })

  it('parses threadtime logcat lines', () => {
    expect(parseLogcatLine('01-02 03:04:05.678  123  456 E DemoTag: failed', 'abc123')).toEqual(expect.objectContaining({
      source: 'adb',
      level: 'error',
      tag: 'DemoTag',
      message: 'failed',
      deviceId: 'abc123',
    }))
  })

  it('exposes source-owned capture filters', () => {
    const descriptor = getAdbSourceDescriptor()
    expect(descriptor.source).toBe('adb')
    expect(descriptor.filters.map(filter => filter.id)).toEqual(['filterSpecs', 'pid'])
  })
})
