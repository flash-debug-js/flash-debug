#!/usr/bin/env node
import { runCli } from '@flash-debug/cli'

runCli().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
