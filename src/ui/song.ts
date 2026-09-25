/**
 * Songs written as text, and how they're played. Pure (no Web Audio): `arrange` turns a song into a list of
 * voices that `MusicEngine` plays in the browser and `scripts/song.ts` renders to a WAV file.
 *
 * Melody: notes separated by spaces, each `NOTE[:LENGTH]`.
 * - NOTE is a letter A–G, an optional `#` or `b`, and an octave: `C5`, `F#4`, `Bb3` (C4 is middle C).
 *   `R` is a rest.
 * - LENGTH is in beats (1 when left out): a number (`0.5`, `1.5`), a fraction (`1/3`), or a note value:
 *   `w` whole (4), `h` half (2), `q` quarter (1), `e` eighth (0.5), `s` sixteenth (0.25). A trailing `.`
 *   makes it dotted (×1.5): `q.` is 1.5.
 *   Example: `C5:e E5:e G5:e C6 R:q G6:h`
 *
 * Chords: separated by spaces, each `CHORD[:LENGTH]` (same lengths).
 * - A chord name: a root (`C`, `F#`, `Bb`) and a quality: nothing (major), `m`, `7`, `maj7`, `m7`, `dim`,
 *   `aug`, `sus2`, `sus4`, `5` (power chord). `@OCTAVE` sets the root's octave (4 when left out): `Am@3`.
 * - Or the notes themselves in brackets: `[C4 E4 G4 C5]:2`.
 * - `R` is a rest.
 *   Example: `C:2 Am@3:2 F:2 G7:2`
 */

/** A melody note (`midi` null = rest). */
export interface Note {
  midi: number | null;
  beats: number;
}

/** Notes played together (none = rest). */
export interface Chord {
  midis: number[];
  beats: number;
}

export interface SongPart {
  melody: Note[];
  chords: Chord[];
}

/** A song part written as text (see the module comment for the notation). */
export interface SongText {
  melody: string;
  chords: string;
}

const PITCH_CLASS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const NOTE_VALUE: Record<string, number> = { w: 4, h: 2, q: 1, e: 0.5, s: 0.25 };
/** Chord qualities as semitones above the root. */
const QUALITY: Record<string, number[]> = {
  '': [0, 4, 7],
  m: [0, 3, 7],
  '7': [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  '5': [0, 7],
};

/** Tokens split by whitespace, keeping a bracketed chord (`[C4 E4 G4]:2`) as one token. */
function tokens(src: string): string[] {
  return src.match(/\[[^\]]*\](?::\S+)?|\S+/g) ?? [];
}

function fail(kind: string, token: string, index: number, why: string): never {
  throw new Error(`${kind} ${index + 1} "${token}": ${why}`);
}

/** A length in beats: a number, a fraction, or a note value (`q`, `e.`...). */
export function parseBeats(src: string): number {
  const dotted = src.endsWith('.') && src.length > 1 && src[0] in NOTE_VALUE;
  const base = dotted ? src.slice(0, -1) : src;
  let beats: number;
  if (base in NOTE_VALUE) beats = NOTE_VALUE[base];
  else if (/^\d+\/\d+$/.test(base)) {
    const [n, d] = base.split('/').map(Number);
    beats = n / d;
  } else beats = Number(base);
  if (!Number.isFinite(beats) || beats <= 0 || base === '') throw new Error(`bad length "${src}"`);
  return dotted ? beats * 1.5 : beats;
}

/** MIDI number of a note name like `C4` (60), `F#5` or `Bb3`. */
export function noteToMidi(name: string): number {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(name);
  if (!m) throw new Error(`bad note "${name}" (a letter A–G, optional # or b, then an octave, like C5 or F#4)`);
  const accidental = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  return 12 * (Number(m[3]) + 1) + PITCH_CLASS[m[1]] + accidental;
}

