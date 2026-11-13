export interface DebugServerOptions {
  host?: string
  port?: number
}

export interface DebugServer {
  localUrl: string
  close: () => Promise<void>
}

/** Nitro server lifecycle will be implemented here; the package owns API/UI hosting. */
export async function startDebugServer(_options: DebugServerOptions = {}): Promise<DebugServer> {
  throw new Error('Nitro debug server is not implemented yet')
}
