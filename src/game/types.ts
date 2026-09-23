import type { BlockType, GemTier } from '../config';

export type { BlockType, GemTier };

export type Content =
  | { kind: 'none' }
  | { kind: 'gem'; tier: GemTier }
  | { kind: 'stairs' };

export interface Cell {
  /** Open cells are walkable/visible; closed cells are blocks. */
  open: boolean;
  block: BlockType;
  hp: number;
  maxHp: number;
  /** Hidden until the block breaks. Once collected, becomes `none`. */
  content: Content;
}

export interface Floor {
  depth: number;
  seed: number;
  cols: number;
  rows: number;
  /** Row-major: index = row * cols + col. */
  cells: Cell[];
  entrance: number;
}

/** Stats that come from permanent upgrades (and later, perks). */
export interface RunModifiers {
  maxEnergy: number;
  power: number;
  /** Additive bonus to the per-block gem chance. */
  gemChanceBonus: number;
  /** Multiplier on gem values (1 = base). */
  gemValueMult: number;
}

export type RunStatus = 'playing' | 'outOfEnergy' | 'ended';
export type EndReason = 'left' | 'exhausted';

export interface RunState {
  seed: number;
  depth: number;
  floor: Floor;
  energy: number;
  mods: RunModifiers;
  /** Gems collected this run (before any end-of-run penalty). */
  gems: number;
  /** In-run randomness (perk procs etc.), kept separate from floor generation. */
  rngState: number;
  status: RunStatus;
  stats: { taps: number; blocksBroken: number };
}

export type RunEvent =
  | { type: 'hit'; idx: number; damage: number }
  | { type: 'break'; idx: number; block: BlockType }
  | { type: 'gem'; idx: number; tier: GemTier; value: number }
  | { type: 'stairsRevealed'; idx: number }
  | { type: 'descend'; depth: number }
  | { type: 'outOfEnergy' };

export interface RunSummary {
  seed: number;
  reason: EndReason;
  depth: number;
  gemsFound: number;
  gemsKept: number;
  blocksBroken: number;
}
