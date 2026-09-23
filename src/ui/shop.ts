import { CONFIG, UPGRADE_IDS, type UpgradeId } from '../config';
import {
  canBuyUpgrade,
  isUpgradeAvailable,
  modifiersFromProfile,
  upgradeCost,
  upgradeDef,
  type Profile,
} from '../game/progression';
import type { RunModifiers } from '../game/types';
import { TOOL_META } from './tools';

const pct = (n: number) => `${Math.round(n * 100)}%`;

/** "current → next" description of what an upgrade level changes. */
const EFFECT_TEXT: Record<UpgradeId, (m: RunModifiers) => string> = {
  power: (m) => `Power ${m.power}`,
  energy: (m) => `Max energy ${m.maxEnergy}`,
  luck: (m) => `Gem chance +${pct(m.gemChanceBonus)}`,
  gemValue: (m) => `Gem value ×${m.gemValueMult.toFixed(1)}`,
  dynamite: (m) => `Charges ${m.toolCharges.dynamite}`,
  drillUnlock: () => '',
  drill: (m) => `Charges ${m.toolCharges.drill}`,
  scannerUnlock: () => '',
  scanner: (m) => `Charges ${m.toolCharges.scanner}`,
};

function effectLine(profile: Profile, id: UpgradeId, maxed: boolean): string {
  const unlocks = upgradeDef(id).unlocks;
  if (unlocks) {
    const n = CONFIG.tools[unlocks].baseCharges;
    return `${TOOL_META[unlocks].description} ${n} charge${n === 1 ? '' : 's'} per run.`;
  }
  const now = EFFECT_TEXT[id](modifiersFromProfile(profile));
  if (maxed) return now;
  const next = { ...profile, upgrades: { ...profile.upgrades, [id]: profile.upgrades[id] + 1 } };
  const after = EFFECT_TEXT[id](modifiersFromProfile(next)).replace(/^[^\d+×]*/, '');
  return `${now} → ${after}`;
}

export function renderShop(
  list: HTMLElement,
  profile: Profile,
  onBuy: (id: UpgradeId) => void,
  justBought?: UpgradeId,
) {
  // Charge upgrades appear once their tool is unlocked, and replace the unlock row.
  const shown = UPGRADE_IDS.filter(
    (id) => isUpgradeAvailable(profile.upgrades, id) && !(upgradeDef(id).unlocks && profile.upgrades[id] > 0),
  );
  list.replaceChildren(
    ...shown.map((id) => {
      const item = CONFIG.upgrades.items[id];
      const level = profile.upgrades[id];
      const cost = upgradeCost(id, level);
      const maxed = cost === undefined;

      const li = document.createElement('li');
      li.className = `shop-item${id === justBought ? ' bought' : ''}`;
      li.innerHTML = `
        <div class="shop-icon">${item.icon}</div>
        <div class="shop-info">
          <div><span class="shop-name">${item.name}</span>${item.maxLevel > 1 ? `<span class="shop-level">Lv ${level}/${item.maxLevel}</span>` : ''}</div>
          <div class="shop-effect">${effectLine(profile, id, maxed)}</div>
          ${item.maxLevel > 1 ? `<div class="pips">${'<span class="pip on"></span>'.repeat(level)}${'<span class="pip"></span>'.repeat(item.maxLevel - level)}</div>` : ''}
        </div>`;

      const btn = document.createElement('button');
      btn.className = `btn primary buy-btn${maxed ? ' maxed' : ''}`;
      if (maxed) {
        btn.textContent = 'MAX';
        btn.disabled = true;
      } else {
        btn.innerHTML = `<span class="gem-icon"></span>${cost}`;
        btn.disabled = !canBuyUpgrade(profile, id);
        btn.setAttribute('aria-label', `Buy ${item.name} for ${cost} gems`);
        btn.addEventListener('click', () => onBuy(id));
      }
      li.append(btn);
      return li;
    }),
  );
}
