import { defineHandler } from 'nitro'
import { silkwormRuntime } from '../../../state'

export default defineHandler(() => silkwormRuntime.snapshot())