/** Splits `BODY[:LENGTH]` (the last `:` wins, so a bracketed chord can't be cut). */
function splitLength(token: string): [string, number] {
  const at = token.lastIndexOf(':');
  if (at < 0) return [token, 1];
  return [token.slice(0, at), parseBeats(token.slice(at + 1))];
}

export function parseMelody(src: string): Note[] {
  return tokens(src).map((token, i) => {
    try {
      const [body, beats] = splitLength(token);
      return { midi: body === 'R' ? null : noteToMidi(body), beats };
    } catch (e) {
      return fail('melody note', token, i, (e as Error).message);
    }
  });
}

/** One chord name (`Am@3`) as MIDI notes. */
export function chordToMidis(name: string): number[] {
  const m = /^([A-G])(#|b)?([a-z0-9]*)(?:@(-?\d))?$/.exec(name);
  if (!m || !(m[3] in QUALITY)) {
    throw new Error(`bad chord "${name}" (a root like C, F# or Bb, a quality (${Object.keys(QUALITY).filter(Boolean).join(', ')}, or none for major), then an optional @octave)`);
  }
  const root = noteToMidi(`${m[1]}${m[2] ?? ''}${m[4] ?? '4'}`);
  return QUALITY[m[3]].map((semi) => root + semi);
}

export function parseChords(src: string): Chord[] {
  return tokens(src).map((token, i) => {
    try {
      const [body, beats] = splitLength(token);
      if (body === 'R') return { midis: [], beats };
      if (body.startsWith('[')) {
        if (!body.endsWith(']')) throw new Error('a bracketed chord needs a closing ]');
        const notes = body.slice(1, -1).trim().split(/\s+/).filter(Boolean);
        if (notes.length === 0) throw new Error('empty chord (use R for a rest)');
        return { midis: notes.map(noteToMidi), beats };
      }
      return { midis: chordToMidis(body), beats };
    } catch (e) {
      return fail('chord', token, i, (e as Error).message);
    }
  });
}

export function parsePart(text: SongText): SongPart {
  return { melody: parseMelody(text.melody), chords: parseChords(text.chords) };
}

/** Total length in beats of a melody or chord list. */
export function totalBeats(items: readonly { beats: number }[]): number {
  return items.reduce((sum, n) => sum + n.beats, 0);
}

export function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/** One note to play: from `at` seconds (song time), an attack to `gain`, then an exponential fade over `dur`. */
export interface Voice {
  at: number;
  freq: number;
  dur: number;
  type: OscillatorType;
  gain: number;
  attack: number;
}

export interface Arrangement {
  bpm: number;
  melodyGain: number;
  chordGain: number;
}

/**
 * How a part sounds: the melody on a triangle with a soft sine an octave up, the chords on sines with a
 * triangle bass an octave under the lowest note. Returns the voices and the part's length in seconds
 * (the melody's; notes ring a little past it).
 */
export function arrange(part: SongPart, a: Arrangement): { voices: Voice[]; length: number } {
  const beat = 60 / a.bpm;
  const voices: Voice[] = [];
  let at = 0;
  for (const { midi, beats } of part.melody) {
    if (midi !== null) {
      const freq = midiToHz(midi);
      voices.push({ at, freq, dur: beats * beat * 1.1, type: 'triangle', gain: a.melodyGain, attack: 0.02 });
      voices.push({ at, freq: freq * 2, dur: beats * beat * 0.6, type: 'sine', gain: a.melodyGain * 0.25, attack: 0.02 });
    }
    at += beats * beat;
  }
  const length = at;
  at = 0;
  for (const { midis, beats } of part.chords) {
    const dur = beats * beat * 1.2;
    for (const midi of midis) voices.push({ at, freq: midiToHz(midi), dur, type: 'sine', gain: a.chordGain, attack: 0.08 });
    if (midis.length) {
      voices.push({ at, freq: midiToHz(Math.min(...midis) - 12), dur, type: 'triangle', gain: a.chordGain * 1.2, attack: 0.05 });
    }
    at += beats * beat;
  }
  return { voices, length: Math.max(length, at) };
}
