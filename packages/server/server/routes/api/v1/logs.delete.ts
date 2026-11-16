import { defineHandler } from 'nitro'
import { logStore } from '../../../store'

export default defineHandler(() => ({
  ok: true,
  ...logStore.clear(),
}))
