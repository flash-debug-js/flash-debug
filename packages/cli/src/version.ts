import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const packagePath = resolve(dirname(fileURLToPath(import.meta.url)), '../package.json')
const packageJson = JSON.parse(readFileSync(packagePath, 'utf8')) as { version?: unknown }

if (typeof packageJson.version !== 'string' || !packageJson.version) {
  throw new TypeError(`Invalid package version in ${packagePath}`)
}

export const FLASH_DEBUG_CLI_VERSION = packageJson.version
