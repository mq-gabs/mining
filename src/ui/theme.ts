import type { BlockType, GemTier } from '../config';

export const BLOCK_COLORS: Record<BlockType, { top: string; bottom: string; speck: string }> = {
  dirt: { top: '#a06a3c', bottom: '#6e4424', speck: 'rgba(40,20,5,0.35)' },
  stone: { top: '#8e939b', bottom: '#5c6068', speck: 'rgba(30,30,35,0.35)' },
  hard: { top: '#5d6475', bottom: '#373c4a', speck: 'rgba(200,210,230,0.18)' },
  obsidian: { top: '#3b2a58', bottom: '#150e24', speck: 'rgba(190,140,255,0.25)' },
};

export const GEM_COLORS: Record<GemTier, string> = {
  quartz: '#f4f1ea',
  amethyst: '#b875ff',
  sapphire: '#4b8bff',
  ruby: '#ff4163',
  diamond: '#8ff8ff',
};

export const TUNNEL_COLOR = '#1a1310';
export const BACKDROP_COLOR = '#0d0907';

export const SPARKLE_COLOR = '#fff4c8';
export const DUST_COLOR = '#efe3d3';
export const TREASURE_COLOR = '#ffc94a';
export const CRYSTAL_COLOR = '#7fe3ff';
export const GAS_COLOR = '#9be86b';
