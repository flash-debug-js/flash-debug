#!/usr/bin/env node
import process from 'node:process'
import { runCli } from '@flash-debug/cli'

runCli().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error
    ? error.message
    : String(error)}\n`)
  process.exitCode = 1
})
