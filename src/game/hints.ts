import { GEM_TIERS, type GemTier } from '../config';
import { isMinable, neighbors4 } from './grid';
import type { Floor } from './types';

export interface CellHint {
  /** Highest gem tier among orthogonal neighbours, if any hold a gem (sparkle). */
  gemNear?: GemTier;
  /** A neighbour holds a gas pocket, cave-in or hole (dust). */
  hazardNear: boolean;
  /** This block itself is a chest (only shown with Treasure Sense). */
  chest: boolean;
}

/**
 * Hints for every exposed block (closed and next to an open cell). Unexposed and
 * open cells get `undefined`. Neighbours are orthogonal, matching mining adjacency.
 */
export function computeHints(floor: Floor): (CellHint | undefined)[] {
  return floor.cells.map((cell, idx) => {
    if (!isMinable(floor, idx)) return undefined;
    let gemNear: GemTier | undefined;
    let hazardNear = false;
    for (const n of neighbors4(floor, idx)) {
      const c = floor.cells[n];
      if (c.open) continue;
      if (c.content.kind === 'gem' && (!gemNear || tierRank(c.content.tier) > tierRank(gemNear))) {
        gemNear = c.content.tier;
      }
      if (c.content.kind === 'gas' || c.content.kind === 'caveIn' || c.content.kind === 'hole') hazardNear = true;
    }
    return { gemNear, hazardNear, chest: cell.content.kind === 'chest' };
  });
}

function tierRank(tier: GemTier): number {
  return GEM_TIERS.indexOf(tier);
}
