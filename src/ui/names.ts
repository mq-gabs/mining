import { CONFIG, type GemTier, type ToolId, type UpgradeId } from '../config';
import type { PerkId } from '../game/types';
import { fmtPct, t } from '../i18n';

const P = CONFIG.perks;

/** A tool's area as text, e.g. radius 1 -> "3×3". */
const area = (radius: number) => `${radius * 2 + 1}×${radius * 2 + 1}`;

export const perkName = (id: PerkId) => t(`perk.${id}` as const);
export const upgradeName = (id: UpgradeId) => t(`upgrade.${id}` as const);
export const gemName = (tier: GemTier) => t(`gem.${tier}` as const);
export const toolName = (id: ToolId | 'pickaxe') => t(`tool.${id}` as const);

/** A perk's effect in the current language, with its numbers from the config. */
export function perkDescription(id: PerkId): string {
  switch (id) {
    case 'sharpEdge':
      return t('perk.sharpEdge.desc', { n: P.sharpEdge.power });
    case 'secondWind':
      return t('perk.secondWind.desc', { n: P.secondWind.energy });
    case 'luckyStrike':
      return t('perk.luckyStrike.desc', { pct: fmtPct(P.luckyStrike.chance) });
    case 'tremor':
      return t('perk.tremor.desc', { n: P.tremor.damage });
    case 'efficientSwing':
      return t('perk.efficientSwing.desc', { pct: fmtPct(P.efficientSwing.chance) });
    case 'deepBreath':
      return t('perk.deepBreath.desc', { n: P.deepBreath.energy });
    case 'greed':
      return t('perk.greed.desc', { pct: fmtPct(P.greed.gemValueBonus), n: P.greed.maxEnergyPenalty });
    case 'gasMask':
    case 'prospector':
    case 'treasureSense':
      return t(`perk.${id}.desc` as const);
  }
}

/** What a tool does, in the current language (tool bar tooltip, aim hint, shop unlock row). */
export function toolDescription(id: ToolId): string {
  switch (id) {
    case 'dynamite':
      return t('tool.dynamite.desc', { area: area(CONFIG.tools.dynamite.radius) });
    case 'drill':
      return t('tool.drill.desc');
    case 'scanner':
      return t('tool.scanner.desc', { area: area(CONFIG.tools.scanner.radius) });
  }
}
