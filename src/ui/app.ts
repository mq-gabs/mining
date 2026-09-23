import { CONFIG, GEM_TIERS, TOOL_IDS, type ToolId, type UpgradeId } from '../config';
import { gemsKept } from '../game/economy';
import { computeHints } from '../game/hints';
import { hasPerk, PERKS } from '../game/perks';
import { applyRunResult, buyUpgrade, modifiersFromProfile, type Profile } from '../game/progression';
import { choosePerk, createRun, endRun, tapCell, useTool, type ActionResult } from '../game/run';
import { randomSeed } from '../game/rng';
import type { EndReason, PerkId, RunEvent, RunState, RunSummary } from '../game/types';
import { ProfileStore, SettingsStore } from '../platform/storage';
import { flyGem, replayClass, showBanner } from './fx';
import { GridRenderer, type DrawView } from './gridRenderer';
import { isModalOpen, showModal } from './modal';
import { renderShop } from './shop';
import { Sounds } from './sounds';
import { GEM_COLORS, TREASURE_COLOR } from './theme';
import { TOOL_META } from './tools';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

/** Low-energy warning threshold, as a share of max energy. */
const LOW_ENERGY = 0.2;

export class App {
  private store = new ProfileStore();
  private settings = new SettingsStore();
  private sounds = new Sounds();
  private profile: Profile = this.store.load();
  private run?: RunState;
  private view: DrawView = { hints: [], tierColors: false, showChests: false };
  /** Tool the next grid tap will use; undefined means the pickaxe. */
  private armed?: ToolId;
  private renderer: GridRenderer;
  private rafId = 0;
  /** A `?seed=123` URL param forces the first run's seed (for reproducing bugs). */
  private forcedSeed = parseSeedParam();

