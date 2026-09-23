import { CONFIG } from '../config';
import { gemsKept } from '../game/economy';
import { createRun, defaultModifiers, endRun, tapCell } from '../game/run';
import { randomSeed } from '../game/rng';
import type { EndReason, RunEvent, RunState, RunSummary } from '../game/types';
import { GridRenderer } from './gridRenderer';
import { isModalOpen, showModal } from './modal';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

/** Low-energy warning threshold, as a share of max energy. */
const LOW_ENERGY = 0.2;

/** Meta progress (in-memory for now; persisted in milestone 2). */
interface Profile {
  gems: number;
  bestDepth: number;
}

export class App {
  private profile: Profile = { gems: 0, bestDepth: 0 };
  private run?: RunState;
  private renderer: GridRenderer;
  private rafId = 0;
  /** A `?seed=123` URL param forces the first run's seed (for reproducing bugs). */
  private forcedSeed = parseSeedParam();

  constructor() {
    this.renderer = new GridRenderer($<HTMLCanvasElement>('grid'), $('grid-wrap'));
    $('btn-start').addEventListener('click', () => this.startRun());
    $('btn-leave').addEventListener('click', () => this.confirmLeave());
    $('grid').addEventListener('pointerdown', (e) => this.onGridPointer(e));
    this.showHub();
  }

  // ---------- Screens ----------

  private showHub() {
    cancelAnimationFrame(this.rafId);
    $('screen-run').hidden = true;
    $('screen-hub').hidden = false;
    $('hub-gems').textContent = String(this.profile.gems);
    $('hub-best').textContent = this.profile.bestDepth ? String(this.profile.bestDepth) : '–';
  }

  private startRun() {
    const seed = this.forcedSeed ?? randomSeed();
    this.forcedSeed = undefined;
    this.run = createRun(seed, defaultModifiers());
    console.info(`[deep-dig] run seed ${seed}`);
    $('screen-hub').hidden = true;
    $('screen-run').hidden = false;
    this.updateHud();
    this.loop();
  }

  private loop = () => {
    if (this.run) this.renderer.draw(this.run.floor, performance.now());
    this.rafId = requestAnimationFrame(this.loop);
  };

  // ---------- Input ----------

  private onGridPointer(e: PointerEvent) {
    e.preventDefault();
    if (!this.run || this.run.status !== 'playing' || isModalOpen()) return;
    const idx = this.renderer.cellAt(this.run.floor, e.clientX, e.clientY);
    if (idx === undefined) return;
    const { run, events } = tapCell(this.run, idx);
    if (run === this.run) return;
    this.run = run;
    this.renderer.handleEvents(run.floor, events, performance.now());
    this.updateHud();
    this.onEvents(events);
  }

  private onEvents(events: RunEvent[]) {
    for (const e of events) {
      if (e.type === 'outOfEnergy') {
        // Let the last hit animation play before interrupting.
        setTimeout(() => this.showOutOfEnergy(), 350);
      }
    }
  }

  // ---------- HUD ----------

  private updateHud() {
    const run = this.run;
    if (!run) return;
    $('hud-depth').textContent = `Floor ${run.depth}`;
    $('hud-gems-value').textContent = String(run.gems);
    const ratio = run.energy / run.mods.maxEnergy;
    $('energy-fill').style.width = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
    $('energy-text').textContent = `⚡ ${run.energy} / ${run.mods.maxEnergy}`;
    $('energy').classList.toggle('low', ratio < LOW_ENERGY);
  }

  // ---------- Run endings ----------

  private confirmLeave() {
    if (!this.run || this.run.status !== 'playing' || isModalOpen()) return;
    showModal(
      `<h2>Leave the mine?</h2><p>You'll return to the surface and keep all <strong>${this.run.gems}</strong> gems from this run.</p>`,
      [
        { label: 'Leave Mine', primary: true, onClick: () => this.finishRun('left') },
        { label: 'Keep digging', onClick: () => {} },
      ],
    );
  }

  private showOutOfEnergy() {
    if (!this.run) return;
    const kept = gemsKept(this.run.gems, 'exhausted');
    const pct = Math.round(CONFIG.run.exhaustedKeepRatio * 100);
    showModal(
      `<h2>Out of energy!</h2><p>You collapse and get carried out. You keep ${pct}% of your gems: <strong>${kept}</strong> of ${this.run.gems}.</p>`,
      [{ label: 'Continue', primary: true, onClick: () => this.finishRun('exhausted') }],
    );
  }

  private finishRun(reason: EndReason) {
    if (!this.run) return;
    const { summary } = endRun(this.run, reason);
    this.run = undefined;
    const newBest = summary.depth > this.profile.bestDepth;
    this.profile.gems += summary.gemsKept;
    if (newBest) this.profile.bestDepth = summary.depth;
    this.showSummary(summary, newBest);
  }

  private showSummary(s: RunSummary, newBest: boolean) {
    const title = s.reason === 'left' ? 'Back on the surface' : 'Carried out';
    showModal(
      `${newBest ? '<div class="badge">New best depth!</div>' : ''}
       <h2>${title}</h2>
       <div class="summary-rows">
         <div class="summary-row"><span>Depth reached</span><strong>Floor ${s.depth}</strong></div>
         <div class="summary-row"><span>Blocks broken</span><strong>${s.blocksBroken}</strong></div>
         <div class="summary-row"><span>Gems found</span><strong>${s.gemsFound}</strong></div>
         <div class="summary-row highlight"><span>Gems kept</span><strong>${s.gemsKept}</strong></div>
       </div>
       <div class="seed">seed ${s.seed}</div>`,
      [{ label: 'Continue', primary: true, onClick: () => this.showHub() }],
    );
  }
}

function parseSeedParam(): number | undefined {
  const raw = new URLSearchParams(location.search).get('seed');
  if (raw === null) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n >>> 0 : undefined;
}
