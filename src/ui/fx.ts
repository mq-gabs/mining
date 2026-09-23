/** DOM effects that cross element boundaries (the canvas can't draw over the HUD). */

const FLY_MS = 280;

/**
 * A gem that flies in an arc from a point (client pixels) to the center of `target`, then calls
 * `onArrive`. `size` in px; bigger for rarer gems.
 */
export function flyGem(
  from: { x: number; y: number },
  target: HTMLElement,
  color: string,
  size: number,
  delay: number,
  onArrive?: () => void,
) {
  const rect = target.getBoundingClientRect();
  const to = { x: rect.left + rect.width * 0.25, y: rect.top + rect.height / 2 };
  const el = document.createElement('div');
  el.className = 'fly-gem';
  el.style.setProperty('--gem', color);
  el.style.width = el.style.height = `${size}px`;
  el.style.left = `${from.x - size / 2}px`;
  el.style.top = `${from.y - size / 2}px`;
  document.body.append(el);

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  // Arc sideways a little on the way up, so a combo fans out instead of stacking.
  const bend = (Math.random() - 0.5) * 60;
  const anim = el.animate(
    [
      { transform: 'translate(0, 0) rotate(45deg) scale(0.6)', opacity: 1 },
      { transform: `translate(${dx * 0.35 + bend}px, ${dy * 0.3 - 30}px) rotate(45deg) scale(1.3)`, offset: 0.35 },
      { transform: `translate(${dx}px, ${dy}px) rotate(45deg) scale(0.5)`, opacity: 0.9 },
    ],
    { duration: FLY_MS, delay, easing: 'cubic-bezier(.5,0,.8,.6)', fill: 'backwards' },
  );
  anim.onfinish = () => {
    el.remove();
    onArrive?.();
  };
  anim.oncancel = () => el.remove();
}

/** Restarts a one-shot CSS animation class on an element. */
export function replayClass(el: Element, className: string) {
  el.classList.remove(className);
  void (el as HTMLElement).offsetWidth;
  el.classList.add(className);
}

/** Shows `text` in a banner element with a short in/out animation. */
export function showBanner(el: HTMLElement, text: string) {
  el.textContent = text;
  el.hidden = false;
  replayClass(el, 'show');
}
