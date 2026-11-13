export class SeededRandom {
  private state: number

  constructor(seed: string) {
    let hash = 2166136261
    for (const character of seed || 'silkworm') {
      hash ^= character.charCodeAt(0)
      hash = Math.imul(hash, 16777619)
    }
    this.state = hash >>> 0
  }

  next(): number {
    this.state = (Math.imul(1664525, this.state) + 1013904223) >>> 0
    return this.state / 4294967296
  }

  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(0, items.length - 1)] as T
  }

  bool(probability = 0.5): boolean {
    return this.next() < probability
  }
}
