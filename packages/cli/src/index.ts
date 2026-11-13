import { cac } from 'cac'

export async function runCli(argv: string[] = process.argv): Promise<void> {
  const cli = cac('flash-debug')
  cli
    .command('[root]', 'Start the Flash Debug inspector')
    .action(() => {
      throw new Error('Flash-debug runtime is not implemented yet')
    })
  cli.help()
  cli.version('0.1.0')
  cli.parse(argv)
}
