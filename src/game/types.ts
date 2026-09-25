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
  | 'goldFever';

export type HazardKind = 'gas' | 'caveIn' | 'hole';

export type Content =
  | { kind: 'none' }
  | { kind: 'gem'; tier: GemTier }
  | { kind: 'crystal' }
  | { kind: 'chest' }
  | { kind: 'gas' }
  | { kind: 'caveIn' }
  /** Stays in the open cell after the break (like stairs) and takes gems on each tap. */
  | { kind: 'hole' }
  | { kind: 'stairs' }
  /** The goal: only on `CONFIG.goal.depth`, in place of the stairs. Picking it up wins the game. */
  | { kind: 'legendary' };

export type ContentKind = Content['kind'];

export interface Cell {
  /** Open cells are walkable/visible; closed cells are blocks. */
  open: boolean;
  block: BlockType;
  hp: number;
  maxHp: number;
  /**
   * Hidden until the block breaks. Hazards go off on break; items (gem, crystal, chest) then lie in the open
   * cell until tapped (`collect`). Once collected/triggered, becomes `none`.
   */
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
  /** Every block has been broken (counted once for the clean floor bonus). */
  cleared?: boolean;
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

export type RunStatus = 'playing' | 'choosingPerk' | 'outOfEnergy' | 'won' | 'ended';
export type EndReason = 'left' | 'exhausted' | 'won';
export type PerkOfferSource = 'floor' | 'chest';

/** An active Rush, and what it has earned so far (for the end-of-Rush float). */
export interface RushState {
  msLeft: number;
  blocks: number;
  gems: number;
  /** A floor or chest perk offer came due during the Rush; it's made when the Rush ends (at most one). */
  perkOfferPending?: PerkOfferSource;
  /** Energy from floors cleared during the Rush; granted when it ends. */
  energyPending?: number;
}

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
  /** Floors cleaned this run, and the sum of their bonuses (uncapped; see `cleanMultiplier`). */
  cleanFloors: number;
  cleanBonus: number;
  /** Rush meter, 0..1. Filled by pickaxe breaks, drained over time by `tickRun`. */
  momentum: number;
  /** Present while a Rush is active. */
  rush?: RushState;
  /** In-run randomness (perk procs, cave-ins, perk offers), separate from floor generation. */
  rngState: number;
  status: RunStatus;
  /** `gemsByTier` counts gems picked up (a Lucky Strike double counts as two). */
  /** `rushes` counts Rushes started (later ones fill slower, see `CONFIG.rush.fillDecay`). */
  stats: { taps: number; blocksBroken: number; rushes: number; gemsByTier: Partial<Record<GemTier, number>> };
}

export type RunEvent =
  | { type: 'hit'; idx: number; damage: number }
  | { type: 'freeSwing'; idx: number }
  /** `combo` is the block's number within the current Rush (only during a Rush). */
  | { type: 'break'; idx: number; block: BlockType; combo?: number }
  /** A break revealed an item; it lies in the open cell until tapped. */
  | { type: 'itemRevealed'; idx: number; content: Content }
  | { type: 'gem'; idx: number; tier: GemTier; value: number; doubled: boolean; energy: number }
  | { type: 'crystal'; idx: number; energy: number }
  | { type: 'chest'; idx: number; gems: number }
  | { type: 'gas'; idx: number; energyLost: number; /** Share of the loss the Gas Mask stacks blocked (0..1). */ protection: number }
  | { type: 'caveIn'; idx: number; filled: number[] }
  /** A hole took gems: on the break, or on a tap of the hole left in the open cell. */
  | { type: 'hole'; idx: number; gemsLost: number }
  | { type: 'stairsRevealed'; idx: number }
  /** The Legendary Diamond was picked up: the game is won (status 'won'). */
  | { type: 'legendary'; idx: number }
  | { type: 'tool'; tool: ToolId; idx: number; cells: number[] }
  | { type: 'descend'; depth: number; energyRestored: number }
  /** `idx`: the chest cell, for a chest offer. */
  | { type: 'perkOffer'; source: PerkOfferSource; choices: PerkId[]; idx?: number }
  /** A chest rolled a perk offer during a Rush; it's made when the Rush ends. */
  | { type: 'perkOfferHeld'; idx: number }
  | { type: 'perkChosen'; perk: PerkId }
  | { type: 'outOfEnergy' }
  /** A pickaxe break added momentum; `level` is the meter after it (0..1). */
  | { type: 'momentum'; idx: number; level: number }
  | { type: 'rushStart'; idx: number }
  /** `energy`: refunds from floors cleared during the Rush, granted now. */
  | { type: 'rushEnd'; blocks: number; gems: number; energy: number }
  /**
   * The floor's last block broke. `bonus` is what it added; `multiplier` is the run's new (capped) one.
   * `energy` is the refund granted now; `energyPending` is held until the current Rush ends.
   */
  | { type: 'floorCleared'; depth: number; bonus: number; multiplier: number; energy: number; energyPending: number }

export interface RunSummary {
  seed: number;
  /** The gems kept were multiplied by the summary's rewarded ad. */
  gemsDoubled?: boolean;
  reason: EndReason;
  depth: number;
  gemsFound: number;
  gemsKept: number;
  /** Clean floor bonus: floors cleaned, the multiplier, and the gems it added to `gemsKept`. */
  cleanFloors: number;
  multiplier: number;
  bonusGems: number;
  blocksBroken: number;
  gemsByTier: Partial<Record<GemTier, number>>;
}
