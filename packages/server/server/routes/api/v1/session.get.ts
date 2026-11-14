import { defineHandler } from 'nitro'
import { requestControl } from '../../../control'

export default defineHandler(() => requestControl('get-session'))
