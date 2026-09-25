import { CONFIG, GEM_TIERS, type BlockType } from '../config';
import { fmtPct, t, type MessageKey } from '../i18n';
import { PERKS } from '../game/perks';
import { upgradeName } from './names';
import { BLOCK_COLORS, CRYSTAL_COLOR, DUST_COLOR, gemIconSvg, GEM_COLORS, SPARKLE_COLOR, type GemLook } from './theme';

/**
 * The "How to play" screen: a few slides, each a small illustration drawn with the game's own colors and
 * icons, a title and one or two sentences. Swipe, the arrow keys or the buttons move between them. Every
 * number comes from `CONFIG`, so the tutorial follows balance changes.
 */

/** A block tile, painted like the grid's (same colors), with optional content on top. */
function tile(block: BlockType, inner = '', cls = ''): string {
  const c = BLOCK_COLORS[block];
  return `<span class="hv-tile ${cls}" style="--top:${c.top};--bottom:${c.bottom}">${inner}</span>`;
}

/** An open (dug) cell. */
const open = (inner = '', cls = '') => `<span class="hv-tile open ${cls}">${inner}</span>`;
const gem = (look: GemLook, size = 22) => gemIconSvg(look, size);
const sparkles = `<span class="hv-sparkles" style="--c:${SPARKLE_COLOR}">✦<i>✦</i><b>✦</b></span>`;
const dust = `<span class="hv-dust" style="--c:${DUST_COLOR}"><i></i><i></i><i></i><i></i></span>`;
const arrow = '<span class="hv-arrow" aria-hidden="true">→</span>';
/** Gems as money: the same icon as the hub's gem counter. */
const money = '<span class="gem-icon"></span>';

interface Slide {
  visual: () => string;
  title: MessageKey;
  body: () => string;
}

