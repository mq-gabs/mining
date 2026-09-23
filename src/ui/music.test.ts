import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { parseSettings } from '../platform/storage';
import { midiToHz, moodFor, scaleNote } from './music';

const M = CONFIG.music;

describe('music scale', () => {
  it('maps MIDI notes to frequencies', () => {
    expect(midiToHz(69)).toBeCloseTo(440);
    expect(midiToHz(57)).toBeCloseTo(220);
  });

  it('only ever produces notes from the scale, wrapping degrees into octaves', () => {
    expect(scaleNote(57, 0)).toBe(57);
    expect(scaleNote(57, M.scale.length)).toBe(69);
    expect(scaleNote(57, -1)).toBe(57 - 12 + M.scale[M.scale.length - 1]);
    for (let deg = -10; deg < 20; deg++) {
      const pc = (((scaleNote(57, deg) - 57) % 12) + 12) % 12;
      expect(M.scale).toContain(pc);
    }
  });
});

describe('music moods', () => {
  const run = (depth: number, lowEnergy = false) => moodFor({ scene: 'run', depth, lowEnergy, rush: false });

  it('hub is brighter and slower than a run', () => {
    const hub = moodFor({ scene: 'hub' });
    expect(hub.cutoff).toBeGreaterThan(run(1).cutoff);
    expect(hub.bpm).toBeLessThan(run(1).bpm);
    expect(hub.root).toBeGreaterThan(run(1).root);
  });

  it('gets darker every N floors, not in between, down to a floor', () => {
    const n = M.darken.everyFloors;
    expect(run(n)).toEqual(run(1));
    expect(run(n + 1).root).toBe(run(1).root - M.darken.semitones);
    expect(run(n + 1).cutoff).toBeLessThan(run(n).cutoff);
    expect(run(500).root).toBe(M.darken.minRoot);
    expect(run(500).cutoff).toBe(M.darken.minCutoff);
  });

  it('low energy adds the heartbeat and speeds up, without changing the key', () => {
    const calm = run(7);
    const low = run(7, true);
    expect(low.heartbeat).toBe(true);
    expect(calm.heartbeat).toBe(false);
    expect(low.bpm).toBeCloseTo(calm.bpm * M.lowEnergy.tempoMult);
    expect(low.root).toBe(calm.root);
  });
});

describe('sound settings', () => {
  it('fills defaults and clamps volumes', () => {
    expect(parseSettings(null)).toEqual({
      muted: false,
      musicVolume: M.defaultVolume.music,
      sfxVolume: M.defaultVolume.sfx,
    });
    expect(parseSettings({ muted: true, musicVolume: 7, sfxVolume: -1 })).toEqual({
      muted: true,
      musicVolume: 1,
      sfxVolume: 0,
    });
    // Saves from before volumes existed keep their mute setting.
    expect(parseSettings({ muted: true }).musicVolume).toBe(M.defaultVolume.music);
  });
});
