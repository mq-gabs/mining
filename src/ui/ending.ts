import { gemIconSvg } from './theme';

/** Ending timings (ms). A cinematic, so longer than the usual < 300 ms effects on purpose. */
const FADE_MS = 1000;
const GROW_MS = 1400;
/** "Tap to continue" shows this long after the diamond settles, so an early tap can't skip it by accident. */
const HINT_DELAY_MS = 1500;

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

  const run = (el: HTMLElement, frames: Keyframe[], duration: number) =>
    el.animate(frames, { duration, easing: 'ease-in-out', fill: 'forwards' }).finished;

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
  await new Promise((r) => setTimeout(r, HINT_DELAY_MS));
  hint.classList.add('show');
  await new Promise<void>((resolve) => overlay.addEventListener('pointerdown', () => resolve(), { once: true }));
  overlay.remove();
  diamond.remove();
}
