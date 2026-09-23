import { CONFIG, type ToolId } from '../config';

const area = (radius: number) => `${radius * 2 + 1}×${radius * 2 + 1}`;

/** How each tool is labelled in the tool bar and the shop. */
export const TOOL_META: Record<ToolId, { name: string; icon: string; description: string }> = {
  dynamite: {
    name: 'Dynamite',
    icon: '🧨',
    description: `Blasts a ${area(CONFIG.tools.dynamite.radius)} area. Gas stays sealed.`,
  },
  drill: { name: 'Drill', icon: '🔩', description: 'Breaks the whole row.' },
  scanner: {
    name: 'Scanner',
    icon: '📡',
    description: `Reveals what a ${area(CONFIG.tools.scanner.radius)} area holds.`,
  },
};
