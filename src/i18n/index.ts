import { en, type MessageKey } from './en';
import { ptBR } from './pt-BR';

export type { MessageKey };
export type Locale = 'en' | 'pt-BR';

/** Languages offered in Settings, each named in itself. */
export const LOCALES: { id: Locale; name: string }[] = [
  { id: 'en', name: 'English' },
  { id: 'pt-BR', name: 'Português' },
];

const TABLES: Record<Locale, Record<MessageKey, string>> = { en, 'pt-BR': ptBR };

/** Keys that have `.one` / `.other` plural forms, without the suffix. */
export type PluralKey = { [K in MessageKey]: K extends `${infer Base}.one` ? Base : never }[MessageKey];

type Params = Record<string, string | number>;

let current: Locale = 'en';

export function getLocale(): Locale {
  return current;
}

export function setLocale(locale: Locale) {
  current = locale;
}

export function isLocale(value: unknown): value is Locale {
  return LOCALES.some((l) => l.id === value);
}

/** Picks the first supported language from the browser's list (e.g. `navigator.languages`); English otherwise. */
export function detectLocale(languages: readonly string[]): Locale {
  for (const lang of languages) {
    const l = lang.toLowerCase();
    if (l.startsWith('pt')) return 'pt-BR';
    if (l.startsWith('en')) return 'en';
  }
  return 'en';
}

/**
 * The text for `key` in the current language, with `{name}` placeholders filled from `params`. Values are
 * inserted as-is (callers may pass trusted markup such as `<strong>12</strong>`); a missing param stays visible.
 */
export function t(key: MessageKey, params: Params = {}): string {
  const text = TABLES[current][key] ?? en[key];
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

/** A plural text: picks `key.one` or `key.other` for `n` by the language's plural rules, with `{n}` set. */
export function tn(key: PluralKey, n: number, params: Params = {}): string {
  const form = new Intl.PluralRules(current).select(n) === 'one' ? 'one' : 'other';
  return t(`${key}.${form}` as MessageKey, { n: fmtNumber(n), ...params });
}

/** A number in the current language's format, with `minDecimals` to `maxDecimals` decimals (pt-BR: `1,12`). */
export function fmtNumber(n: number, maxDecimals = 2, minDecimals = 0): string {
  return new Intl.NumberFormat(current, {
    minimumFractionDigits: minDecimals,
    maximumFractionDigits: maxDecimals,
  }).format(n);
}

/** A share as a whole percent, e.g. 0.06 -> "6%". */
export function fmtPct(share: number): string {
  return new Intl.NumberFormat(current, { style: 'percent', maximumFractionDigits: 0 }).format(share);
}
