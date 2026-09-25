import { CONFIG, GEM_TIERS, TOOL_IDS, type ToolId, type UpgradeId } from '../config';
import { isEnabled } from '../flags';
import { bonusForDepth, clearEnergyForDepth, gasEnergyLoss, gemsKept, gemValue } from '../game/economy';
import { computeHints } from '../game/hints';
import { hasPerk, PERKS } from '../game/perks';
import {
  applyRunResult,
  buyUpgrade,
  doubleRunGems,
  isLastRun,
  runsLeft,
  modifiersFromProfile,
  shouldShowInterstitial,
  type Profile,
} from '../game/progression';
import {
  canUseEnergyAd,
  choosePerk,
  createRun,
  endRun,
  grantAdEnergy,
  isCollectible,
  runMultiplier,
  tapCell,
  tickRun,
  useTool,
  type ActionResult,
} from '../game/run';
import { randomSeed } from '../game/rng';
import type { EndReason, PerkId, RunEvent, RunState, RunSummary } from '../game/types';
import { createAdService, type AdService } from '../platform/ads';
import { ProfileStore, SettingsStore, type Settings } from '../platform/storage';
import { flyGem, replayClass, showBanner } from './fx';
import { GridRenderer, type DrawView } from './gridRenderer';
import { installDevPanel } from './devPanel';
import { playEnding, playFailure } from './ending';
import { hideModal, isModalOpen, showModal, type ModalAction } from './modal';
import { renderShop } from './shop';
import { MusicEngine } from './music';
import { Sounds } from './sounds';
import { GEM_COLORS, gemIconSvg, TREASURE_COLOR } from './theme';
import { TOOL_ICONS } from './tools';
import { gemName, perkDescription, perkName, toolDescription, toolName } from './names';
import { detectLocale, fmtNumber, fmtPct, LOCALES, setLocale, t, type Locale, type MessageKey } from '../i18n';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

/** Low-energy warning threshold, as a share of max energy. */
const LOW_ENERGY = 0.2;
/** The Rush meter glows above this level, so the player knows a Rush is close. */
const MOMENTUM_HOT = 0.8;
/** Longest frame the Rush clock takes in one step, so a hitch doesn't drain the meter in a jump. */
const MAX_TICK_MS = 100;

export class App {
  private store = new ProfileStore();
  private settings = new SettingsStore();
  private sounds = new Sounds();
  private music = new MusicEngine(this.sounds.synth);
  private soundSettings = this.settings.load();
  /** Undefined when the `ads` feature flag is off: no ad offers or interstitials at all. */
  private ads = createAdService();
  private profile: Profile = this.store.load();
  private run?: RunState;
  private view: DrawView = { hints: [], tierColors: false, showChests: false, rush: false };
  /** Tool the next grid tap will use; undefined means the pickaxe. */
  private armed?: ToolId;
  private renderer: GridRenderer;
  private rafId = 0;
  private lastFrame = 0;
  /** A `?seed=123` URL param forces the first run's seed (for reproducing bugs). */
  private forcedSeed = parseSeedParam();

