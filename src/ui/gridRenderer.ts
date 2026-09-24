import type { CellHint } from '../game/hints';
import { toColRow } from '../game/grid';
import { Rng } from '../game/rng';
import { GEM_TIERS, type GemTier } from '../config';
import type { Cell, Floor, RunEvent } from '../game/types';
import {
  BACKDROP_COLOR,
  BLAST_COLOR,
  BLOCK_COLORS,
  CRYSTAL_COLOR,
  DAMAGE_COLOR,
  DUST_COLOR,
  GAS_COLOR,
  GEM_COLORS,
  GEM_SHAPES,
  RUSH_BLOCK_COLORS,
  RUSH_COLOR,
  SCAN_COLOR,
  SPARKLE_COLOR,
  TREASURE_COLOR,
  TUNNEL_COLOR,
} from './theme';

/** What the renderer needs beyond the floor itself. */
export interface DrawView {
  hints: (CellHint | undefined)[];
  /** Prospector: sparkles take the neighbouring gem's tier color. */
  tierColors: boolean;
  /** Treasure Sense: exposed chests glow. */
  showChests: boolean;
  /** A Rush is active: blocks turn gold. */
  rush: boolean;
}

interface FloatText {
  x: number;
  y: number;
  text: string;
  color: string;
  start: number;
  duration: number;
  size: number;
  /** Gem icon drawn before the text. */
  gem?: GemTier;
}

interface Puff {
  x: number;
  y: number;
  color: string;
  start: number;
  duration: number;
  radius: number;
}

/** A particle's position is computed from its start state and age (no per-frame integration). */
interface Particle {
  x: number;
  y: number;
  /** px per second */
  vx: number;
  vy: number;
  /** px per second² */
  gravity: number;
  size: number;
  color: string;
  start: number;
  duration: number;
  star: boolean;
}

/** A broken block's ghost that swells and fades. */
interface Pop {
  x: number;
  y: number;
  color: string;
  start: number;
}

interface Ring {
  x: number;
  y: number;
  color: string;
  start: number;
  duration: number;
  radius: number;
}

