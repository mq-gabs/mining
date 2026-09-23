import { describe, expect, it } from 'vitest';
import { applyFlagOverrides, DEFAULT_FLAGS } from './flags';

describe('feature flag overrides', () => {
  it('keeps defaults with no overrides', () => {
    expect(applyFlagOverrides(DEFAULT_FLAGS, undefined)).toEqual(DEFAULT_FLAGS);
    expect(applyFlagOverrides(DEFAULT_FLAGS, '')).toEqual(DEFAULT_FLAGS);
  });

  it('turns flags on and off, last one wins', () => {
    expect(applyFlagOverrides({ ads: true }, '-ads').ads).toBe(false);
    expect(applyFlagOverrides({ ads: false }, ' ads ').ads).toBe(true);
    expect(applyFlagOverrides({ ads: true }, '-ads,ads').ads).toBe(true);
  });

  it('ignores unknown flags', () => {
    expect(applyFlagOverrides({ ads: true }, 'nope,-other')).toEqual({ ads: true });
  });
});
