import { isMinable, toColRow } from '../game/grid';
import { Rng } from '../game/rng';
import type { Cell, Floor, RunEvent } from '../game/types';
import { BACKDROP_COLOR, BLOCK_COLORS, GEM_COLORS, TUNNEL_COLOR } from './theme';

interface FloatText {
  x: number;
  y: number;
  text: string;
  color: string;
  start: number;
  duration: number;
}

const HIT_SHAKE_MS = 120;
const GAP = 3;

/** Draws a floor onto a canvas and maps pointer positions back to cells. */
export class GridRenderer {
  private ctx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private cellSize = 0;
  private originX = 0;
  private originY = 0;
  private hitTimes = new Map<number, number>();
  private floats: FloatText[] = [];

  constructor(
    private canvas: HTMLCanvasElement,
    container: HTMLElement,
  ) {
    this.ctx = canvas.getContext('2d')!;
    new ResizeObserver(() => this.resize(container)).observe(container);
    this.resize(container);
  }

  private resize(container: HTMLElement) {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.width = container.clientWidth;
    this.height = container.clientHeight;
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private layout(floor: Floor) {
    this.cellSize = Math.floor(Math.min(this.width / floor.cols, this.height / floor.rows));
    this.originX = Math.floor((this.width - this.cellSize * floor.cols) / 2);
    this.originY = Math.floor((this.height - this.cellSize * floor.rows) / 2);
  }

  /** Cell index under a client-space point, or undefined when outside the grid. */
  cellAt(floor: Floor, clientX: number, clientY: number): number | undefined {
    this.layout(floor);
    const rect = this.canvas.getBoundingClientRect();
    const col = Math.floor((clientX - rect.left - this.originX) / this.cellSize);
    const row = Math.floor((clientY - rect.top - this.originY) / this.cellSize);
    if (col < 0 || row < 0 || col >= floor.cols || row >= floor.rows) return undefined;
    return row * floor.cols + col;
  }

  /** Center of a cell in canvas CSS pixels. */
  cellCenter(floor: Floor, idx: number): { x: number; y: number } {
    this.layout(floor);
    const { col, row } = toColRow(floor, idx);
    return {
      x: this.originX + (col + 0.5) * this.cellSize,
      y: this.originY + (row + 0.5) * this.cellSize,
    };
  }

  handleEvents(floor: Floor, events: RunEvent[], now: number) {
    for (const e of events) {
      if (e.type === 'hit') this.hitTimes.set(e.idx, now);
      if (e.type === 'gem') {
        const { x, y } = this.cellCenter(floor, e.idx);
        this.floats.push({ x, y, text: `+${e.value}`, color: GEM_COLORS[e.tier], start: now, duration: 700 });
      }
      if (e.type === 'descend') {
        this.hitTimes.clear();
        this.floats = [];
      }
    }
  }

  draw(floor: Floor, now: number) {
    const ctx = this.ctx;
    this.layout(floor);
    ctx.clearRect(0, 0, this.width, this.height);

    const s = this.cellSize;
    ctx.fillStyle = BACKDROP_COLOR;
    roundRect(ctx, this.originX - 4, this.originY - 4, s * floor.cols + 8, s * floor.rows + 8, 12);
    ctx.fill();

    floor.cells.forEach((cell, idx) => {
      const { col, row } = toColRow(floor, idx);
      let x = this.originX + col * s;
      const y = this.originY + row * s;
      const hitAt = this.hitTimes.get(idx);
      if (hitAt !== undefined) {
        const t = (now - hitAt) / HIT_SHAKE_MS;
        if (t < 1) x += Math.sin(t * Math.PI * 4) * 3 * (1 - t);
        else this.hitTimes.delete(idx);
      }
      if (cell.open) this.drawOpen(floor, cell, idx, x, y, s, now);
      else this.drawBlock(floor, cell, idx, x, y, s);
    });

    this.drawFloats(now);
  }

  private drawOpen(floor: Floor, cell: Cell, idx: number, x: number, y: number, s: number, now: number) {
    const ctx = this.ctx;
    ctx.fillStyle = TUNNEL_COLOR;
    ctx.fillRect(x, y, s, s);

    if (idx === floor.entrance) {
      const g = ctx.createLinearGradient(x, y, x, y + s);
      g.addColorStop(0, 'rgba(255,214,150,0.35)');
      g.addColorStop(1, 'rgba(255,214,150,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, s, s);
    }

    if (cell.content.kind === 'stairs') {
      const pulse = 0.5 + 0.5 * Math.sin(now / 250);
      const glow = ctx.createRadialGradient(x + s / 2, y + s / 2, 2, x + s / 2, y + s / 2, s * 0.7);
      glow.addColorStop(0, `rgba(255,190,90,${0.35 + pulse * 0.25})`);
      glow.addColorStop(1, 'rgba(255,190,90,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(x, y, s, s);
      // Steps going down to the right.
      ctx.fillStyle = '#3a2a1e';
      const steps = 4;
      const stepW = (s * 0.6) / steps;
      const stepH = (s * 0.6) / steps;
      for (let i = 0; i < steps; i++) {
        ctx.fillRect(x + s * 0.2 + i * stepW, y + s * 0.2 + i * stepH, s * 0.6 - i * stepW, stepH);
      }
      ctx.fillStyle = '#ffcf7a';
      ctx.font = `700 ${Math.round(s * 0.34)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('▼', x + s / 2, y + s * 0.78);
    }
  }

  private drawBlock(floor: Floor, cell: Cell, idx: number, x: number, y: number, s: number) {
    const ctx = this.ctx;
    const colors = BLOCK_COLORS[cell.block];
    const bx = x + GAP / 2;
    const by = y + GAP / 2;
    const bs = s - GAP;

    const g = ctx.createLinearGradient(bx, by, bx, by + bs);
    g.addColorStop(0, colors.top);
    g.addColorStop(1, colors.bottom);
    ctx.fillStyle = g;
    roundRect(ctx, bx, by, bs, bs, 6);
    ctx.fill();

    // Deterministic texture specks per cell.
    const rng = new Rng(floor.seed ^ (idx * 2654435761));
    ctx.fillStyle = colors.speck;
    for (let i = 0; i < 5; i++) {
      const r = 1 + rng.next() * bs * 0.05;
      ctx.beginPath();
      ctx.arc(bx + 6 + rng.next() * (bs - 12), by + 6 + rng.next() * (bs - 12), r, 0, Math.PI * 2);
      ctx.fill();
    }
    if (cell.block === 'obsidian') {
      ctx.strokeStyle = 'rgba(210,170,255,0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(bx + bs * 0.2, by + bs * 0.35);
      ctx.lineTo(bx + bs * 0.45, by + bs * 0.15);
      ctx.stroke();
    }

    // Top highlight.
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    roundRect(ctx, bx + 3, by + 2, bs - 6, 3, 2);
    ctx.fill();

    this.drawCracks(cell, idx, floor.seed, bx, by, bs);

    if (isMinable(floor, idx)) {
      ctx.strokeStyle = 'rgba(255,230,190,0.45)';
      ctx.lineWidth = 1.5;
      roundRect(ctx, bx + 0.75, by + 0.75, bs - 1.5, bs - 1.5, 6);
      ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.42)';
      roundRect(ctx, bx, by, bs, bs, 6);
      ctx.fill();
    }
  }

  /** Three crack stages depending on how much HP is gone. */
  private drawCracks(cell: Cell, idx: number, seed: number, bx: number, by: number, bs: number) {
    if (cell.hp >= cell.maxHp) return;
    const stage = Math.min(3, Math.ceil((1 - cell.hp / cell.maxHp) * 3));
    const ctx = this.ctx;
    const rng = new Rng(seed ^ (idx * 40503) ^ 0xc4ac);
    ctx.strokeStyle = 'rgba(15,8,4,0.8)';
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    const cracks = [1, 3, 5][stage - 1];
    const cx = bx + bs / 2;
    const cy = by + bs / 2;
    for (let c = 0; c < cracks; c++) {
      const angle = (c / cracks) * Math.PI * 2 + rng.next();
      let px = cx + (rng.next() - 0.5) * bs * 0.15;
      let py = cy + (rng.next() - 0.5) * bs * 0.15;
      ctx.beginPath();
      ctx.moveTo(px, py);
      const segs = 2 + stage;
      for (let i = 0; i < segs; i++) {
        const a = angle + (rng.next() - 0.5) * 1.2;
        const len = (bs * 0.42) / segs;
        px += Math.cos(a) * len;
        py += Math.sin(a) * len;
        ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  }

  private drawFloats(now: number) {
    const ctx = this.ctx;
    this.floats = this.floats.filter((f) => now - f.start < f.duration);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '800 20px system-ui, sans-serif';
    for (const f of this.floats) {
      const t = (now - f.start) / f.duration;
      ctx.globalAlpha = 1 - t * t;
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.strokeText(f.text, f.x, f.y - t * 36);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y - t * 36);
    }
    ctx.globalAlpha = 1;
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
