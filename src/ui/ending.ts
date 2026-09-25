import { gemIconSvg } from './theme';

/** Ending timings (ms). A cinematic, so longer than the usual < 300 ms effects on purpose. */
const FADE_MS = 1000;
const GROW_MS = 1400;
/** "Tap to continue" shows this long after the diamond settles, so an early tap can't skip it by accident. */
const HINT_DELAY_MS = 1500;
/** The lost game: a slower fade to black, then the message fades in. */
const FAILURE_FADE_MS = 1500;
const FAILURE_TITLE_MS = 1200;

export interface EndingOptions {
  /** Where the diamond lies on screen (client pixels), and its size there. */
  from: { x: number; y: number };
  size: number;
  reducedMotion: boolean;
  /** Called once the screen has faded, when the victory song should start. */
  onSong: () => void;
  hint: string;
}

/**
 * The game's ending: the screen fades to black except for the Legendary Diamond, the diamond grows to the
 * center and stays there, glowing, then "Tap to continue" shows. Resolves on the player's tap after that.
 */
export async function playEnding(opts: EndingOptions): Promise<void> {
  const overlay = document.createElement('div');
  overlay.className = 'ending';
  const diamond = document.createElement('div');
  diamond.className = 'ending-diamond';
  diamond.innerHTML = gemIconSvg('legendary', opts.size);
  diamond.style.left = `${opts.from.x - opts.size / 2}px`;
  diamond.style.top = `${opts.from.y - opts.size / 2}px`;
  const hint = document.createElement('p');
  hint.className = 'ending-hint';
  hint.textContent = opts.hint;
  overlay.append(hint);
  document.body.append(overlay, diamond);

  // 1. Everything but the diamond fades to black.
  await run(overlay, [{ opacity: 0 }, { opacity: 1 }], FADE_MS);
  // 2. The victory song starts.
  opts.onSong();
  // 3. The diamond grows to the center of the screen (a crossfade in place with reduced motion).
  const dx = window.innerWidth / 2 - opts.from.x;
  const dy = window.innerHeight / 2 - opts.from.y;
  const scale = (Math.min(window.innerWidth, window.innerHeight) * 0.45) / opts.size;
  const end = `translate(${dx}px, ${dy}px) scale(${scale})`;
  if (opts.reducedMotion) {
    await run(diamond, [{ opacity: 1 }, { opacity: 0 }], GROW_MS / 2);
    await run(diamond, [{ transform: end, opacity: 0 }, { transform: end, opacity: 1 }], GROW_MS / 2);
  } else {
    await run(diamond, [{ transform: 'translate(0, 0) scale(1)' }, { transform: end }], GROW_MS);
    diamond.classList.add('pulse');
  }
  // 4. "Tap to continue" shows; a tap after that closes the ending.
  await tapToContinue(overlay, hint);
  overlay.remove();
  diamond.remove();
}

export interface FailureOptions {
  /** Called once the screen is black, when the sad song should start. */
  onSong: () => void;
  title: string;
  hint: string;
}

/**
 * The lost game: the screen fades to black, the message fades in, then "Tap to continue" shows. Resolves on
 * the player's tap after that.
 */
export async function playFailure(opts: FailureOptions): Promise<void> {
  const overlay = document.createElement('div');
  overlay.className = 'ending';
  const title = document.createElement('h1');
  title.className = 'ending-title';
  title.textContent = opts.title;
  const hint = document.createElement('p');
  hint.className = 'ending-hint';
  hint.textContent = opts.hint;
  overlay.append(title, hint);
  document.body.append(overlay);

  await run(overlay, [{ opacity: 0 }, { opacity: 1 }], FAILURE_FADE_MS);
  opts.onSong();
  await run(title, [{ opacity: 0 }, { opacity: 1 }], FAILURE_TITLE_MS);
  await tapToContinue(overlay, hint);
  overlay.remove();
}

/** Plays a one-shot animation that holds its last frame. */
function run(el: HTMLElement, frames: Keyframe[], duration: number): Promise<Animation> {
  return el.animate(frames, { duration, easing: 'ease-in-out', fill: 'forwards' }).finished;
}

/** Shows the hint after a short delay (so an early tap can't skip it), then waits for a tap. */
async function tapToContinue(overlay: HTMLElement, hint: HTMLElement): Promise<void> {
  await new Promise((r) => setTimeout(r, HINT_DELAY_MS));
  hint.classList.add('show');
  await new Promise<void>((resolve) => overlay.addEventListener('pointerdown', () => resolve(), { once: true }));
}

/** Run intro timings (ms): shown before every run, so short. */
const INTRO_FADE_MS = 450;
const INTRO_TITLE_MS = 350;
const INTRO_HOLD_MS = 1100;
const INTRO_OUT_MS = 500;

export interface RunIntroOptions {
  title: string;
  /** A second, smaller line (the last run's warning), or empty. */
  subtitle: string;
  /** Called once the screen is black: swap the screens underneath here. */
  onBlack: () => void;
}

/**
 * Before each run: the screen fades to black, "Run 3 of 10" fades in, then everything fades out onto the
 * new run. A tap during the hold skips the rest of it.
 */
export async function playRunIntro(opts: RunIntroOptions): Promise<void> {
  const overlay = document.createElement('div');
  overlay.className = 'ending run-intro';
  const title = document.createElement('div');
  title.className = 'intro-text';
  title.innerHTML = `<h1 class="intro-title">${opts.title}</h1>${opts.subtitle ? `<p class="intro-sub">${opts.subtitle}</p>` : ''}`;
  title.style.opacity = '0';
  overlay.append(title);
  document.body.append(overlay);

  await run(overlay, [{ opacity: 0 }, { opacity: 1 }], INTRO_FADE_MS);
  opts.onBlack();
  await run(title, [{ opacity: 0 }, { opacity: 1 }], INTRO_TITLE_MS);
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, INTRO_HOLD_MS);
    overlay.addEventListener('pointerdown', () => (clearTimeout(timer), resolve()), { once: true });
  });
  await run(overlay, [{ opacity: 1 }, { opacity: 0 }], INTRO_OUT_MS);
  overlay.remove();
}
