import { isEnabled } from '../flags';
import { t } from '../i18n';

/**
 * The only way the game talks to an ad network. To ship on CrazyGames or Poki, implement this with
 * their SDK and return it from `createAdService`; game logic and UI stay unchanged.
 */
export interface AdService {
  /** Shows a rewarded ad. Resolves true only if the player earned the reward. */
  showRewarded(): Promise<boolean>;
  /** Shows an interstitial. Resolves when it's closed (or failed); never rejects. */
  showInterstitial(): Promise<void>;
}

const MOCK_AD_MS = 2000;

/** Development stand-in: a full-screen fake ad for 2 seconds, then the reward is always granted. */
export class MockAdService implements AdService {
  private busy = false;

  async showRewarded(): Promise<boolean> {
    return this.play(t('mockAd.rewarded'));
  }

  async showInterstitial(): Promise<void> {
    await this.play(t('mockAd.interstitial'));
  }

  /** Resolves false if another ad is already on screen. */
  private play(kind: string): Promise<boolean> {
    if (this.busy) return Promise.resolve(false);
    this.busy = true;
    const overlay = document.createElement('div');
    overlay.className = 'ad-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', kind);
    overlay.innerHTML = `
      <div class="ad-label">${t('mockAd.label', { kind })}</div>
      <div class="ad-card">
        <div class="ad-art">📺</div>
        <strong>${t('mockAd.placeholder')}</strong>
        <span>${t('mockAd.countdown', { n: `<b class="ad-count">${Math.ceil(MOCK_AD_MS / 1000)}</b>` })}</span>
      </div>
      <div class="ad-progress"><div class="ad-progress-fill" style="animation-duration:${MOCK_AD_MS}ms"></div></div>`;
    document.body.append(overlay);

    const count = overlay.querySelector('.ad-count')!;
    const started = performance.now();
    const tick = setInterval(() => {
      count.textContent = String(Math.max(0, Math.ceil((MOCK_AD_MS - (performance.now() - started)) / 1000)));
    }, 200);

    return new Promise((resolve) => {
      setTimeout(() => {
        clearInterval(tick);
        overlay.remove();
        this.busy = false;
        resolve(true);
      }, MOCK_AD_MS);
    });
  }
}

/** The ad service for this build, or undefined when the `ads` feature flag is off. */
export function createAdService(): AdService | undefined {
  if (!isEnabled('ads')) return undefined;
  return new MockAdService();
}
