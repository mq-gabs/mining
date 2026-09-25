/**
 * Plays a song written in the game's notation (see `src/ui/song.ts`), with the same sound as the game's
 * music: it renders the voices to a WAV file and plays it with the system's audio player.
 *
 *   npm run song -- victory                      the victory song: intro, then the loop twice
 *   npm run song -- victory:intro                just the intro (or victory:loop)
 *   npm run song -- defeat                       the sad song (the lost game), its loop twice
 *   npm run song -- "C5:e E5:e G5 C6:h"           a melody
 *   npm run song -- "C5 E5 G5 C6" --chords "C:2 G:2" --bpm 120 --loop 2
 *
 * Options: --chords "...", --bpm N (default: the song's, or the victory song's for a melody), --loop N (plays the loop N times),
 * --out file.wav (default: in the temp folder), --no-play (only writes the file).
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CONFIG } from '../src/config';
import { arrange, parsePart, totalBeats, type Arrangement, type SongText, type Voice } from '../src/ui/song';

declare const process: { argv: string[]; exit(code: number): never };

const SAMPLE_RATE = 44100;
/** Voices rest at this gain, like the game's envelopes (an exponential ramp can't reach 0). */
const MIN_GAIN = 0.0001;
/** Loudest sample after mixing, so the file plays at a comfortable level. */
const PEAK = 0.8;

const V = CONFIG.music.victory;
const D = CONFIG.music.defeat;
/** The game's songs: their parts in order (the last one is the loop), and how they're played. */
const PRESETS: Record<string, { parts: SongText[]; sound: Arrangement }> = {
  victory: { parts: [V.intro, V.loop, V.loop], sound: V },
  'victory:intro': { parts: [V.intro], sound: V },
  'victory:loop': { parts: [V.loop], sound: V },
  defeat: { parts: [D.loop, D.loop], sound: D },
};

function usage(message?: string): never {
  if (message) console.error(`Error: ${message}\n`);
  console.error(`Usage:
  npm run song -- victory | victory:intro | victory:loop | defeat
  npm run song -- "<melody>" [--chords "<chords>"] [--bpm N] [--loop N] [--out file.wav] [--no-play]

Melody: notes like C5, F#4, Bb3, or R (rest), each with an optional :length in beats (1 when left out):
  a number (0.5), a fraction (1/3), or w h q e s (whole, half, quarter, eighth, sixteenth); a dot adds half (q.).
  Example: "C5:e E5:e G5:e C6 R:q G6:h"
Chords: names (C, Am, G7, Fmaj7, Bbm7, Ddim, Eaug, Csus4, A5), @octave (Am@3), [C4 E4 G4] for any notes, R.
  Example: "C:2 Am@3:2 F:2 G7:2"`);
  process.exit(1);
}

function parseArgs(argv: string[]) {
  const args = argv.slice(2).filter((a) => a !== '--');
  const opts = { song: '', chords: '', bpm: 0, loop: 1, out: join(tmpdir(), 'rush-dig-song.wav'), play: true };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const value = () => args[++i] ?? usage(`${a} needs a value`);
    if (a === '--chords') opts.chords = value();
    else if (a === '--bpm') opts.bpm = Number(value());
    else if (a === '--loop') opts.loop = Number(value());
    else if (a === '--out') opts.out = value();
    else if (a === '--no-play') opts.play = false;
    else if (a === '--help' || a === '-h') usage();
    else if (a.startsWith('--')) usage(`unknown option ${a}`);
    else opts.song = opts.song ? `${opts.song} ${a}` : a;
  }
  if (!opts.song) usage();
  if (Number.isNaN(opts.bpm) || opts.bpm < 0) usage('--bpm must be a positive number');
  if (!(Number.isInteger(opts.loop) && opts.loop > 0)) usage('--loop must be a whole number above 0');
  return opts;
}

