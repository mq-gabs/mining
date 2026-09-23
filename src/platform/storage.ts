import { CONFIG } from '../config';
import { newProfile, parseProfile, type Profile } from '../game/progression';

const PROFILE_KEY = 'deep-dig/profile';

/**
 * Persists the profile to localStorage. Any storage failure (private mode, quota,
 * blocked site data) silently falls back to in-memory state for the session.
 */
export class ProfileStore {
  private memory: Profile | undefined;

  load(): Profile {
    if (this.memory) return this.memory;
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      if (raw !== null) return parseProfile(JSON.parse(raw));
    } catch (err) {
      console.warn('[deep-dig] could not load save, using memory', err);
    }
    return newProfile();
  }

  save(profile: Profile) {
    this.memory = profile;
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    } catch (err) {
      console.warn('[deep-dig] could not save, keeping progress in memory', err);
    }
  }

  reset(): Profile {
    this.memory = undefined;
    try {
      localStorage.removeItem(PROFILE_KEY);
    } catch {
      // ignore: nothing persisted
    }
    return newProfile();
  }
}

/** Device preferences, kept apart from game progress so resetting progress keeps them. */
export interface Settings {
  muted: boolean;
  /** Slider values, 0..1. */
  musicVolume: number;
  sfxVolume: number;
}

/** Builds valid settings from untrusted data, falling back to defaults per field. */
export function parseSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const volume = (v: unknown, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : fallback;
  return {
    muted: r.muted === true,
    musicVolume: volume(r.musicVolume, CONFIG.music.defaultVolume.music),
    sfxVolume: volume(r.sfxVolume, CONFIG.music.defaultVolume.sfx),
  };
}

const SETTINGS_KEY = 'deep-dig/settings';

export class SettingsStore {
  private memory: Settings | undefined;

  load(): Settings {
    if (this.memory) return this.memory;
    try {
      return parseSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}'));
    } catch {
      return parseSettings({});
    }
  }

  save(settings: Settings) {
    this.memory = settings;
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // keep in memory only
    }
  }
}
