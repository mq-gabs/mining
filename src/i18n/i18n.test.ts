import { afterEach, describe, expect, it } from 'vitest';
import { GEM_TIERS, TOOL_IDS, UPGRADE_IDS } from '../config';
import { PERK_IDS } from '../game/perks';
import { parseSettings } from '../platform/storage';
import { gemName, perkDescription, perkName, toolDescription, toolName, upgradeName } from '../ui/names';
import { en, type MessageKey } from './en';
import { detectLocale, fmtNumber, fmtPct, LOCALES, setLocale, t, tn } from './index';
import { ptBR } from './pt-BR';

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

afterEach(() => setLocale('en'));

describe('translation tables', () => {
  it('Portuguese uses the same placeholders as English for every key, and no text is empty', () => {
    for (const key of Object.keys(en) as MessageKey[]) {
      expect(placeholders(ptBR[key]), key).toEqual(placeholders(en[key]));
      expect(ptBR[key].trim(), key).not.toBe('');
    }
  });

  it('every perk, tool, upgrade and gem has a name, and descriptions have no unfilled placeholder', () => {
    for (const { id } of LOCALES) {
      setLocale(id);
      const texts = [
        ...PERK_IDS.flatMap((p) => [perkName(p), perkDescription(p)]),
        ...TOOL_IDS.flatMap((tool) => [toolName(tool), toolDescription(tool)]),
        toolName('pickaxe'),
        ...UPGRADE_IDS.map(upgradeName),
        ...GEM_TIERS.map(gemName),
      ];
      for (const text of texts) {
        expect(text).not.toBe('');
        expect(text).not.toMatch(/\{\w+\}/);
      }
    }
  });
});

describe('t and tn', () => {
  it('fills placeholders, and leaves unknown ones visible', () => {
    expect(t('hud.floor', { n: 3 })).toBe('Floor 3');
    expect(t('hud.floor')).toBe('Floor {n}');
    setLocale('pt-BR');
    expect(t('hud.floor', { n: 3 })).toBe('Andar 3');
    expect(t('perk.pick.title')).toBe('Escolha um bônus');
  });

  it('picks the plural form by the language rules', () => {
    expect(tn('shop.unlock.charges', 1)).toBe('1 charge per run.');
    expect(tn('shop.unlock.charges', 2)).toBe('2 charges per run.');
    setLocale('pt-BR');
    expect(tn('float.rushEnd', 1, { gems: 5 })).toBe('Rush! 1 bloco · +5 💎');
    expect(tn('float.rushEnd', 14, { gems: 86 })).toBe('Rush! 14 blocos · +86 💎');
  });

  it('formats numbers for the language', () => {
    expect(fmtNumber(1.12)).toBe('1.12');
    expect(fmtPct(0.06)).toBe('6%');
    setLocale('pt-BR');
    expect(fmtNumber(1.12)).toBe('1,12');
    expect(fmtNumber(1.5)).toBe('1,5');
    expect(fmtPct(0.06)).toBe('6%');
  });
});

describe('language choice', () => {
  it('follows the browser: any Portuguese variant is pt-BR, anything unknown is English', () => {
    expect(detectLocale(['pt-BR', 'en'])).toBe('pt-BR');
    expect(detectLocale(['pt-PT'])).toBe('pt-BR');
    expect(detectLocale(['de-DE', 'en-US'])).toBe('en');
    expect(detectLocale(['fr'])).toBe('en');
    expect(detectLocale([])).toBe('en');
  });

  it('keeps a saved language only when it is supported', () => {
    expect(parseSettings({ language: 'pt-BR' }).language).toBe('pt-BR');
    expect(parseSettings({ language: 'xx' }).language).toBeUndefined();
    expect(parseSettings({}).language).toBeUndefined();
  });
});
