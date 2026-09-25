import type { BlockType, GemTier } from '../config';

export const BLOCK_COLORS: Record<BlockType, { top: string; bottom: string; speck: string }> = {
  dirt: { top: '#a06a3c', bottom: '#6e4424', speck: 'rgba(40,20,5,0.35)' },
  stone: { top: '#8e939b', bottom: '#5c6068', speck: 'rgba(30,30,35,0.35)' },
  hard: { top: '#5d6475', bottom: '#373c4a', speck: 'rgba(200,210,230,0.18)' },
  obsidian: { top: '#3b2a58', bottom: '#150e24', speck: 'rgba(190,140,255,0.25)' },
};

/**
 * Block colours during a Rush: all gold, but each type keeps its light/dark place (dirt brightest,
 * obsidian darkest) so they still read apart.
 */
export const RUSH_BLOCK_COLORS: Record<BlockType, { top: string; bottom: string; speck: string }> = {
  dirt: { top: '#ffd766', bottom: '#d49a24', speck: 'rgba(120,70,0,0.3)' },
  stone: { top: '#e8b845', bottom: '#a8761a', speck: 'rgba(90,50,0,0.32)' },
  hard: { top: '#bf8a28', bottom: '#7a5210', speck: 'rgba(255,230,160,0.22)' },
  obsidian: { top: '#8c5a16', bottom: '#452806', speck: 'rgba(255,210,120,0.28)' },
};
export const RUSH_COLOR = '#ffd24a';

/** A gem tier, or the Legendary Diamond (the goal), which is drawn like a gem but isn't a tier. */
export type GemLook = GemTier | 'legendary';

export const GEM_COLORS: Record<GemLook, string> = {
  quartz: '#f4f1ea',
  amethyst: '#b875ff',
  sapphire: '#4b8bff',
  ruby: '#ff4163',
  legendary: '#8ff8ff',
};

/** Unit-radius outlines, one silhouette per gem tier so they read apart without color. */
export const GEM_SHAPES: Record<GemLook, [number, number][]> = {
  // Hexagonal crystal column.
  quartz: [[0, -1], [0.5, -0.6], [0.5, 0.6], [0, 1], [-0.5, 0.6], [-0.5, -0.6]],
  // Trillion (triangle) cut.
  amethyst: [[0, -0.95], [0.95, 0.75], [-0.95, 0.75]],
  // Oval cut.
  sapphire: Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    return [Math.cos(a) * 0.72, Math.sin(a) * 0.95] as [number, number];
  }),
  // Emerald (clipped rectangle) cut.
  ruby: [[-0.4, -0.85], [0.4, -0.85], [0.8, -0.45], [0.8, 0.45], [0.4, 0.85], [-0.4, 0.85], [-0.8, 0.45], [-0.8, -0.45]],
  // Brilliant: flat crown over a pointed pavilion.
  legendary: [[-0.5, -0.75], [0.5, -0.75], [1, -0.25], [0, 0.95], [-1, -0.25]],
};

/** The gem icon as inline SVG, for DOM UI (the canvas draws the same shapes). */
export function gemIconSvg(tier: GemLook, size = 16): string {
  const pts = GEM_SHAPES[tier].map(([x, y]) => `${(x * 10).toFixed(1)},${(y * 10).toFixed(1)}`).join(' ');
  return (
    `<svg class="gem-svg" width="${size}" height="${size}" viewBox="-12 -12 24 24" aria-hidden="true">` +
    `<polygon points="${pts}" fill="${GEM_COLORS[tier]}" stroke="rgba(0,0,0,0.7)" stroke-width="1.5" stroke-linejoin="round"/>` +
    `<line x1="-2.5" y1="-4.5" x2="1" y2="-1" stroke="rgba(255,255,255,0.75)" stroke-width="1.5" stroke-linecap="round"/></svg>`
  );
}

export const TUNNEL_COLOR = '#1a1310';
export const BACKDROP_COLOR = '#0d0907';

export const SPARKLE_COLOR = '#fff4c8';
/** Hazard dust: a warm rust, so it can't be mistaken for the pale gem sparkles. */
export const DUST_COLOR = '#ff9a5c';
export const TREASURE_COLOR = '#ffc94a';
export const CRYSTAL_COLOR = '#7fe3ff';
export const GAS_COLOR = '#9be86b';
/** Floating text for energy lost to a hazard. */
export const DAMAGE_COLOR = '#ff5a4f';
export const SCAN_COLOR = '#6fe0ff';
export const BLAST_COLOR = 'rgba(255,150,60,0.7)';
