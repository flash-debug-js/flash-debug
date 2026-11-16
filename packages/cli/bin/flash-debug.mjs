#!/usr/bin/env node
'use strict'

import process from 'node:process'
import { runCli } from '../dist/index.mjs'

try {
  await runCli(process.argv)
}
catch (error) {
  process.stderr.write(`${error instanceof Error
    ? error.message
    : String(error)}\n`)
  process.exitCode = 1
}
