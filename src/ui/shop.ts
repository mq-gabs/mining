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
import { fmtNumber, fmtPct, t, tn } from '../i18n';
import { toolDescription, upgradeName } from './names';

/**
 * What an upgrade level gives, as `[text, value]`: the shop shows "text → next value", so only the value is
 * repeated after the arrow (e.g. "Power 2 → 3").
 */
const EFFECT: Record<UpgradeId, (m: RunModifiers) => [string, string]> = {
  power: (m) => [t('shop.effect.power', { n: m.power }), String(m.power)],
  energy: (m) => [t('shop.effect.energy', { n: m.maxEnergy }), String(m.maxEnergy)],
  luck: (m) => [t('shop.effect.luck', { pct: fmtPct(m.gemChanceBonus) }), `+${fmtPct(m.gemChanceBonus)}`],
  gemValue: (m) => {
    const mult = fmtNumber(m.gemValueMult, 1, 1);
    return [t('shop.effect.gemValue', { mult }), `×${mult}`];
  },
  dynamite: (m) => [t('shop.effect.charges', { n: m.toolCharges.dynamite }), String(m.toolCharges.dynamite)],
  drillUnlock: () => ['', ''],
  drill: (m) => [t('shop.effect.charges', { n: m.toolCharges.drill }), String(m.toolCharges.drill)],
  scannerUnlock: () => ['', ''],
  scanner: (m) => [t('shop.effect.charges', { n: m.toolCharges.scanner }), String(m.toolCharges.scanner)],
};

function effectLine(profile: Profile, id: UpgradeId, maxed: boolean): string {
  const unlocks = upgradeDef(id).unlocks;
  if (unlocks) {
    const n = CONFIG.tools[unlocks].baseCharges;
    return `${toolDescription(unlocks)} ${tn('shop.unlock.charges', n)}`;
  }
  const [now] = EFFECT[id](modifiersFromProfile(profile));
  if (maxed) return now;
  const next = { ...profile, upgrades: { ...profile.upgrades, [id]: profile.upgrades[id] + 1 } };
  const [, after] = EFFECT[id](modifiersFromProfile(next));
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
          <div><span class="shop-name">${upgradeName(id)}</span>${item.maxLevel > 1 ? `<span class="shop-level">${t('shop.level', { level, max: item.maxLevel })}</span>` : ''}</div>
          <div class="shop-effect">${effectLine(profile, id, maxed)}</div>
          ${item.maxLevel > 1 ? `<div class="pips">${'<span class="pip on"></span>'.repeat(level)}${'<span class="pip"></span>'.repeat(item.maxLevel - level)}</div>` : ''}
        </div>`;

      const btn = document.createElement('button');
      btn.className = `btn primary buy-btn${maxed ? ' maxed' : ''}`;
      if (maxed) {
        btn.textContent = t('shop.max');
        btn.disabled = true;
      } else {
        btn.innerHTML = `<span class="gem-icon"></span>${cost}`;
        btn.disabled = !canBuyUpgrade(profile, id);
        btn.setAttribute('aria-label', t('a11y.buy', { name: upgradeName(id), cost }));
        btn.addEventListener('click', () => onBuy(id));
      }
      li.append(btn);
      return li;
    }),
  );
}
