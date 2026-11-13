export interface DebugRuntimeOptions {
  cwd?: string
}

/** Top-level lifecycle orchestration will connect Nitro, clients, and Tunnel. */
export async function startDebugRuntime(_options: DebugRuntimeOptions = {}): Promise<never> {
  throw new Error('Flash-debug runtime is not implemented yet')
}