const SLIDES: Slide[] = [
  {
    // The goal: a shaft down to floor 12, and the runs to get there.
    visual: () => {
      const floors = ['1', '2', '⋮', String(CONFIG.goal.depth - 1)]
        .map((f) => `<span class="hv-floor${f === '⋮' ? ' dots' : ''}">${f}</span>`)
        .join('');
      const pips = Array.from({ length: CONFIG.goal.maxRuns }, () => '<span class="hv-pip">⛏️</span>').join('');
      return `<div class="hv-goal">
          <div class="hv-shaft">${floors}<span class="hv-floor goal">${CONFIG.goal.depth} ${gem('legendary', 26)}</span></div>
          <div class="hv-runs"><div class="hv-pips">${pips}</div><span>${t('help.goal.runs', { n: CONFIG.goal.maxRuns })}</span></div>
        </div>`;
    },
    title: 'help.goal.title',
    body: () => t('help.goal.body', { depth: CONFIG.goal.depth, runs: CONFIG.goal.maxRuns }),
  },
  {
    // Tapping a block next to the tunnel: the finger taps, the block shakes, energy ticks down.
    visual: () => `<div class="hv-dig">
        <div class="hv-grid cols-3">
          ${tile('dirt')}${open('', 'entrance')}${tile('stone')}
          ${tile('stone')}${tile('dirt', '<span class="hv-finger">👆</span>', 'hv-hit')}${tile('dirt')}
          ${tile('dirt')}${tile('stone')}${tile('dirt')}
        </div>
        <div class="hv-energy"><span class="hv-energy-bar"><i></i></span><span class="hv-cost">−${CONFIG.energy.tapCost}⚡</span></div>
      </div>`,
    title: 'help.dig.title',
    body: () => t('help.dig.body', { cost: CONFIG.energy.tapCost }),
  },
  {
    // Block hardness: taps needed with the starting pickaxe.
    visual: () => {
      const blocks: BlockType[] = ['dirt', 'stone', 'hard', 'obsidian'];
      const cells = blocks
        .map((b) => {
          const taps = Math.ceil(CONFIG.blocks[b].hp / CONFIG.pickaxe.basePower);
          return `<div class="hv-block">${tile(b, '', 'big')}<strong>👆×${taps}</strong><span>${t(`help.block.${b}`)}</span></div>`;
        })
        .join('');
      return `<div class="hv-blocks">${cells}</div>`;
    },
    title: 'help.blocks.title',
    body: () => t('help.blocks.body'),
  },
  {
    // Two-step items: break, the item lies in the open cell, tap to pick it up. Then what's out there.
    visual: () => {
      const tiers = GEM_TIERS.map((tier) => `<span class="hv-chip">${gem(tier, 16)}${CONFIG.gems.tiers[tier].value}</span>`).join('');
      return `<div class="hv-items">
          <div class="hv-row">${tile('stone', sparkles, 'big')}${arrow}${open(`<span class="hv-glow" style="--c:${GEM_COLORS.amethyst}">${gem('amethyst', 26)}</span>`, 'big')}${arrow}<span class="hv-gain">+${CONFIG.gems.tiers.amethyst.value} ${gem('amethyst', 18)}</span></div>
          <div class="hv-row hv-chips">${tiers}<span class="hv-chip" style="color:${CRYSTAL_COLOR}">⚡+${CONFIG.crystal.energy}</span><span class="hv-chip">🧰</span></div>
        </div>`;
    },
    title: 'help.items.title',
    body: () => t('help.items.body'),
  },
  {
    // Hints: sparkles next to gems, dust next to hazards, and what the hazards do.
    visual: () => `<div class="hv-hints">
        <div class="hv-row">
          <div class="hv-block">${tile('stone', sparkles, 'big')}<span>${t('help.hints.gem')}</span></div>
          <div class="hv-block">${tile('dirt', dust, 'big')}<span>${t('help.hints.danger')}</span></div>
        </div>
        <div class="hv-row hv-chips">
          <span class="hv-chip">☁️ −${CONFIG.hazards.gasEnergyLoss.base}⚡</span>
          <span class="hv-chip">🪨 ↺</span>
          <span class="hv-chip">🕳️ −${fmtPct(CONFIG.hazards.hole.share)} ${money}</span>
        </div>
      </div>`,
    title: 'help.hints.title',
    body: () => t('help.hints.body'),
  },
  {
    // The stairs hide in the bottom rows (tinted).
    visual: () => {
      const { stairsBottomRows } = CONFIG.grid;
      // A smaller grid than the real one, with the stairs zone tinted.
      const shown = { cols: 5, rows: 6 };
      const zoneFrom = shown.rows - Math.min(stairsBottomRows, shown.rows - 1);
      const cells: string[] = [];
      for (let r = 0; r < shown.rows; r++) {
        for (let c = 0; c < shown.cols; c++) {
          const zone = r >= zoneFrom ? ' zone' : '';
          if (r === 0 && c === 2) cells.push(open('', 'entrance small'));
          else if (r === 0 && c === 1) cells.push(open('', 'small'));
          else if (r === shown.rows - 2 && c === 3) cells.push(open('<span class="hv-ladder">🪜</span>', `small${zone}`));
          else cells.push(tile((r + c) % 3 === 0 ? 'stone' : 'dirt', '', `small${zone}`));
        }
      }
      return `<div class="hv-stairs"><div class="hv-grid cols-5">${cells.join('')}</div><span class="hv-zone-label">↕ ${stairsBottomRows}</span></div>`;
    },
    title: 'help.stairs.title',
    body: () => t('help.stairs.body', { rows: CONFIG.grid.stairsBottomRows }),
  },
  {
    // Leaving keeps everything; running dry keeps a share.
    visual: () => `<div class="hv-leave">
        <div class="hv-outcome good"><span class="hv-btn">${t('hud.leave')}</span>${arrow}<strong>${money} 100%</strong></div>
        <div class="hv-outcome bad"><span class="hv-btn dry">⚡ 0</span>${arrow}<strong>${money} ${fmtPct(CONFIG.run.exhaustedKeepRatio)}</strong></div>
      </div>`,
    title: 'help.leave.title',
    body: () => t('help.leave.body', { pct: fmtPct(CONFIG.run.exhaustedKeepRatio) }),
  },
  {
    // Gems buy upgrades between runs.
    visual: () => {
      const rows = (['power', 'energy', 'luck', 'dynamite'] as const)
        .map((id) => `<div class="hv-shop-row"><span>${CONFIG.upgrades.items[id].icon}</span><strong>${upgradeName(id)}</strong><em>${money} ${CONFIG.upgrades.items[id].baseCost}</em></div>`)
        .join('');
      return `<div class="hv-shop">${rows}</div>`;
    },
    title: 'help.upgrades.title',
    body: () => t('help.upgrades.body'),
  },
  {
    // The Rush meter, and perk cards.
    visual: () => {
      const perks = (['sharpEdge', 'secondWind', 'luckyStrike'] as const).map((id) => `<span class="hv-perk">${PERKS[id].icon}</span>`).join('');
      return `<div class="hv-rush">
          <div class="hv-meter"><i></i></div>
          <span class="hv-rush-label">${t('banner.rush')}</span>
          <div class="hv-perks">${perks}</div>
        </div>`;
    },
    title: 'help.rush.title',
    body: () => t('help.rush.body', { sec: CONFIG.rush.durationSec, n: CONFIG.perks.offerEveryFloors }),
  },
];

