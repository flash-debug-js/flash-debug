import type { DebugSessionSnapshot } from '@flash-debug/types'
import { defineHandler } from 'nitro'
import { requestControl } from '../../../control'

const disconnectedSession: DebugSessionSnapshot = {
  connected: false,
  filters: {},
}

export default defineHandler(async () => {
  try {
    return await requestControl('get-session')
  }
  catch (error) {
    if (error instanceof Error && error.message === 'Flash Debug control channel is unavailable') {
      return disconnectedSession
    }
    throw error
  }
})
