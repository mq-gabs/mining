// Seeded RNG (mulberry32). The whole state is one 32-bit int, so it can be stored
// in plain game state and serialized.

export class Rng {
  constructor(public state: number) {
    this.state = state | 0;
  }

  /** Float in [0, 1). */
  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [0, n). */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(items.length)];
  }

  /** Picks a key from a { key: weight } record. Returns undefined if all weights are 0. */
  weighted<K extends string>(weights: Partial<Record<K, number>>): K | undefined {
    const entries = Object.entries(weights) as [K, number][];
    const total = entries.reduce((sum, [, w]) => sum + Math.max(0, w), 0);
    if (total <= 0) return undefined;
    let roll = this.next() * total;
    for (const [key, w] of entries) {
      if (w <= 0) continue;
      roll -= w;
      if (roll < 0) return key;
    }
    return entries.filter(([, w]) => w > 0).at(-1)?.[0];
  }
}

/** Mixes several integers into one 32-bit seed (for per-floor seeds derived from a run seed). */
export function hashSeed(...parts: number[]): number {
  let h = 0x811c9dc5;
  for (const p of parts) {
    h = Math.imul(h ^ (p | 0), 0x01000193);
    h ^= h >>> 13;
    h = Math.imul(h, 0x5bd1e995);
    h ^= h >>> 15;
  }
  return h >>> 0;
}

export function randomSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0;
}