/**
 * Fills `root` with the tutorial (rebuilt on every open, so it's in the current language) and calls
 * `onClose` from the back button or the last slide's button.
 */
export function renderHowToPlay(root: HTMLElement, onClose: () => void) {
  root.innerHTML = `
    <header class="help-header">
      <button class="icon-btn help-close" aria-label="${t('help.close')}">←</button>
      <h2>${t('help.title')}</h2>
      <span class="help-count" aria-live="polite"></span>
    </header>
    <div class="help-viewport">
      <div class="help-track">
        ${SLIDES.map(
          (s, i) => `<article class="help-slide" aria-roledescription="slide" aria-label="${i + 1} / ${SLIDES.length}">
            <div class="help-visual">${s.visual()}</div>
            <h3>${t(s.title)}</h3>
            <p>${s.body()}</p>
          </article>`,
        ).join('')}
      </div>
    </div>
    <div class="help-dots">${SLIDES.map((_, i) => `<button class="help-dot" data-slide="${i}" aria-label="${i + 1}"></button>`).join('')}</div>
    <footer class="help-nav">
      <button class="btn help-prev">${t('help.back')}</button>
      <button class="btn primary help-next"></button>
    </footer>`;

  const q = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const track = q('.help-track');
  const slides = [...root.querySelectorAll<HTMLElement>('.help-slide')];
  const dots = [...root.querySelectorAll<HTMLElement>('.help-dot')];
  const prev = q<HTMLButtonElement>('.help-prev');
  const next = q<HTMLButtonElement>('.help-next');
  let index = 0;

  const show = (i: number) => {
    index = Math.max(0, Math.min(SLIDES.length - 1, i));
    track.style.transform = `translateX(${-index * 100}%)`;
    slides.forEach((s, n) => s.setAttribute('aria-hidden', String(n !== index)));
    dots.forEach((d, n) => d.classList.toggle('active', n === index));
    q('.help-count').textContent = `${index + 1} / ${SLIDES.length}`;
    prev.disabled = index === 0;
    next.textContent = t(index === SLIDES.length - 1 ? 'help.done' : 'help.next');
  };
  const close = () => {
    document.removeEventListener('keydown', onKey);
    onClose();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') show(index + 1);
    else if (e.key === 'ArrowLeft') show(index - 1);
    else if (e.key === 'Escape') close();
  };

  prev.addEventListener('click', () => show(index - 1));
  next.addEventListener('click', () => (index === SLIDES.length - 1 ? close() : show(index + 1)));
  q('.help-close').addEventListener('click', close);
  for (const d of dots) d.addEventListener('click', () => show(Number(d.dataset.slide)));
  document.addEventListener('keydown', onKey);

  // Swipe between slides.
  const viewport = q('.help-viewport');
  let startX: number | undefined;
  viewport.addEventListener('pointerdown', (e) => (startX = e.clientX));
  viewport.addEventListener('pointerup', (e) => {
    if (startX === undefined) return;
    const dx = e.clientX - startX;
    startX = undefined;
    if (Math.abs(dx) > 40) show(index + (dx < 0 ? 1 : -1));
  });

  show(0);
}