  constructor() {
    this.renderer = new GridRenderer($<HTMLCanvasElement>('grid'), $('grid-wrap'));
    $('btn-start').addEventListener('click', () => this.startRun());
    $('btn-leave').addEventListener('click', () => this.confirmLeave());
    $('btn-reset').addEventListener('click', () => this.confirmReset());
    $('grid').addEventListener('pointerdown', (e) => this.onGridPointer(e));
    $('perk-bar').addEventListener('click', () => this.showActivePerks());
    $('clean-chip').addEventListener('click', () => this.showCleanBonus());
    $('hud-gems').addEventListener('click', () => this.showGemBreakdown());
    $('tool-bar').addEventListener('click', (e) => this.onToolButton(e));
    for (const btn of document.querySelectorAll('[data-mute]')) btn.addEventListener('click', () => this.toggleMute());
    $('btn-settings').addEventListener('click', () => this.showSettings());
    // Audio can only start from a user gesture: the first tap starts the music, every tap keeps it running.
    document.addEventListener('pointerdown', () => this.unlockAudio(), { capture: true });
    document.addEventListener('keydown', () => this.unlockAudio(), { capture: true });
    document.addEventListener('visibilitychange', () => this.sounds.synth.hold('hidden', document.hidden));
    // Generic click for plain buttons (buying, perks, tools and mute have their own sounds).
    document.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('.btn');
      if (btn && !btn.matches('.buy-btn, .perk-confirm, .dev-sfx')) this.sounds.click();
    });
    this.applySoundSettings();
    this.applyLocale();
    this.renderMute();
    // Try to start the menu music right away. Browsers only allow this when autoplay is permitted
    // (e.g. the player has used the site before); otherwise it starts on the first tap or key press.
    this.unlockAudio();
    this.showHub();
    if (import.meta.env.DEV) this.exposeDebugHook();
    if (isEnabled('devTools')) installDevPanel({ sounds: this.sounds, previewGas: (p) => this.previewGas(p) });
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
        tick: (ms: number) => app.run && app.apply(tickRun(app.run, ms)),
        hints: () => app.view.hints,
      },
    });
  }

  /** Dev tools: the gas effect on the middle cell of the open run (no state change). */
  private previewGas(protection: number): boolean {
    if (!this.run || $('screen-run').hidden) return false;
    hideModal();
    const f = this.run.floor;
    const idx = Math.floor(f.rows / 2) * f.cols + Math.floor(f.cols / 2);
    const energyLost = Math.round(gasEnergyLoss(this.run.depth) * (1 - protection));
    this.renderer.handleEvents(f, [{ type: 'gas', idx, energyLost, protection }], performance.now());
    this.sounds.gas(protection);
    return true;
  }

  // ---------- Sound ----------

  private unlockAudio() {
    this.sounds.synth.unlock();
    this.music.start();
  }

  private applySoundSettings() {
    const s = this.soundSettings;
    this.sounds.synth.setMuted(s.muted);
    this.sounds.synth.setVolumes({ music: s.musicVolume * CONFIG.music.mix, sfx: s.sfxVolume });
  }

  private updateSoundSettings(patch: Partial<Settings>) {
    this.soundSettings = { ...this.soundSettings, ...patch };
    this.settings.save(this.soundSettings);
    this.applySoundSettings();
  }

  private toggleMute() {
    this.updateSoundSettings({ muted: !this.soundSettings.muted });
    this.renderMute();
    this.sounds.click();
  }

  /** The chosen language, or the browser's when none was chosen. Retranslates the static page texts. */
  private applyLocale() {
    const locale = this.soundSettings.language ?? detectLocale(navigator.languages ?? [navigator.language]);
    setLocale(locale);
    document.documentElement.lang = locale;
    for (const el of document.querySelectorAll<HTMLElement>('[data-i18n]')) el.textContent = t(el.dataset.i18n as MessageKey);
    for (const el of document.querySelectorAll<HTMLElement>('[data-i18n-aria]')) {
      el.setAttribute('aria-label', t(el.dataset.i18nAria as MessageKey));
    }
  }

  /** Switches the language and redraws whatever is on screen (the Settings dialog stays open). */
  private changeLanguage(language: Locale) {
    this.updateSoundSettings({ language });
    this.applyLocale();
    this.renderMute();
    if (this.run) this.updateHud();
    else this.renderHub();
    this.showSettings();
  }

  private showSettings() {
    const s = this.soundSettings;
    const current = s.language ?? detectLocale(navigator.languages ?? [navigator.language]);
    const options = LOCALES.map(
      (l) => `<option value="${l.id}"${l.id === current ? ' selected' : ''}>${l.name}</option>`,
    ).join('');
    const slider = (id: string, label: string, value: number) => `
      <label class="slider-row" for="${id}">
        <span>${label}</span>
        <input type="range" id="${id}" min="0" max="100" step="5" value="${Math.round(value * 100)}" />
        <output id="${id}-out">${Math.round(value * 100)}%</output>
      </label>`;
    showModal(
      `<h2>${t('settings.title')}</h2>
       <div class="sliders">
         ${slider('vol-music', t('sound.music'), s.musicVolume)}
         ${slider('vol-sfx', t('sound.effects'), s.sfxVolume)}
         <label class="slider-row" for="language">
           <span>${t('settings.language')}</span>
           <select id="language" class="lang-select">${options}</select>
         </label>
       </div>
       ${s.muted ? `<p class="muted-note">${t('sound.mutedNote')}</p>` : ''}`,
      [{ label: t('common.done'), primary: true, onClick: () => {} }],
    );
    $<HTMLSelectElement>('language').addEventListener('change', (e) => {
      this.changeLanguage((e.target as HTMLSelectElement).value as Locale);
    });
    const bind = (id: string, key: 'musicVolume' | 'sfxVolume') => {
      const input = $<HTMLInputElement>(id);
      input.addEventListener('input', () => {
        $(`${id}-out`).textContent = `${input.value}%`;
        this.updateSoundSettings({ [key]: Number(input.value) / 100 });
      });
      // Preview the effects level when the thumb is released.
      if (key === 'sfxVolume') input.addEventListener('change', () => this.sounds.buy());
    };
    bind('vol-music', 'musicVolume');
    bind('vol-sfx', 'sfxVolume');
  }

  private renderMute() {
    const muted = this.soundSettings.muted;
    for (const btn of document.querySelectorAll<HTMLElement>('[data-mute]')) {
      btn.textContent = muted ? '🔇' : '🔊';
      btn.setAttribute('aria-label', t(muted ? 'a11y.unmute' : 'a11y.mute'));
      btn.setAttribute('aria-pressed', String(muted));
    }
  }

  // ---------- Screens ----------

  private showHub() {
    cancelAnimationFrame(this.rafId);
    $('screen-run').hidden = true;
    $('screen-hub').hidden = false;
    this.music.setScene({ scene: 'hub' });
    // Back from the Legendary Diamond's silence (the ending, or leaving without picking it up).
    this.music.silence(false);
    this.renderHub();
  }

  private renderHub(justBought?: UpgradeId) {
    $('hub-gems').textContent = String(this.profile.gems);
    $('hub-runs').textContent = String(runsLeft(this.profile));
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
    showModal(`<h2>${t('reset.title')}</h2><p>${t('reset.body')}</p>`, [
      {
        label: t('reset.confirm'),
        className: 'danger',
        onClick: () => {
          this.profile = this.store.reset();
          this.renderHub();
        },
      },
      { label: t('common.cancel'), onClick: () => {} },
    ]);
  }

  private startRun() {
    const seed = this.forcedSeed ?? randomSeed();
    this.forcedSeed = undefined;
    console.info(`[deep-dig] run seed ${seed}`);
    $('screen-hub').hidden = true;
    $('screen-run').hidden = false;
    this.armed = undefined;
    // A banner left with its `show` class would replay its animation when the run screen is shown again.
    for (const id of ['floor-banner', 'rush-banner']) {
      $(id).classList.remove('show', 'long');
      $(id).hidden = true;
    }
    this.setRun(createRun(seed, modifiersFromProfile(this.profile)));
    this.lastFrame = performance.now();
    this.loop(this.lastFrame);
    showBanner($('floor-banner'), t('banner.floor', { n: 1 }));
  }

  private loop = (now: number) => {
    const dt = Math.min(MAX_TICK_MS, now - this.lastFrame);
    this.lastFrame = now;
    if (this.run && dt > 0 && this.canTick(now)) this.tick(dt);
    if (this.run) {
      this.renderMomentum(this.run);
      this.renderer.draw(this.run.floor, this.view, now);
    }
    this.rafId = requestAnimationFrame(this.loop);
  };

  /** Rush time only passes while the player can tap: no modal, tab visible, no floor slide. */
  private canTick(now: number): boolean {
    return this.run?.status === 'playing' && !isModalOpen() && !document.hidden && !this.renderer.isSliding(now);
  }

  /** Lets play time pass. Plain drain/countdown frames skip `apply` (no HUD rebuild every frame). */
  private tick(dt: number) {
    const result = tickRun(this.run!, dt);
    if (result.events.length) this.apply(result);
    else this.run = result.run;
  }

  private setRun(run: RunState) {
    this.run = run;
    this.view = {
      hints: computeHints(run.floor),
      tierColors: hasPerk(run, 'prospector'),
      showChests: hasPerk(run, 'treasureSense'),
      rush: !!run.rush,
    };
    this.music.setScene({
      scene: 'run',
      depth: run.depth,
      lowEnergy: run.energy / run.mods.maxEnergy < LOW_ENERGY,
      rush: !!run.rush,
    });
    this.updateHud();
  }

  /** Applies the result of a game action: new state, effects, and follow-up UI. */
  private apply({ run, events }: ActionResult) {
    const prev = this.run;
    if (run === prev || !prev) return;
    if (events.some((e) => e.type === 'descend')) this.armed = undefined;
    this.setRun(run);
    this.renderer.handleEvents(run.floor, events, performance.now(), !!run.rush);
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
      if (e.type === 'descend') {
        $('floor-banner').classList.remove('long');
        showBanner($('floor-banner'), t('banner.floor', { n: e.depth }));
      }
      if (e.type === 'rushStart') showBanner($('rush-banner'), t('banner.rush'));
      if (e.type === 'floorCleared') {
        const capped = e.multiplier >= CONFIG.cleanBonus.maxMult;
        $('floor-banner').classList.add('long');
        const energy = e.energy
          ? t('banner.cleared.energy', { energy: e.energy })
          : e.energyPending
            ? t('banner.cleared.energyAfterRush', { energy: e.energyPending })
            : '';
        const text = t('banner.cleared', { pct: fmtPct(e.bonus), mult: fmtMult(e.multiplier) });
        showBanner($('floor-banner'), text + (capped ? t('banner.cleared.max') : '') + energy);
        replayClass($('clean-chip'), 'bump');
      }
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
    // Revealed stairs, items and holes always take priority over an armed tool (it stays armed after a pickup).
    const kind = cell.content.kind;
    const tapTarget = cell.open && (kind === 'stairs' || kind === 'hole' || isCollectible(cell.content));
    if (this.armed && !tapTarget) {
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
      // The Legendary Diamond: the music stops on the reveal (the surprise sound plays alone), and the
      // pickup plays the ending.
      if (e.type === 'itemRevealed' && e.content.kind === 'legendary') this.music.silence(true);
      if (e.type === 'legendary') void this.playEnding(e.idx);
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
    const subtitle = source === 'chest' ? t('perk.pick.fromChest') : t('perk.pick.fromFloor', { n: run.depth });
    if (source === 'floor') this.sounds.perkOffer();
    this.music.perkChord();
    // Select, then confirm: a player tapping fast can break a perk chest, and a one-tap pick would choose
    // a perk before they've read the options.
    const cards = choices
      .map(
        (id) => `<button class="btn perk-card" data-perk="${id}" aria-pressed="false">
          ${perkCardHtml(id, run.perks[id] ? t('perk.pick.have', { n: run.perks[id]! }) : '')}</button>`,
      )
      .join('');
    let selected: PerkId | undefined;
    showModal(
      `<h2>${t('perk.pick.title')}</h2><p>${subtitle} ${t('perk.pick.lasts')}</p>
       <div class="perk-choices" role="group" aria-label="${t('a11y.perkChoices')}">${cards}</div>`,
      [
        {
          label: t('perk.pick.take'),
          primary: true,
          className: 'perk-confirm',
          id: 'perk-confirm',
          disabled: true,
          onClick: () => selected && this.apply(choosePerk(run, selected)),
        },
      ],
    );
    for (const card of document.querySelectorAll<HTMLButtonElement>('.perk-choices .perk-card')) {
      card.addEventListener('click', () => {
        selected = card.dataset.perk as PerkId;
        for (const c of document.querySelectorAll('.perk-choices .perk-card')) {
          c.setAttribute('aria-pressed', String(c === card));
        }
        const confirm = $<HTMLButtonElement>('perk-confirm');
        confirm.disabled = false;
        confirm.textContent = t('perk.pick.takeNamed', { name: perkName(selected) });
      });
    }
  }

  private showActivePerks() {
    const run = this.run;
    if (!run || run.status !== 'playing' || isModalOpen()) return;
    const owned = (Object.keys(run.perks) as PerkId[]).filter((id) => hasPerk(run, id));
    const list = owned.length
      ? owned
          .map((id) => `<div class="perk-row">${perkCardHtml(id, run.perks[id]! > 1 ? `×${run.perks[id]}` : '')}</div>`)
          .join('')
      : `<p>${t('perk.active.none', { n: CONFIG.perks.offerEveryFloors })}</p>`;
    showModal(`<h2>${t('perk.active.title')}</h2><div class="perk-list">${list}</div>`, [
      { label: t('common.backToDigging'), primary: true, onClick: () => {} },
    ]);
  }

  /** Gems found this run, per tier: count × value each = subtotal, adding up to the run total. */
  private showGemBreakdown() {
    const run = this.run;
    if (!run || run.status !== 'playing' || isModalOpen()) return;
    const counts = run.stats.gemsByTier;
    const found = GEM_TIERS.filter((tier) => counts[tier]);
    const rows = found
      .map((tier) => {
        const each = gemValue(tier, run.mods.gemValueMult);
        return `<div class="gem-row">
          ${gemIconSvg(tier, 30)}
          <span class="gem-name">${gemName(tier)}</span>
          <span class="gem-math">${counts[tier]} × ${each}</span>
          <strong>= ${counts[tier]! * each}</strong>
        </div>`;
      })
      .join('');
    const body = found.length
      ? `<div class="gem-list">${rows}</div>
         <div class="summary-row highlight"><span>${t('gems.total')}</span><strong>${run.gems}</strong></div>`
      : `<p>${t('gems.none')}</p>`;
    showModal(`<h2>${t('gems.title')}</h2>${body}`, [
      { label: t('common.backToDigging'), primary: true, onClick: () => {} },
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
            return `<span class="perk-chip" title="${perkName(id)}">${PERKS[id].icon}${n > 1 ? `<small>×${n}</small>` : ''}</span>`;
          })
          .join('')
      : `<span class="perk-empty">${t('hud.perksEmpty')}</span>`;
  }

  // ---------- HUD ----------

  private updateHud() {
    const run = this.run;
    if (!run) return;
    $('hud-depth').textContent = t('hud.floor', { n: run.depth });
    const chip = $('clean-chip');
    chip.hidden = run.cleanFloors === 0;
    chip.textContent = `🧹 ×${fmtMult(runMultiplier(run))}`;
    $('hud-gems-value').textContent = String(run.gems);
    $('hud-gem-tiers').innerHTML = gemTiersHtml(run.stats.gemsByTier);
    const ratio = run.energy / run.mods.maxEnergy;
    $('energy-fill').style.width = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
    $('energy-text').textContent = `⚡ ${run.energy} / ${run.mods.maxEnergy}`;
    $('energy').classList.toggle('low', ratio < LOW_ENERGY);
    this.renderMomentum(run);
    this.renderPerkBar(run);
    this.renderToolBar(run);
  }

  /** The Rush meter, or during a Rush the countdown (the same bar, emptying from full). */
  private renderMomentum(run: RunState) {
    const level = run.rush ? run.rush.msLeft / (CONFIG.rush.durationSec * 1000) : run.momentum;
    const pct = Math.max(0, Math.min(1, level)) * 100;
    const meter = $('momentum');
    $('momentum-fill').style.width = `${pct}%`;
    meter.classList.toggle('rush', !!run.rush);
    meter.classList.toggle('hot', !run.rush && run.momentum >= MOMENTUM_HOT);
    meter.setAttribute('aria-valuenow', String(Math.round(pct)));
  }

  private renderToolBar(run: RunState) {
    const pick = `<button class="tool${this.armed ? '' : ' armed'}" data-tool="pickaxe" aria-pressed="${!this.armed}">
        <span class="tool-icon">⛏️</span><span class="tool-name">${toolName('pickaxe')}</span><span class="tool-count">∞</span></button>`;
    const tools = TOOL_IDS.map((id) => {
      const name = toolName(id);
      const locked = run.mods.toolCharges[id] === 0;
      const left = run.tools[id];
      const armed = this.armed === id;
      const count = locked ? '🔒' : String(left);
      const title = locked ? t('tool.locked', { tool: name }) : `${name}: ${toolDescription(id)}`;
      return `<button class="tool${armed ? ' armed' : ''}${locked ? ' locked' : ''}" data-tool="${id}"
          aria-pressed="${armed}" title="${title}" ${locked || left === 0 ? 'disabled' : ''}>
        <span class="tool-icon">${TOOL_ICONS[id]}</span><span class="tool-name">${name}</span><span class="tool-count">${count}</span></button>`;
    });
    $('tool-bar').innerHTML = pick + tools.join('');
    $('grid-wrap').classList.toggle('armed', !!this.armed);
    const hint = $('aim-hint');
    hint.hidden = !this.armed;
    if (this.armed) {
      hint.textContent = t('tool.aim', { icon: TOOL_ICONS[this.armed], description: toolDescription(this.armed) });
    }
  }

  /** Explains the clean floor bonus and shows this run's progress. */
  private showCleanBonus() {
    const run = this.run;
    if (!run || run.status !== 'playing' || isModalOpen()) return;
    const c = CONFIG.cleanBonus;
    showModal(
      `<h2>${t('clean.title')}</h2>
       <p>${t('clean.body', {
         pct1: fmtPct(bonusForDepth(1)),
         pct10: fmtPct(bonusForDepth(10)),
         max: fmtMult(c.maxMult),
         energy1: clearEnergyForDepth(1),
         energy10: clearEnergyForDepth(10),
       })}</p>
       <div class="summary-rows">
         <div class="summary-row"><span>${t('clean.floors')}</span><strong>${run.cleanFloors}</strong></div>
         <div class="summary-row highlight"><span>${t('clean.multiplier')}</span><strong>×${fmtMult(runMultiplier(run))}</strong></div>
       </div>`,
      [{ label: t('common.backToDigging'), primary: true, onClick: () => {} }],
    );
  }

  // ---------- Run endings ----------

  private confirmLeave() {
    if (!this.run || this.run.status !== 'playing' || isModalOpen()) return;
    const mult = runMultiplier(this.run);
    const bonus = mult > 1 ? t('leave.bonus', { gems: this.run.gems, mult: fmtMult(mult) }) : '';
    const kept = `<strong>${gemsKept(this.run.gems, 'left', mult)}</strong>`;
    showModal(
      `<h2>${t('leave.title')}</h2><p>${t('leave.body', { kept, bonus })}</p>`,
      [
        { label: t('leave.confirm'), primary: true, onClick: () => this.finishRun('left') },
        { label: t('leave.cancel'), onClick: () => {} },
      ],
    );
  }

  private showOutOfEnergy(adFailed = false) {
    const run = this.run;
    if (!run || run.status !== 'outOfEnergy') return;
    const mult = runMultiplier(run);
    const kept = gemsKept(run.gems, 'exhausted', mult);
    const keepPct = Math.round(CONFIG.run.exhaustedKeepRatio * 100);
    const bonus = mult > 1 ? t('oom.bonus', { mult: fmtMult(mult) }) : '';
    const offer = !!this.ads && canUseEnergyAd(run);
    // On the last run, running dry loses the game (unless the energy ad can still save it).
    if (!offer && isLastRun(this.profile)) return void this.playFailure();
    const actions: ModalAction[] = [];
    if (offer) {
      actions.push({
        html: t('ad.energy', { n: CONFIG.ads.rewardedEnergy }),
        primary: true,
        onClick: () => void this.watchEnergyAd(),
      });
    }
    actions.push({
      label: t(offer ? 'oom.carriedOut' : 'common.continue'),
      primary: !offer,
      onClick: () => this.finishRun('exhausted'),
    });
    showModal(
      `<h2>${t('oom.title')}</h2>
       ${adFailed ? `<p class="ad-error">${t('ad.failedRetry')}</p>` : ''}
       <p>${t('oom.body', { pct: keepPct, bonus, kept: `<strong>${kept}</strong>`, gems: run.gems })}</p>`,
      actions,
    );
  }

  // ---------- Ads ----------

  /** Plays an ad with game audio paused. Resolves undefined when ads are off. */
  private async playAd<T>(show: (ads: AdService) => Promise<T>): Promise<T | undefined> {
    if (!this.ads) return undefined;
    this.sounds.synth.hold('ad', true);
    try {
      return await show(this.ads);
    } catch (err) {
      console.warn('[deep-dig] ad failed', err);
      return undefined;
    } finally {
      this.sounds.synth.hold('ad', false);
    }
  }

  private async watchEnergyAd() {
    const rewarded = await this.playAd((ads) => ads.showRewarded());
    const run = this.run;
    if (!run) return;
    const saved = rewarded ? grantAdEnergy(run) : run;
    if (saved === run) return this.showOutOfEnergy(true);
    this.setRun(saved);
    this.sounds.reward();
    replayClass($('energy'), 'gain');
  }

  private async watchDoubleAd(summary: RunSummary, newBest: boolean) {
    const rewarded = await this.playAd((ads) => ads.showRewarded());
    if (!rewarded) return this.showSummary(summary, newBest, { adFailed: true });
    const doubled = doubleRunGems(this.profile, summary);
    this.setProfile(doubled.profile);
    this.sounds.reward();
    this.showSummary(doubled.summary, newBest);
  }

  /** Summary → hub, with an occasional interstitial in between (never during a run). */
  private async leaveSummary() {
    if (shouldShowInterstitial(this.profile.runsCompleted)) await this.playAd((ads) => ads.showInterstitial());
    this.showHub();
  }

  private finishRun(reason: EndReason) {
    if (!this.run) return;
    // The last run ended without the Legendary Diamond: the game is lost.
    if (isLastRun(this.profile)) return void this.playFailure();
    const { summary } = endRun(this.run, reason);
    this.run = undefined;
    const { profile, newBest } = applyRunResult(this.profile, summary);
    this.setProfile(profile);
    this.showSummary(summary, newBest, { fanfare: true });
  }

  /** The lost game (see `playFailure`). Like winning, progress resets and the player is back on the hub. */
  private async playFailure() {
    if (!this.run) return;
    this.music.silence(true);
    let stopSong = () => {};
    await playFailure({
      onSong: () => (stopSong = this.music.defeat()),
      title: t('ending.failed'),
      hint: t('ending.hint'),
    });
    stopSong();
    this.run = undefined;
    this.profile = this.store.reset();
    this.showHub();
  }

  /** The game's ending (see `playEnding`). The game is over: progress resets and the player is back on the hub. */
  private async playEnding(idx: number) {
    const run = this.run;
    if (!run) return;
    let stopSong = () => {};
    await playEnding({
      from: this.renderer.cellClientCenter(run.floor, idx),
      size: this.renderer.cellPixels(run.floor) * 0.7,
      reducedMotion: this.renderer.reducedMotion,
      onSong: () => (stopSong = this.music.victory()),
      hint: t('ending.hint'),
    });
    stopSong();
    this.run = undefined;
    // Like "Reset progress": device settings (sound, language) stay.
    this.profile = this.store.reset();
    this.showHub();
  }

  private showSummary(s: RunSummary, newBest: boolean, opts: { adFailed?: boolean; fanfare?: boolean } = {}) {
    if (opts.fanfare) {
      if (newBest) this.sounds.newBest();
      else this.sounds.runEnd(s.reason === 'left');
    }
    const actions: ModalAction[] = [];
    if (this.ads && s.gemsKept > 0 && !s.gemsDoubled) {
      const bonus = s.gemsKept * (CONFIG.ads.gemMultiplier - 1);
      actions.push({
        html: t('ad.double', { bonus: `<span class="ad-bonus">+${bonus}</span>` }),
        className: 'ad-btn',
        onClick: () => void this.watchDoubleAd(s, newBest),
      });
    }
    actions.push({ label: t('common.continue'), primary: true, onClick: () => void this.leaveSummary() });
    const title = t(s.reason === 'left' ? 'summary.titleLeft' : 'summary.titleExhausted');
    showModal(
      `${newBest ? `<div class="badge">${t('summary.newBest')}</div>` : ''}
       <h2>${title}</h2>
       <div class="summary-rows">
         <div class="summary-row"><span>${t('summary.depth')}</span><strong>${t('summary.depthValue', { n: s.depth })}</strong></div>
         <div class="summary-row"><span>${t('summary.blocks')}</span><strong>${s.blocksBroken}</strong></div>
         <div class="summary-row"><span>${t('summary.gemsFound')}</span><strong>${s.gemsFound}</strong></div>
         ${Object.keys(s.gemsByTier).length ? `<div class="summary-row gem-tiers-row">${gemTiersHtml(s.gemsByTier)}</div>` : ''}
         ${s.cleanFloors ? `<div class="summary-row"><span>${t('summary.clean', { n: s.cleanFloors, mult: fmtMult(s.multiplier) })}</span><strong>+${s.bonusGems}</strong></div>` : ''}
         <div class="summary-row highlight${s.gemsDoubled ? ' doubled' : ''}"><span>${t('summary.gemsKept')}${s.gemsDoubled ? ` <em>×${CONFIG.ads.gemMultiplier}</em>` : ''}</span><strong>${s.gemsKept}</strong></div>
       </div>
       ${opts.adFailed ? `<p class="ad-error">${t('ad.failed')}</p>` : ''}
       <div class="seed">${t('summary.seed', { n: s.seed })}</div>`,
      actions,
    );
  }
}

/** Per-tier gem counts (icon + count), lowest tier first. Tiers not found yet are left out. */
function gemTiersHtml(counts: RunSummary['gemsByTier']): string {
  return GEM_TIERS.filter((tier) => counts[tier])
    .map((tier) => `<span class="gem-tier">${gemIconSvg(tier)}${counts[tier]}</span>`)
    .join('');
}

/** A perk's icon, name and description, with an optional stack note after the name. */
function perkCardHtml(id: PerkId, stackNote: string): string {
  const stack = stackNote ? ` <span class="perk-stack">${stackNote}</span>` : '';
  return `<span class="perk-icon">${PERKS[id].icon}</span>
    <span class="perk-text"><strong>${perkName(id)}${stack}</strong><span>${perkDescription(id)}</span></span>`;
}

/** A multiplier with up to two decimals in the current language, e.g. 1.12 (en) or 1,12 (pt-BR). */
function fmtMult(m: number): string {
  return fmtNumber(m, 2);
}

function parseSeedParam(): number | undefined {
  const raw = new URLSearchParams(location.search).get('seed');
  if (raw === null) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n >>> 0 : undefined;
}