const HIT_SHAKE_MS = 120;
const SCREEN_SHAKE_MS = 280;
const POP_MS = 180;
const FLOOR_SLIDE_MS = 260;
const GAP = 3;
const MAX_PARTICLES = 400;
/** Blocks fade between their normal and gold colours over this long. */
const RUSH_FADE_MS = 250;
const RUSH_FLASH_MS = 220;
const RUSH_RESULT_MS = 1600;

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
  private puffs: Puff[] = [];
  private particles: Particle[] = [];
  private pops: Pop[] = [];
  private rings: Ring[] = [];
  private screenShakeAt = -Infinity;
  private screenShakeSize = 6;
  /** The previous floor slides up and out while the new one slides in (floor transition). */
  private slide?: { from: Floor; view: DrawView; start: number };
  private lastDrawn?: { floor: Floor; view: DrawView };
  /** Honour the OS "reduce motion" setting: no screen shake or floor slide. */
  private reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  /** Rush palette state as last drawn, and when it last flipped (for the colour fade). */
  private rushOn = false;
  private rushFlipAt = -Infinity;
  private rushFlashAt = -Infinity;

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

  /** Center of a cell in client (viewport) pixels, e.g. to start a DOM effect there. */
  cellClientCenter(floor: Floor, idx: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const { x, y } = this.cellCenter(floor, idx);
    return { x: rect.left + x, y: rect.top + y };
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

  /** The floor transition is playing (the game pauses the Rush clock meanwhile). */
  isSliding(now: number): boolean {
    return !!this.slide && now - this.slide.start < FLOOR_SLIDE_MS;
  }

  private float(floor: Floor, idx: number, text: string, color: string, now: number, size = 20, gem?: GemTier) {
    const { x, y } = this.cellCenter(floor, idx);
    // Stagger texts that land on the same cell in the same action.
    const stacked = this.floats.filter((f) => f.start === now && Math.abs(f.x - x) < 1 && Math.abs(f.y - y) < 1).length;
    this.floats.push({ x, y: y + stacked * 20, text, color, start: now, duration: 750, size, gem });
  }

  /** `rush`: a Rush is active after these events (debris and ghosts take the gold palette). */
  handleEvents(floor: Floor, events: RunEvent[], now: number, rush = false) {
    // With many blocks breaking at once (tools), keep the debris per block smaller.
    const breaks = events.filter((e) => e.type === 'break').length;
    const debris = breaks > 3 ? 5 : 12;
    const palette = rush ? RUSH_BLOCK_COLORS : BLOCK_COLORS;
    for (const e of events) {
      switch (e.type) {
        case 'hit': {
          this.hitTimes.set(e.idx, now);
          const block = floor.cells[e.idx]?.block ?? 'dirt';
          this.burst(floor, e.idx, palette[block].top, now, { count: 3, speed: 90, size: 3, duration: 220 });
          break;
        }
        case 'break': {
          const { x, y } = this.cellCenter(floor, e.idx);
          const c = palette[e.block];
          this.pops.push({ x, y, color: c.top, start: now });
          this.burst(floor, e.idx, c.top, now, { count: debris, speed: 170, size: 4, duration: 280 });
          this.burst(floor, e.idx, c.bottom, now, { count: debris / 2, speed: 120, size: 5, duration: 280 });
          // Combo count, only for the pickaxe (a blast would stack a column of numbers).
          if (e.combo && breaks <= 3) this.float(floor, e.idx, `×${e.combo}`, RUSH_COLOR, now, 16 + Math.min(e.combo, 12));
          break;
        }
        case 'freeSwing':
          this.float(floor, e.idx, 'free!', CRYSTAL_COLOR, now, 14);
          break;
        case 'gem': {
          const rank = GEM_TIERS.indexOf(e.tier);
          this.float(floor, e.idx, `+${e.value}${e.doubled ? ' ×2' : ''}`, GEM_COLORS[e.tier], now, 20 + rank * 2, e.tier);
          this.burst(floor, e.idx, GEM_COLORS[e.tier], now, {
            count: 5 + rank * 3,
            speed: 110 + rank * 30,
            size: 4 + rank,
            duration: 280,
            star: true,
            gravity: 0,
          });
          if (rank >= 2) this.ring(floor, e.idx, GEM_COLORS[e.tier], now, 0.6 + rank * 0.15);
          break;
        }
        case 'crystal':
          this.float(floor, e.idx, `+${e.energy}⚡`, CRYSTAL_COLOR, now);
          this.puff(floor, e.idx, 'rgba(95,211,255,0.55)', now);
          this.burst(floor, e.idx, CRYSTAL_COLOR, now, { count: 8, speed: 120, size: 4, duration: 280, star: true, gravity: -200 });
          break;
        case 'chest':
          this.float(floor, e.idx, `+${e.gems}`, TREASURE_COLOR, now, 22);
          this.burst(floor, e.idx, TREASURE_COLOR, now, { count: 14, speed: 160, size: 5, duration: 280, star: true });
          break;
        case 'perkOffer':
          if (e.source === 'chest') {
            const idx = events.find((x) => x.type === 'break')?.idx;
            if (idx !== undefined) {
              this.float(floor, idx, 'Perk!', TREASURE_COLOR, now, 22);
              this.ring(floor, idx, TREASURE_COLOR, now, 1);
            }
          }
          break;
        case 'gas':
          this.puff(floor, e.idx, e.masked ? 'rgba(140,200,120,0.3)' : 'rgba(120,220,90,0.6)', now, 1.6);
          if (e.masked) this.float(floor, e.idx, 'masked', GAS_COLOR, now);
          else this.float(floor, e.idx, `−${e.energyLost}⚡`, DAMAGE_COLOR, now);
          break;
        case 'caveIn':
          this.shake(now, 6);
          this.float(floor, e.idx, 'Cave-in!', '#e8c9a0', now, 16);
          for (const n of e.filled) {
            this.burst(floor, n, BLOCK_COLORS.dirt.top, now, { count: 6, speed: 60, size: 4, duration: 260, gravity: 900 });
          }
          break;
        case 'stairsRevealed':
          this.ring(floor, e.idx, TREASURE_COLOR, now, 1.4);
          this.burst(floor, e.idx, '#ffcf7a', now, { count: 12, speed: 140, size: 4, duration: 280, star: true, gravity: 0 });
          break;
        case 'tool':
          if (e.tool === 'dynamite') {
            this.shake(now, 10);
            this.puff(floor, e.idx, BLAST_COLOR, now, 2.2);
            this.burst(floor, e.idx, '#ffd27a', now, { count: 20, speed: 320, size: 3, duration: 260, gravity: 0 });
          } else if (e.tool === 'scanner') {
            this.ring(floor, e.idx, SCAN_COLOR, now, 1.6);
            for (const idx of e.cells) this.puff(floor, idx, 'rgba(111,224,255,0.45)', now, 0.7);
          } else {
            this.shake(now, 3);
            for (const idx of e.cells) this.puff(floor, idx, 'rgba(255,220,160,0.5)', now, 0.7);
          }
          break;
        case 'rushStart':
          // Reduced motion: no flash, the palette change is the cue.
          if (!this.reducedMotion) this.rushFlashAt = now;
          this.shake(now, 4);
          this.ring(floor, e.idx, RUSH_COLOR, now, 2.2);
          this.burst(floor, e.idx, RUSH_COLOR, now, { count: 18, speed: 240, size: 5, duration: 280, star: true, gravity: 0 });
          break;
        case 'floorCleared':
          // A sweep of gold stars across the whole grid (none with reduced motion).
          if (this.reducedMotion) break;
          for (let idx = 0; idx < floor.cells.length; idx += 3) {
            this.burst(floor, idx, RUSH_COLOR, now, { count: 2, speed: 90, size: 4, duration: 280, star: true, gravity: -120 });
          }
          break;
        case 'rushEnd': {
          // Centred on the grid, and it stays longer than a cell float so the result can be read.
          const x = this.originX + (this.cellSize * floor.cols) / 2;
          const y = this.originY + (this.cellSize * floor.rows) / 2;
          const text = `Rush! ${e.blocks} block${e.blocks === 1 ? '' : 's'} · +${e.gems} 💎${e.energy ? ` · +${e.energy}⚡` : ''}`;
          this.floats.push({ x, y, text, color: RUSH_COLOR, start: now, duration: RUSH_RESULT_MS, size: 22 });
          break;
        }
        case 'descend':
          if (this.lastDrawn && !this.reducedMotion) this.slide = { from: this.lastDrawn.floor, view: this.lastDrawn.view, start: now };
          this.hitTimes.clear();
          this.floats = [];
          this.puffs = [];
          this.particles = [];
          this.pops = [];
          this.rings = [];
          break;
      }
    }
  }

  private shake(now: number, size: number) {
    if (this.reducedMotion) return;
    this.screenShakeAt = now;
    this.screenShakeSize = size;
  }

  /** Particles flying out of a cell in random directions. */
  private burst(
    floor: Floor,
    idx: number,
    color: string,
    now: number,
    o: { count: number; speed: number; size: number; duration: number; star?: boolean; gravity?: number },
  ) {
    const { x, y } = this.cellCenter(floor, idx);
    const count = Math.min(o.count, MAX_PARTICLES - this.particles.length);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = o.speed * (0.4 + Math.random() * 0.6);
      this.particles.push({
        x: x + (Math.random() - 0.5) * this.cellSize * 0.4,
        y: y + (Math.random() - 0.5) * this.cellSize * 0.4,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - o.speed * 0.3,
        gravity: o.gravity ?? 700,
        size: o.size * (0.6 + Math.random() * 0.6),
        color,
        start: now,
        duration: o.duration * (0.7 + Math.random() * 0.3),
        star: o.star ?? false,
      });
    }
  }

  private ring(floor: Floor, idx: number, color: string, now: number, scale: number) {
    const { x, y } = this.cellCenter(floor, idx);
    this.rings.push({ x, y, color, start: now, duration: 280, radius: this.cellSize * scale });
  }

  private puff(floor: Floor, idx: number, color: string, now: number, scale = 1) {
    const { x, y } = this.cellCenter(floor, idx);
    this.puffs.push({ x, y, color, start: now, duration: 280, radius: this.cellSize * 0.8 * scale });
  }

  /** 0 = normal colours, 1 = full gold; fades over `RUSH_FADE_MS` when a Rush starts or ends. */
  private rushMix(now: number): number {
    const t = Math.min(1, (now - this.rushFlipAt) / RUSH_FADE_MS);
    return this.rushOn ? t : 1 - t;
  }

  draw(floor: Floor, view: DrawView, now: number) {
    const ctx = this.ctx;
    this.layout(floor);
    ctx.clearRect(0, 0, this.width, this.height);
    this.lastDrawn = { floor, view };
    if (view.rush !== this.rushOn) {
      this.rushOn = view.rush;
      this.rushFlipAt = now;
    }
    const rushMix = this.rushMix(now);

    ctx.save();
    const shakeT = (now - this.screenShakeAt) / SCREEN_SHAKE_MS;
    if (shakeT < 1) {
      const m = this.screenShakeSize * (1 - shakeT);
      ctx.translate(Math.sin(now * 0.09) * m, Math.cos(now * 0.11) * m);
    }

    const s = this.cellSize;
    const gridW = s * floor.cols;
    const gridH = s * floor.rows;
    ctx.fillStyle = BACKDROP_COLOR;
    roundRect(ctx, this.originX - 4, this.originY - 4, gridW + 8, gridH + 8, 12);
    ctx.fill();
    if (rushMix > 0) {
      // Pulsing gold border.
      const pulse = this.reducedMotion ? 0.7 : 0.5 + 0.5 * Math.sin(now / 140);
      ctx.save();
      ctx.globalAlpha = rushMix * (0.45 + 0.55 * pulse);
      ctx.strokeStyle = RUSH_COLOR;
      ctx.shadowColor = RUSH_COLOR;
      ctx.shadowBlur = 6 + pulse * 10;
      ctx.lineWidth = 3;
      roundRect(ctx, this.originX - 3, this.originY - 3, gridW + 6, gridH + 6, 11);
      ctx.stroke();
      ctx.restore();
    }

    // Floor transition: the camera moves down, so the old floor leaves upward and the new one rises in.
    const slideT = this.slide ? (now - this.slide.start) / FLOOR_SLIDE_MS : 1;
    if (this.slide && slideT < 1) {
      const e = 1 - (1 - slideT) ** 3;
      ctx.save();
      ctx.beginPath();
      ctx.rect(this.originX, this.originY, gridW, gridH);
      ctx.clip();
      this.drawCells(this.slide.from, this.slide.view, now, rushMix, -e * gridH);
      this.drawCells(floor, view, now, rushMix, (1 - e) * gridH);
      ctx.restore();
    } else {
      this.slide = undefined;
      this.drawCells(floor, view, now, rushMix, 0);
    }

    const flashT = (now - this.rushFlashAt) / RUSH_FLASH_MS;
    if (flashT < 1) {
      ctx.globalAlpha = 0.55 * (1 - flashT) ** 2;
      ctx.fillStyle = '#fff1b8';
      roundRect(ctx, this.originX - 4, this.originY - 4, gridW + 8, gridH + 8, 12);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    this.drawPops(now);
    this.drawPuffs(now);
    this.drawRings(now);
    this.drawParticles(now);
    this.drawFloats(now);
    ctx.restore();
  }

  private drawCells(floor: Floor, view: DrawView, now: number, rushMix: number, offsetY: number) {
    const s = this.cellSize;
    floor.cells.forEach((cell, idx) => {
      const { col, row } = toColRow(floor, idx);
      let x = this.originX + col * s;
      const y = this.originY + row * s + offsetY;
      const hitAt = this.hitTimes.get(idx);
      if (hitAt !== undefined && offsetY === 0) {
        const t = (now - hitAt) / HIT_SHAKE_MS;
        if (t < 1) x += Math.sin(t * Math.PI * 4) * 3 * (1 - t);
        else this.hitTimes.delete(idx);
      }
      if (cell.open) this.drawOpen(floor, cell, idx, x, y, s, now);
      else this.drawBlock(floor, cell, idx, x, y, s, view, now, rushMix);
    });
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
      // A ladder going down.
      ctx.fillStyle = '#3a2a1e';
      const railW = Math.max(2, s * 0.07);
      const top = y + s * 0.14;
      const h = s * 0.54;
      ctx.fillRect(x + s * 0.3, top, railW, h);
      ctx.fillRect(x + s * 0.7 - railW, top, railW, h);
      const rungs = 4;
      for (let i = 0; i < rungs; i++) {
        ctx.fillRect(x + s * 0.3, top + h * ((i + 0.6) / rungs) - railW / 2, s * 0.4, railW * 0.8);
      }
      ctx.fillStyle = '#ffcf7a';
      ctx.font = `700 ${Math.round(s * 0.34)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('▼', x + s / 2, y + s * 0.78);
    }
  }

  private drawBlock(
    floor: Floor,
    cell: Cell,
    idx: number,
    x: number,
    y: number,
    s: number,
    view: DrawView,
    now: number,
    rushMix: number,
  ) {
    const ctx = this.ctx;
    const bx = x + GAP / 2;
    const by = y + GAP / 2;
    const bs = s - GAP;

    // During the Rush fade both palettes are drawn, gold on top at the fade's opacity.
    if (rushMix < 1) this.drawBlockBody(floor.seed, idx, BLOCK_COLORS[cell.block], bx, by, bs);
    if (rushMix > 0) {
      ctx.globalAlpha = rushMix;
      this.drawBlockBody(floor.seed, idx, RUSH_BLOCK_COLORS[cell.block], bx, by, bs);
      if (!this.reducedMotion) this.drawShimmer(bx, by, bs, now);
      ctx.globalAlpha = 1;
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

    const hint = view.hints[idx];
    if (hint) {
      ctx.strokeStyle = 'rgba(255,230,190,0.45)';
      ctx.lineWidth = 1.5;
      roundRect(ctx, bx + 0.75, by + 0.75, bs - 1.5, bs - 1.5, 6);
      ctx.stroke();
      if (hint.chest && view.showChests) this.drawTreasureGlow(bx, by, bs, now);
      if (hint.hazardNear) this.drawDust(floor.seed, idx, bx, by, bs, now);
      if (hint.gemNear) {
        const color = view.tierColors ? GEM_COLORS[hint.gemNear] : SPARKLE_COLOR;
        this.drawSparkles(floor.seed, idx, bx, by, bs, color, now);
      }
    } else {
      // Unexposed blocks are dimmed as out of reach, except in a Rush, where any block can be mined.
      ctx.fillStyle = `rgba(0,0,0,${0.42 * (1 - rushMix)})`;
      roundRect(ctx, bx, by, bs, bs, 6);
      ctx.fill();
    }
    if (cell.scanned) this.drawScanned(cell, bx, by, bs);
  }

  /** Block gradient and its deterministic texture specks. */
  private drawBlockBody(seed: number, idx: number, colors: { top: string; bottom: string; speck: string }, bx: number, by: number, bs: number) {
    const ctx = this.ctx;
    const g = ctx.createLinearGradient(bx, by, bx, by + bs);
    g.addColorStop(0, colors.top);
    g.addColorStop(1, colors.bottom);
    ctx.fillStyle = g;
    roundRect(ctx, bx, by, bs, bs, 6);
    ctx.fill();
    const rng = new Rng(seed ^ (idx * 2654435761));
    ctx.fillStyle = colors.speck;
    for (let i = 0; i < 5; i++) {
      const r = 1 + rng.next() * bs * 0.05;
      ctx.beginPath();
      ctx.arc(bx + 6 + rng.next() * (bs - 12), by + 6 + rng.next() * (bs - 12), r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** A soft diagonal band of light sweeping across the whole grid (each block draws its slice). */
  private drawShimmer(bx: number, by: number, bs: number, now: number) {
    const ctx = this.ctx;
    const span = (this.width + this.height) * 1.5;
    // Band position along the x + y diagonal, looping every 1.6 s.
    const band = ((now / 1600) % 1) * span - span / 6;
    const d = bx + by + bs - band;
    const width = this.cellSize * 2.2;
    if (Math.abs(d) > width) return;
    const alpha = ctx.globalAlpha;
    ctx.globalAlpha = alpha * 0.35 * (1 - Math.abs(d) / width);
    ctx.fillStyle = '#fff6d0';
    roundRect(ctx, bx, by, bs, bs, 6);
    ctx.fill();
    ctx.globalAlpha = alpha;
  }

  /** Scanner result: a cyan frame and the block's content as an icon (nothing when empty). */
  private drawScanned(cell: Cell, bx: number, by: number, bs: number) {
    const ctx = this.ctx;
    ctx.save();
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = SCAN_COLOR;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 1.5;
    roundRect(ctx, bx + 3, by + 3, bs - 6, bs - 6, 5);
    ctx.stroke();
    ctx.restore();

    const cx = bx + bs / 2;
    const cy = by + bs / 2;
    const c = cell.content;
    if (c.kind === 'none') return;
    if (c.kind === 'gem') {
      drawGemIcon(ctx, c.tier, cx, cy, bs * 0.22);
      return;
    }
    const icon = { crystal: '⚡', chest: '🧰', gas: '☁️', caveIn: '🪨', stairs: '🪜' }[c.kind];
    ctx.font = `${Math.round(bs * 0.4)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icon, cx, cy + 1);
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

  /** A few twinkling 4-point stars at fixed spots on the block. */
  private drawSparkles(seed: number, idx: number, bx: number, by: number, bs: number, color: string, now: number) {
    const ctx = this.ctx;
    const rng = new Rng(seed ^ (idx * 7349) ^ 0x5a5a);
    ctx.fillStyle = color;
    for (let i = 0; i < 3; i++) {
      const px = bx + bs * (0.2 + rng.next() * 0.6);
      const py = by + bs * (0.2 + rng.next() * 0.6);
      const phase = rng.next() * Math.PI * 2;
      const tw = 0.5 + 0.5 * Math.sin(now / 260 + phase);
      const r = bs * (0.05 + 0.06 * tw);
      ctx.globalAlpha = 0.35 + 0.6 * tw;
      ctx.beginPath();
      ctx.moveTo(px, py - r);
      ctx.quadraticCurveTo(px, py, px + r, py);
      ctx.quadraticCurveTo(px, py, px, py + r);
      ctx.quadraticCurveTo(px, py, px - r, py);
      ctx.quadraticCurveTo(px, py, px, py - r);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** Faint particles drifting down across the block. */
  private drawDust(seed: number, idx: number, bx: number, by: number, bs: number, now: number) {
    const ctx = this.ctx;
    const rng = new Rng(seed ^ (idx * 9151) ^ 0xd057);
    ctx.fillStyle = DUST_COLOR;
    for (let i = 0; i < 5; i++) {
      const px = bx + bs * (0.15 + rng.next() * 0.7);
      const speed = 0.25 + rng.next() * 0.3;
      const t = (now / 1000) * speed + rng.next();
      const f = t - Math.floor(t);
      ctx.globalAlpha = 0.85 * Math.sin(f * Math.PI);
      ctx.beginPath();
      ctx.arc(px + Math.sin(t * 5) * 2, by + bs * (0.1 + f * 0.8), 1.3 + rng.next(), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private drawTreasureGlow(bx: number, by: number, bs: number, now: number) {
    const ctx = this.ctx;
    const pulse = 0.5 + 0.5 * Math.sin(now / 220);
    ctx.save();
    ctx.shadowColor = TREASURE_COLOR;
    ctx.shadowBlur = 8 + pulse * 8;
    ctx.strokeStyle = TREASURE_COLOR;
    ctx.globalAlpha = 0.6 + pulse * 0.4;
    ctx.lineWidth = 2.5;
    roundRect(ctx, bx + 2, by + 2, bs - 4, bs - 4, 6);
    ctx.stroke();
    ctx.restore();
  }

  private drawPuffs(now: number) {
    const ctx = this.ctx;
    this.puffs = this.puffs.filter((p) => now - p.start < p.duration);
    for (const p of this.puffs) {
      const t = (now - p.start) / p.duration;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius * (0.4 + t * 0.6));
      g.addColorStop(0, p.color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private drawPops(now: number) {
    const ctx = this.ctx;
    this.pops = this.pops.filter((p) => now - p.start < POP_MS);
    for (const p of this.pops) {
      const t = (now - p.start) / POP_MS;
      const size = (this.cellSize - GAP) * (1 + 0.25 * t);
      ctx.globalAlpha = (1 - t) * 0.9;
      ctx.fillStyle = p.color;
      roundRect(ctx, p.x - size / 2, p.y - size / 2, size, size, 6);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private drawRings(now: number) {
    const ctx = this.ctx;
    this.rings = this.rings.filter((r) => now - r.start < r.duration);
    for (const r of this.rings) {
      const t = (now - r.start) / r.duration;
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 3 * (1 - t) + 1;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.radius * (0.3 + 0.7 * (1 - (1 - t) ** 2)), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  private drawParticles(now: number) {
    const ctx = this.ctx;
    this.particles = this.particles.filter((p) => now - p.start < p.duration);
    for (const p of this.particles) {
      const age = (now - p.start) / 1000;
      const t = (now - p.start) / p.duration;
      const x = p.x + p.vx * age;
      const y = p.y + p.vy * age + 0.5 * p.gravity * age * age;
      const r = p.size * (1 - t * 0.5);
      ctx.globalAlpha = 1 - t * t;
      ctx.fillStyle = p.color;
      if (p.star) {
        ctx.beginPath();
        ctx.moveTo(x, y - r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.quadraticCurveTo(x, y, x, y + r);
        ctx.quadraticCurveTo(x, y, x - r, y);
        ctx.quadraticCurveTo(x, y, x, y - r);
        ctx.fill();
      } else {
        ctx.fillRect(x - r / 2, y - r / 2, r, r);
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawFloats(now: number) {
    const ctx = this.ctx;
    this.floats = this.floats.filter((f) => now - f.start < f.duration);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const f of this.floats) {
      ctx.font = `800 ${f.size}px system-ui, sans-serif`;
      const t = (now - f.start) / f.duration;
      ctx.globalAlpha = 1 - t * t;
      const y = f.y - t * 36;
      let x = f.x;
      if (f.gem) {
        // Icon then text, centred together on the cell.
        const r = f.size * 0.45;
        const w = ctx.measureText(f.text).width;
        const iconX = f.x - (w + r * 2 + 3) / 2 + r;
        drawGemIcon(ctx, f.gem, iconX, y, r);
        x = iconX + r + 3 + w / 2;
      }
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.strokeText(f.text, x, y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, x, y);
    }
    ctx.globalAlpha = 1;
  }
}

/** Draws the gem icon for `tier` centred at (cx, cy) with radius `r`. */
function drawGemIcon(ctx: CanvasRenderingContext2D, tier: GemTier, cx: number, cy: number, r: number) {
  const pts = GEM_SHAPES[tier];
  ctx.beginPath();
  pts.forEach(([px, py], i) => (i ? ctx.lineTo(cx + px * r, cy + py * r) : ctx.moveTo(cx + px * r, cy + py * r)));
  ctx.closePath();
  ctx.fillStyle = GEM_COLORS[tier];
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.lineWidth = 1.5;
  ctx.fill();
  ctx.stroke();
  // Facet glint.
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.25, cy - r * 0.45);
  ctx.lineTo(cx + r * 0.1, cy - r * 0.1);
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = Math.max(1, r * 0.15);
  ctx.stroke();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
