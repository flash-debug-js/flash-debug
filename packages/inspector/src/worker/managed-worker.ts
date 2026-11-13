import * as Comlink from 'comlink'

export interface ManagedWorkerApi {
  ready: () => void
}

export interface ManagedWorker<T extends ManagedWorkerApi> {
  start: () => Promise<Comlink.Remote<T>>
  terminate: () => void
}

export function createManagedWorker<T extends ManagedWorkerApi>(createWorker: () => Worker): ManagedWorker<T> {
  let worker: Worker | undefined
  let proxy: Comlink.Remote<T> | undefined
  let startPromise: Promise<Comlink.Remote<T>> | undefined
  let generation = 0

  async function start(): Promise<Comlink.Remote<T>> {
    if (proxy) {
      return proxy
    }
    if (startPromise) {
      return startPromise
    }

    const currentWorker = createWorker()
    const currentGeneration = ++generation
    const currentProxy = Comlink.wrap<T>(currentWorker)
    worker = currentWorker

    const handleFailure = () => {
      if (worker === currentWorker && currentGeneration === generation) {
        proxy = undefined
        startPromise = undefined
      }
    }
    currentWorker.addEventListener('error', handleFailure)
    currentWorker.addEventListener('messageerror', handleFailure)

    startPromise = currentProxy.ready()
      .then(() => {
        if (currentGeneration !== generation) {
          throw new Error('Worker was terminated during startup')
        }
        proxy = currentProxy
        return currentProxy
      })
      .catch((error: unknown) => {
        if (worker === currentWorker) {
          worker = undefined
          proxy = undefined
          startPromise = undefined
        }
        currentProxy[Comlink.releaseProxy]()
        currentWorker.terminate()
        throw error
      })

    return startPromise
  }

  function terminate(): void {
    generation += 1
    const currentProxy = proxy
    const currentWorker = worker
    proxy = undefined
    worker = undefined
    startPromise = undefined
    currentProxy?.[Comlink.releaseProxy]()
    currentWorker?.terminate()
  }

  return { start, terminate }
}
