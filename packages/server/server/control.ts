import type { DebugFilterValues, DebugSessionSnapshot } from '@flash-debug/types'
import process from 'node:process'

export async function requestControl(
  action: 'get-session' | 'update-filters',
  filters?: DebugFilterValues,
): Promise<DebugSessionSnapshot> {
  const controlUrl = process.env.FLASH_DEBUG_CONTROL_URL
  if (!controlUrl) {
    throw new Error('Flash Debug control channel is unavailable')
  }

  const response = await fetch(`${controlUrl}/control`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      action,
      ...(filters
        ? { filters }
        : {}),
    }),
  })
  if (!response.ok) {
    throw new Error(`Flash Debug control request failed with HTTP ${response.status}`)
  }
  return await response.json() as DebugSessionSnapshot
}