/** The voices of every part, one after another. Returns them with absolute times, and the total length. */
function sequence(parts: SongText[], sound: Arrangement): { voices: Voice[]; length: number } {
  const voices: Voice[] = [];
  let t = 0;
  for (const text of parts) {
    const part = parsePart(text);
    const melody = totalBeats(part.melody);
    const chords = totalBeats(part.chords);
    if (part.chords.length && melody !== chords) {
      console.warn(`Note: the melody is ${melody} beats and the chords ${chords}, so a loop would drift.`);
    }
    const a = arrange(part, sound);
    for (const v of a.voices) voices.push({ ...v, at: v.at + t });
    t += a.length;
  }
  return { voices, length: t };
}

/** The same envelope as `MusicEngine.voice`: a linear attack to `gain`, then an exponential fade to the end. */
function render(voices: Voice[], length: number): Float32Array {
  const tail = Math.max(0, ...voices.map((v) => v.at + Math.max(v.dur, v.attack + 0.05) - length));
  const out = new Float32Array(Math.ceil((length + tail + 0.2) * SAMPLE_RATE));
  for (const v of voices) {
    const end = Math.max(v.dur, v.attack + 0.05);
    const start = Math.round(v.at * SAMPLE_RATE);
    const n = Math.round(end * SAMPLE_RATE);
    for (let i = 0; i < n && start + i < out.length; i++) {
      const t = i / SAMPLE_RATE;
      const env =
        t < v.attack
          ? MIN_GAIN + (v.gain - MIN_GAIN) * (t / v.attack)
          : v.gain * (MIN_GAIN / v.gain) ** ((t - v.attack) / (end - v.attack));
      const phase = (v.freq * t) % 1;
      const wave = v.type === 'triangle' ? 1 - 4 * Math.abs(phase - 0.5) : Math.sin(2 * Math.PI * phase);
      out[start + i] += wave * env;
    }
  }
  const peak = out.reduce((m, s) => Math.max(m, Math.abs(s)), 0);
  if (peak > 0) for (let i = 0; i < out.length; i++) out[i] *= PEAK / peak;
  return out;
}

/** 16-bit mono PCM WAV. */
function wav(samples: Float32Array): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const text = (at: number, s: string) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((s, i) => view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 0x7fff, true));
  return bytes;
}

/** Tries the usual command-line players until one works. */
function play(file: string): boolean {
  const players: [string, string[]][] = [
    ['pw-play', [file]],
    ['paplay', [file]],
    ['aplay', ['-q', file]],
    ['afplay', [file]],
    ['ffplay', ['-nodisp', '-autoexit', '-loglevel', 'quiet', file]],
  ];
  for (const [cmd, args] of players) {
    const r = spawnSync(cmd, args, { stdio: 'inherit' });
    if (!r.error && r.status === 0) return true;
  }
  return false;
}

const opts = parseArgs(process.argv);
let parts: SongText[];
let sound: Arrangement;
const preset = PRESETS[opts.song];
if (preset) {
  parts = preset.parts;
  if (opts.loop > 1) parts = [...parts.slice(0, -1), ...Array(opts.loop).fill(parts[parts.length - 1])];
  sound = { ...preset.sound, bpm: opts.bpm || preset.sound.bpm };
} else {
  parts = Array(opts.loop).fill({ melody: opts.song, chords: opts.chords });
  sound = { bpm: opts.bpm || V.bpm, melodyGain: V.melodyGain, chordGain: V.chordGain };
}

let song: { voices: Voice[]; length: number };
try {
  song = sequence(parts, sound);
} catch (e) {
  usage((e as Error).message);
}
writeFileSync(opts.out, wav(render(song.voices, song.length)));
console.log(`${song.length.toFixed(1)} s at ${sound.bpm} BPM → ${opts.out}`);
if (opts.play && !play(opts.out)) console.log('No audio player found (tried pw-play, paplay, aplay, afplay, ffplay). Open the file instead.');