  constructor() {
    this.renderer = new GridRenderer($<HTMLCanvasElement>('grid'), $('grid-wrap'));
    $('btn-start').addEventListener('click', () => this.startRun());
    $('btn-leave').addEventListener('click', () => this.confirmLeave());
    $('btn-reset').addEventListener('click', () => this.confirmReset());
    $('grid').addEventListener('pointerdown', (e) => this.onGridPointer(e));
    $('perk-bar').addEventListener('click', () => this.showActivePerks());
    $('tool-bar').addEventListener('click', (e) => this.onToolButton(e));
    for (const btn of document.querySelectorAll('[data-mute]')) btn.addEventListener('click', () => this.toggleMute());
    // Audio can only start from a user gesture; every tap makes sure it's running.
    document.addEventListener('pointerdown', () => this.sounds.synth.unlock(), { capture: true });
    // Generic click for plain buttons (buying, perks, tools and mute have their own sounds).
    document.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('.btn');
      if (btn && !btn.matches('.buy-btn, .perk-card')) this.sounds.click();
    });
    this.sounds.synth.muted = this.settings.load().muted;
    this.renderMute();
    this.showHub();
    if (import.meta.env.DEV) this.exposeDebugHook();
  }

  /** Dev builds only: `window.__deepDig` to inspect state and script taps from the console or tests. */
  private exposeDebugHook() {
    const app = this;
    Object.assign(window, {
      __deepDig: {
        get run() {
          return app.run;
        },
        set run(run: RunState | undefined) {
          if (run) app.setRun(run);
        },
        tap: (idx: number) => app.run && app.apply(tapCell(app.run, idx)),
        tool: (tool: ToolId, idx: number) => app.run && app.apply(useTool(app.run, tool, idx)),
        hints: () => app.view.hints,
      },
    });
  }

  // ---------- Sound ----------

  private toggleMute() {
    const muted = !this.sounds.synth.muted;
    this.sounds.synth.muted = muted;
    this.settings.save({ muted });
    this.renderMute();
    this.sounds.click();
  }

  private renderMute() {
    const muted = this.sounds.synth.muted;
    for (const btn of document.querySelectorAll<HTMLElement>('[data-mute]')) {
      btn.textContent = muted ? '🔇' : '🔊';
      btn.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
      btn.setAttribute('aria-pressed', String(muted));
    }
  }

  // ---------- Screens ----------

  private showHub() {
    cancelAnimationFrame(this.rafId);
    $('screen-run').hidden = true;
    $('screen-hub').hidden = false;
    this.renderHub();
  }

  private renderHub(justBought?: UpgradeId) {
    $('hub-gems').textContent = String(this.profile.gems);
    $('hub-best').textContent = this.profile.bestDepth ? String(this.profile.bestDepth) : '–';
    renderShop($('shop'), this.profile, (id) => this.buy(id), justBought);
  }

  private setProfile(profile: Profile) {
    this.profile = profile;
    this.store.save(profile);
  }

  private buy(id: UpgradeId) {
    const next = buyUpgrade(this.profile, id);
    if (next === this.profile) return;
    this.sounds.buy();
    this.setProfile(next);
    this.renderHub(id);
  }

  private confirmReset() {
    showModal(`<h2>Reset progress?</h2><p>This erases all gems, upgrades and your best depth. It can't be undone.</p>`, [
      {
        label: 'Reset everything',
        className: 'danger',
        onClick: () => {
          this.profile = this.store.reset();
          this.renderHub();
        },
      },
      { label: 'Cancel', onClick: () => {} },
    ]);
  }

  private startRun() {
    const seed = this.forcedSeed ?? randomSeed();
    this.forcedSeed = undefined;
    console.info(`[deep-dig] run seed ${seed}`);
    $('screen-hub').hidden = true;
    $('screen-run').hidden = false;
    this.armed = undefined;
    this.setRun(createRun(seed, modifiersFromProfile(this.profile)));
    this.loop();
    showBanner($('floor-banner'), 'Floor 1');
  }

  private loop = () => {
    if (this.run) this.renderer.draw(this.run.floor, this.view, performance.now());
    this.rafId = requestAnimationFrame(this.loop);
  };

  private setRun(run: RunState) {
    this.run = run;
    this.view = {
      hints: computeHints(run.floor),
      tierColors: hasPerk(run, 'prospector'),
      showChests: hasPerk(run, 'treasureSense'),
    };
    this.updateHud();
  }

  /** Applies the result of a game action: new state, effects, and follow-up UI. */
  private apply({ run, events }: ActionResult) {
    const prev = this.run;
    if (run === prev || !prev) return;
    if (events.some((e) => e.type === 'descend')) this.armed = undefined;
    this.setRun(run);
    this.renderer.handleEvents(run.floor, events, performance.now());
    this.sounds.playEvents(events, prev, run, LOW_ENERGY);
    this.playHudEffects(events, prev, run);
    this.onEvents(events);
  }

  /** Effects outside the canvas: gems flying to the counter, energy bar flashes, the floor banner. */
  private playHudEffects(events: RunEvent[], prev: RunState, run: RunState) {
    const counter = $('hud-gems');
    const bump = () => replayClass(counter, 'bump');
    let flights = 0;
    for (const e of events) {
      if (e.type === 'gem' && flights < 8) {
        const rank = GEM_TIERS.indexOf(e.tier);
        const from = this.renderer.cellClientCenter(run.floor, e.idx);
        flyGem(from, counter, GEM_COLORS[e.tier], 12 + rank * 3, flights++ * 40, bump);
      }
      if (e.type === 'chest') {
        const from = this.renderer.cellClientCenter(run.floor, e.idx);
        for (let i = 0; i < 3; i++) flyGem(from, counter, TREASURE_COLOR, 12, i * 40, bump);
      }
      if (e.type === 'descend') showBanner($('floor-banner'), `Floor ${e.depth}`);
    }
    if (run.energy > prev.energy) replayClass($('energy'), 'gain');
    else if (prev.energy - run.energy > CONFIG.energy.tapCost) replayClass($('energy'), 'drain');
  }

  // ---------- Input ----------

  private onGridPointer(e: PointerEvent) {
    e.preventDefault();
    if (!this.run || this.run.status !== 'playing' || isModalOpen()) return;
    const idx = this.renderer.cellAt(this.run.floor, e.clientX, e.clientY);
    if (idx === undefined) return;
    this.sounds.synth.unlock();
    const cell = this.run.floor.cells[idx];
    // Revealed stairs always take you down, even with a tool armed.
    if (this.armed && !(cell.open && cell.content.kind === 'stairs')) {
      const result = useTool(this.run, this.armed, idx);
      if (result.run === this.run) return this.rejectToolTarget();
      this.armed = undefined;
      this.apply(result);
      return;
    }
    this.apply(tapCell(this.run, idx));
  }

  private onToolButton(e: MouseEvent) {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-tool]');
    if (!btn || btn.disabled || !this.run || this.run.status !== 'playing' || isModalOpen()) return;
    const tool = btn.dataset.tool as ToolId | 'pickaxe';
    // Tapping the armed tool again puts it away.
    this.armed = tool === 'pickaxe' || tool === this.armed ? undefined : tool;
    this.sounds.toolArm();
    this.updateHud();
  }

  /** The armed tool can't be used there (out of reach, or nothing to affect). */
  private rejectToolTarget() {
    this.sounds.reject();
    const btn = $('tool-bar').querySelector('.armed');
    btn?.classList.remove('reject');
    void (btn as HTMLElement | null)?.offsetWidth; // restart the animation
    btn?.classList.add('reject');
  }

  private onEvents(events: RunEvent[]) {
    for (const e of events) {
      // Short delays let the triggering animation play before a modal interrupts.
      if (e.type === 'outOfEnergy') setTimeout(() => this.showOutOfEnergy(), 350);
      if (e.type === 'perkOffer') setTimeout(() => this.showPerkPicker(), 250);
    }
  }

  // ---------- Perks ----------

  private showPerkPicker() {
    const run = this.run;
    if (!run || run.status !== 'choosingPerk' || !run.perkOffer) return;
    const { source, choices } = run.perkOffer;
    const subtitle = source === 'chest' ? 'You found a relic in the chest.' : `You reached floor ${run.depth}.`;
    if (source === 'floor') this.sounds.perkOffer();
    showModal(
      `<h2>Choose a perk</h2><p>${subtitle} Perks last until the end of this run.</p>`,
      choices.map((id) => ({
        html: perkCardHtml(id, run.perks[id] ? `(have ${run.perks[id]})` : ''),
        className: 'perk-card',
        onClick: () => this.apply(choosePerk(run, id)),
      })),
    );
  }

  private showActivePerks() {
    const run = this.run;
    if (!run || run.status !== 'playing' || isModalOpen()) return;
    const owned = (Object.keys(run.perks) as PerkId[]).filter((id) => hasPerk(run, id));
    const list = owned.length
      ? owned
          .map((id) => `<div class="perk-row">${perkCardHtml(id, run.perks[id]! > 1 ? `×${run.perks[id]}` : '')}</div>`)
          .join('')
      : `<p>No perks yet. You get to pick one every ${CONFIG.perks.offerEveryFloors} floors, and some chests hold one.</p>`;
    showModal(`<h2>Active perks</h2><div class="perk-list">${list}</div>`, [
      { label: 'Back to digging', primary: true, onClick: () => {} },
    ]);
  }

  private renderPerkBar(run: RunState) {
    const owned = (Object.keys(run.perks) as PerkId[]).filter((id) => hasPerk(run, id));
    const bar = $('perk-bar');
    bar.classList.toggle('empty', owned.length === 0);
    bar.innerHTML = owned.length
      ? owned
          .map((id) => {
            const n = run.perks[id]!;
            return `<span class="perk-chip" title="${PERKS[id].name}">${PERKS[id].icon}${n > 1 ? `<small>×${n}</small>` : ''}</span>`;
          })
          .join('')
      : '<span class="perk-empty">Perks: none yet</span>';
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
    this.renderPerkBar(run);
    this.renderToolBar(run);
  }

  private renderToolBar(run: RunState) {
    const pick = `<button class="tool${this.armed ? '' : ' armed'}" data-tool="pickaxe" aria-pressed="${!this.armed}">
        <span class="tool-icon">⛏️</span><span class="tool-name">Pickaxe</span><span class="tool-count">∞</span></button>`;
    const tools = TOOL_IDS.map((id) => {
      const meta = TOOL_META[id];
      const locked = run.mods.toolCharges[id] === 0;
      const left = run.tools[id];
      const armed = this.armed === id;
      const count = locked ? '🔒' : String(left);
      const title = locked ? `${meta.name}: unlock it in the shop` : `${meta.name}: ${meta.description}`;
      return `<button class="tool${armed ? ' armed' : ''}${locked ? ' locked' : ''}" data-tool="${id}"
          aria-pressed="${armed}" title="${title}" ${locked || left === 0 ? 'disabled' : ''}>
        <span class="tool-icon">${meta.icon}</span><span class="tool-name">${meta.name}</span><span class="tool-count">${count}</span></button>`;
    });
    $('tool-bar').innerHTML = pick + tools.join('');
    $('grid-wrap').classList.toggle('armed', !!this.armed);
    const hint = $('aim-hint');
    hint.hidden = !this.armed;
    if (this.armed) hint.textContent = `${TOOL_META[this.armed].icon} Tap a block: ${TOOL_META[this.armed].description}`;
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
    const { profile, newBest } = applyRunResult(this.profile, summary);
    this.setProfile(profile);
    this.showSummary(summary, newBest);
  }

  private showSummary(s: RunSummary, newBest: boolean) {
    if (newBest) this.sounds.newBest();
    else this.sounds.runEnd(s.reason === 'left');
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

/** A perk's icon, name and description, with an optional stack note after the name. */
function perkCardHtml(id: PerkId, stackNote: string): string {
  const p = PERKS[id];
  const stack = stackNote ? ` <span class="perk-stack">${stackNote}</span>` : '';
  return `<span class="perk-icon">${p.icon}</span>
    <span class="perk-text"><strong>${p.name}${stack}</strong><span>${p.description}</span></span>`;
}

function parseSeedParam(): number | undefined {
  const raw = new URLSearchParams(location.search).get('seed');
  if (raw === null) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n >>> 0 : undefined;
}
