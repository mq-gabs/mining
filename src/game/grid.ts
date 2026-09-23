import type { Floor } from './types';

export function toIndex(floor: Pick<Floor, 'cols'>, col: number, row: number): number {
  return row * floor.cols + col;
}

export function toColRow(floor: Pick<Floor, 'cols'>, idx: number): { col: number; row: number } {
  return { col: idx % floor.cols, row: Math.floor(idx / floor.cols) };
}

/** Orthogonal neighbours (up, down, left, right) that are inside the grid. */
export function neighbors4(floor: Pick<Floor, 'cols' | 'rows'>, idx: number): number[] {
  const { col, row } = toColRow(floor, idx);
  const out: number[] = [];
  if (row > 0) out.push(idx - floor.cols);
  if (row < floor.rows - 1) out.push(idx + floor.cols);
  if (col > 0) out.push(idx - 1);
  if (col < floor.cols - 1) out.push(idx + 1);
  return out;
}

/** A closed block can be mined only if it touches an open cell orthogonally. */
export function isMinable(floor: Floor, idx: number): boolean {
  const cell = floor.cells[idx];
  if (!cell || cell.open) return false;
  return neighbors4(floor, idx).some((n) => floor.cells[n].open);
}

/** All 8 surrounding cells (orthogonal + diagonal) that are inside the grid. */
export function neighbors8(floor: Pick<Floor, 'cols' | 'rows'>, idx: number): number[] {
  const { col, row } = toColRow(floor, idx);
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const c = col + dc;
      const r = row + dr;
      if (c >= 0 && r >= 0 && c < floor.cols && r < floor.rows) out.push(r * floor.cols + c);
    }
  }
  return out;
}
