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
