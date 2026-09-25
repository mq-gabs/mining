import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { arrange, chordToMidis, noteToMidi, parseBeats, parseChords, parseMelody, parsePart, totalBeats } from './song';

describe('song notation', () => {
  it('reads note names as MIDI numbers (C4 = 60)', () => {
    expect(noteToMidi('C4')).toBe(60);
    expect(noteToMidi('A4')).toBe(69);
    expect(noteToMidi('F#5')).toBe(78);
    expect(noteToMidi('Bb3')).toBe(58);
    expect(noteToMidi('C-1')).toBe(0);
  });

  it('reads lengths as numbers, fractions or note values (dotted too)', () => {
    expect(parseBeats('2')).toBe(2);
    expect(parseBeats('0.5')).toBe(0.5);
    expect(parseBeats('1/3')).toBeCloseTo(1 / 3);
    expect([parseBeats('w'), parseBeats('h'), parseBeats('q'), parseBeats('e'), parseBeats('s')]).toEqual([4, 2, 1, 0.5, 0.25]);
    expect(parseBeats('q.')).toBe(1.5);
    expect(parseBeats('h.')).toBe(3);
  });

  it('parses a melody with rests and a default length of 1 beat', () => {
    expect(parseMelody('C5:e  E5:0.5\nG5 R:h C6:q.')).toEqual([
      { midi: 72, beats: 0.5 },
      { midi: 76, beats: 0.5 },
      { midi: 79, beats: 1 },
      { midi: null, beats: 2 },
      { midi: 84, beats: 1.5 },
    ]);
  });

  it('parses chord names, octaves, bracketed notes and rests', () => {
    expect(chordToMidis('C')).toEqual([60, 64, 67]);
    expect(chordToMidis('Am@3')).toEqual([57, 60, 64]);
    expect(chordToMidis('G7')).toEqual([67, 71, 74, 77]);
    expect(chordToMidis('F#m')).toEqual([66, 69, 73]);
    expect(parseChords('C:2 [C4 E4 G4 C5]:h R Bbmaj7@3')).toEqual([
      { midis: [60, 64, 67], beats: 2 },
      { midis: [60, 64, 67, 72], beats: 2 },
      { midis: [], beats: 1 },
      { midis: [58, 62, 65, 69], beats: 1 },
    ]);
  });

  it('says which token is wrong and why', () => {
    expect(() => parseMelody('C5 H5')).toThrow(/melody note 2 "H5"/);
    expect(() => parseMelody('C')).toThrow(/octave/);
    expect(() => parseMelody('C5:x')).toThrow(/bad length "x"/);
    expect(() => parseMelody('C5:0')).toThrow(/bad length/);
    expect(() => parseChords('C Cmaj9')).toThrow(/chord 2 "Cmaj9"/);
    expect(() => parseChords('[]')).toThrow(/empty chord/);
  });

  it('arranges a part: melody with an octave double, chords with a bass an octave under the lowest note', () => {
    const { voices, length } = arrange(parsePart({ melody: 'A4 R A4', chords: 'Am:3' }), { bpm: 60, melodyGain: 1, chordGain: 1 });
    expect(length).toBe(3);
    const melody = voices.filter((v) => v.type === 'triangle' && v.gain === 1);
    expect(melody.map((v) => [v.at, v.freq])).toEqual([[0, 440], [2, 440]]);
    const bass = voices.find((v) => v.type === 'triangle' && v.gain === 1.2);
    expect(bass?.freq).toBeCloseTo(220); // Am is A4 C5 E5; the bass is A3
  });
});

describe('game songs (config)', () => {
  const v = CONFIG.music.victory;

  it('each part parses, and its melody and chords have the same length, so the loop stays in time', () => {
    for (const part of [v.intro, v.loop, CONFIG.music.defeat.loop]) {
      const { melody, chords } = parsePart(part);
      expect(totalBeats(melody)).toBe(totalBeats(chords));
    }
  });

  it('plays the notes the song was first written with', () => {
    const intro = parsePart(v.intro);
    expect(intro.melody.map((n) => n.midi)).toEqual([72, 76, 79, 84, 79, 84, 88, 86, 88, 91]);
    expect(intro.chords.map((c) => c.midis)).toEqual([[60, 64, 67], [65, 69, 72], [67, 71, 74], [60, 64, 67, 72]]);
    const loop = parsePart(v.loop);
    expect(loop.melody.map((n) => n.midi)).toEqual([84, 83, 81, 79, 81, 83, 84, 86, 84, 83, 81, 79, 76, 79]);
    expect(loop.chords.map((c) => c.midis)).toEqual([[60, 64, 67], [57, 60, 64], [65, 69, 72], [67, 71, 74]]);
  });
});
