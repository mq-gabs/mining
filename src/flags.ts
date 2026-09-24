/**
 * Feature flags: the single place that decides which optional features are on.
 * Add a flag by adding it to `FlagName` and `DEFAULT_FLAGS`, then check it with `isEnabled`.
 *
 * Precedence (last wins):
 *   1. `DEFAULT_FLAGS` below
 *   2. `VITE_FLAGS` at build time, e.g. `VITE_FLAGS=-ads npm run build`
 *   3. `?flags=` in the URL, dev builds only, e.g. `?flags=-ads` (handy for testing)
 * Both overrides take a comma-separated list: `name` turns a flag on, `-name` turns it off.
 */

export type FlagName = 'ads' | 'devTools';

export const DEFAULT_FLAGS: Readonly<Record<FlagName, boolean>> = {
  /** Rewarded ads (energy refill, gem doubling) and interstitials, via `AdService`. */
  ads: true,
  /** The 🛠 dev tools panel (`ui/devPanel.ts`). On in dev builds, off in production unless `VITE_FLAGS=devTools`. */
  devTools: import.meta.env.DEV,
};

const FLAG_NAMES = Object.keys(DEFAULT_FLAGS) as FlagName[];

/** Applies an override list like "ads,-foo" to `base`. Unknown names are ignored with a warning. */
export function applyFlagOverrides(
  base: Readonly<Record<FlagName, boolean>>,
  list: string | null | undefined,
): Record<FlagName, boolean> {
  const flags = { ...base };
  for (const raw of (list ?? '').split(',')) {
    const item = raw.trim();
    if (!item) continue;
    const on = !item.startsWith('-');
    const name = (on ? item : item.slice(1)) as FlagName;
    if (FLAG_NAMES.includes(name)) flags[name] = on;
    else console.warn(`[deep-dig] unknown feature flag "${name}"`);
  }
  return flags;
}

function resolveFlags(): Record<FlagName, boolean> {
  let flags = applyFlagOverrides(DEFAULT_FLAGS, import.meta.env.VITE_FLAGS);
  if (import.meta.env.DEV && typeof location !== 'undefined') {
    flags = applyFlagOverrides(flags, new URLSearchParams(location.search).get('flags'));
  }
  return flags;
}

const FLAGS: Readonly<Record<FlagName, boolean>> = Object.freeze(resolveFlags());

export function isEnabled(flag: FlagName): boolean {
  return FLAGS[flag];
}
