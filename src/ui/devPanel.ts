import { CONFIG } from '../config';
import { gasEnergyLoss } from '../game/economy';
import { showModal } from './modal';
import type { Sounds } from './sounds';

/**
 * Behind the `devTools` feature flag: a 🛠 button (or the ` key) opens a panel of test tools. It's not player-facing,
 * so its texts are plain English, not translated. Add a tool by adding a section to `SECTIONS`.
 * Buttons in a section use `.dev-sfx`, so the global button click sound stays out of the way.
 */
export interface DevContext {
  sounds: Sounds;
}

interface DevSection {
  title: string;
  html: () => string;
  /** Binds the section's controls after the panel is shown. */
  bind: (root: HTMLElement, ctx: DevContext) => void;
}

/** Gas damage sound at every Gas Mask level (0 = no mask). */
const gasSound: DevSection = {
  title: 'Gas sound by mask level',
  html: () => {
    const { reduction, maxStacks } = CONFIG.perks.gasMask;
    const loss = gasEnergyLoss(1);
    const buttons = Array.from({ length: maxStacks + 1 }, (_, stacks) => {
      const protection = Math.min(1, stacks * reduction);
      const lost = Math.round(loss * (1 - protection));
      const label = stacks === 0 ? 'No mask' : `😷 ×${stacks}`;
      return `<button class="btn dev-sfx" data-protection="${protection}">${label} · −${lost}⚡</button>`;
    }).join('');
    return `<div class="dev-row">${buttons}</div>
      <button class="btn dev-sfx" data-gas-sweep>Play all, one after another</button>`;
  },
  bind: (root, { sounds }) => {
    for (const btn of root.querySelectorAll<HTMLElement>('[data-protection]')) {
      btn.addEventListener('click', () => sounds.gas(Number(btn.dataset.protection)));
    }
    root.querySelector('[data-gas-sweep]')?.addEventListener('click', () => {
      const { reduction, maxStacks } = CONFIG.perks.gasMask;
      for (let stacks = 0; stacks <= maxStacks; stacks++) {
        setTimeout(() => sounds.gas(Math.min(1, stacks * reduction)), stacks * 700);
      }
    });
  },
};

const SECTIONS: DevSection[] = [gasSound];

export function showDevPanel(ctx: DevContext) {
  const body = SECTIONS.map((s, i) => `<section class="dev-section" data-dev="${i}"><h3>${s.title}</h3>${s.html()}</section>`);
  showModal(`<h2>🛠 Dev tools</h2>${body.join('')}`, [{ label: 'Close', primary: true, onClick: () => {} }]);
  SECTIONS.forEach((s, i) => s.bind(document.querySelector<HTMLElement>(`[data-dev="${i}"]`)!, ctx));
}

/** Adds the floating 🛠 button and the ` shortcut. Call only when the `devTools` flag is on. */
export function installDevPanel(ctx: DevContext) {
  const btn = document.createElement('button');
  btn.className = 'icon-btn dev-fab';
  btn.textContent = '🛠';
  btn.setAttribute('aria-label', 'Dev tools');
  btn.addEventListener('click', () => showDevPanel(ctx));
  document.body.append(btn);
  document.addEventListener('keydown', (e) => {
    if (e.key === '`' && !e.repeat) showDevPanel(ctx);
  });
}
