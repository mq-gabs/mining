import type { BlockType, GemTier, ToolId } from '../config';

export type { BlockType, GemTier, ToolId };

export type PerkId =
  | 'sharpEdge'
  | 'secondWind'
  | 'luckyStrike'
  | 'tremor'
  | 'gasMask'
  | 'prospector'
  | 'efficientSwing'
  | 'treasureSense'
  | 'deepBreath'
  | 'greed';

export type HazardKind = 'gas' | 'caveIn';

export type Content =
  | { kind: 'none' }
  | { kind: 'gem'; tier: GemTier }
  | { kind: 'crystal' }
  | { kind: 'chest' }
  | { kind: 'gas' }
  | { kind: 'caveIn' }
  | { kind: 'stairs' };

export type ContentKind = Content['kind'];

export interface Cell {
  /** Open cells are walkable/visible; closed cells are blocks. */
  open: boolean;
  block: BlockType;
  hp: number;
  maxHp: number;
  /** Hidden until the block breaks. Once collected/triggered, becomes `none`. */
  content: Content;
  /** The Scanner revealed this block's content without breaking it. */
  scanned?: boolean;
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

/** Stats that come from permanent upgrades and in-run perks. */
export interface RunModifiers {
  maxEnergy: number;
  power: number;
  /** Additive bonus to the per-block gem chance. */
  gemChanceBonus: number;
  /** Multiplier on gem values (1 = base). */
  gemValueMult: number;
  /** Charges each tool starts the run with (0 = locked). */
  toolCharges: Record<ToolId, number>;
}

export type RunStatus = 'playing' | 'choosingPerk' | 'outOfEnergy' | 'ended';
export type EndReason = 'left' | 'exhausted';
export type PerkOfferSource = 'floor' | 'chest';

export interface RunState {
  seed: number;
  depth: number;
  floor: Floor;
  energy: number;
  mods: RunModifiers;
  /** Gems collected this run (before any end-of-run penalty). */
  gems: number;
  /** Tool charges left this run. */
  tools: Record<ToolId, number>;
  /** Stack count per perk taken this run. */
  perks: Partial<Record<PerkId, number>>;
  /** Present while status is 'choosingPerk'. */
  perkOffer?: { source: PerkOfferSource; choices: PerkId[] };
  /** The out-of-energy rewarded ad was already used this run (it's once per run). */
  energyAdUsed: boolean;
  /** In-run randomness (perk procs, cave-ins, perk offers), separate from floor generation. */
  rngState: number;
  status: RunStatus;
  /** `gemsByTier` counts gems picked up (a Lucky Strike double counts as two). */
  stats: { taps: number; blocksBroken: number; gemsByTier: Partial<Record<GemTier, number>> };
}

export type RunEvent =
  | { type: 'hit'; idx: number; damage: number }
  | { type: 'freeSwing'; idx: number }
  | { type: 'break'; idx: number; block: BlockType }
  | { type: 'gem'; idx: number; tier: GemTier; value: number; doubled: boolean }
  | { type: 'crystal'; idx: number; energy: number }
  | { type: 'chest'; idx: number; gems: number }
  | { type: 'gas'; idx: number; energyLost: number; masked: boolean }
  | { type: 'caveIn'; idx: number; filled: number[] }
  | { type: 'stairsRevealed'; idx: number }
  | { type: 'tool'; tool: ToolId; idx: number; cells: number[] }
  | { type: 'descend'; depth: number; energyRestored: number }
  | { type: 'perkOffer'; source: PerkOfferSource; choices: PerkId[] }
  | { type: 'perkChosen'; perk: PerkId }
  | { type: 'outOfEnergy' };

export interface RunSummary {
  seed: number;
  /** The gems kept were multiplied by the summary's rewarded ad. */
  gemsDoubled?: boolean;
  reason: EndReason;
  depth: number;
  gemsFound: number;
  gemsKept: number;
  blocksBroken: number;
  gemsByTier: Partial<Record<GemTier, number>>;
}
