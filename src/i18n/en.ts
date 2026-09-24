/**
 * English UI texts: the source of truth for message keys.
 * `{name}` placeholders are filled by `t()`. Keys ending in `.one` / `.other` are plural forms, used with `tn()`.
 */
export const en = {
  // Hub
  'hub.tagline': 'Dig down. Grab gems. Get out alive.',
  'hub.gems': 'Gems',
  'hub.bestFloor': 'Best floor',
  'hub.upgrades': 'Upgrades',
  'hub.reset': 'Reset progress',
  'hub.start': 'Start Run',
  'a11y.settings': 'Settings',
  'a11y.mute': 'Mute sound',
  'a11y.unmute': 'Unmute sound',

  // Shop
  'upgrade.power': 'Pickaxe Power',
  'upgrade.energy': 'Max Energy',
  'upgrade.luck': 'Luck',
  'upgrade.gemValue': 'Gem Value',
  'upgrade.dynamite': 'Dynamite Charges',
  'upgrade.drillUnlock': 'Unlock Drill',
  'upgrade.drill': 'Drill Charges',
  'upgrade.scannerUnlock': 'Unlock Scanner',
  'upgrade.scanner': 'Scanner Charges',
  'shop.effect.power': 'Power {n}',
  'shop.effect.energy': 'Max energy {n}',
  'shop.effect.luck': 'Gem chance +{pct}',
  'shop.effect.gemValue': 'Gem value ×{mult}',
  'shop.effect.charges': 'Charges {n}',
  'shop.unlock.charges.one': '{n} charge per run.',
  'shop.unlock.charges.other': '{n} charges per run.',
  'shop.level': 'Lv {level}/{max}',
  'shop.max': 'MAX',
  'a11y.buy': 'Buy {name} for {cost} gems',

  // Settings
  'settings.title': 'Settings',
  'settings.language': '🌐 Language',
  'sound.music': '🎵 Music',
  'sound.effects': '🔔 Effects',
  'sound.mutedNote': 'Sound is muted. Unmute with 🔇 to hear changes.',
  'common.done': 'Done',

  // Reset progress
  'reset.title': 'Reset progress?',
  'reset.body': "This erases all gems, upgrades and your best depth. It can't be undone.",
  'reset.confirm': 'Reset everything',
  'common.cancel': 'Cancel',

  // Run HUD
  'hud.floor': 'Floor {n}',
  'hud.perksEmpty': 'Perks: none yet',
  'hud.leave': 'Leave Mine',
  'a11y.cleanChip': 'Clean floor bonus',
  'a11y.runGems': 'Gems found this run',
  'a11y.rushMeter': 'Rush meter',
  'a11y.activePerks': 'Active perks',
  'a11y.tools': 'Tools',

  // Tools
  'tool.pickaxe': 'Pickaxe',
  'tool.dynamite': 'Dynamite',
  'tool.drill': 'Drill',
  'tool.scanner': 'Scanner',
  'tool.dynamite.desc': 'Blasts a {area} area. Gas stays sealed.',
  'tool.drill.desc': 'Breaks the whole row.',
  'tool.scanner.desc': 'Reveals what a {area} area holds.',
  'tool.locked': '{tool}: unlock it in the shop',
  'tool.aim': '{icon} Tap a block: {description}',

  // Grid floats
  'float.freeSwing': 'free!',
  'float.perk': 'Perk!',
  'float.masked': 'masked',
  'float.caveIn': 'Cave-in!',
  'float.rushEnd.one': 'Rush! {n} block · +{gems} 💎',
  'float.rushEnd.other': 'Rush! {n} blocks · +{gems} 💎',

  // Banners
  'banner.floor': 'Floor {n}',
  'banner.rush': 'RUSH!',
  'banner.cleared': 'Floor cleared! +{pct} · ×{mult}',
  'banner.cleared.max': ' (max)',
  'banner.cleared.energy': ' · +{energy}⚡',
  'banner.cleared.energyAfterRush': ' · +{energy}⚡ after Rush',

  // Perks
  'perk.pick.title': 'Choose a perk',
  'perk.pick.fromChest': 'You found a relic in the chest.',
  'perk.pick.fromFloor': 'You reached floor {n}.',
  'perk.pick.lasts': 'Perks last until the end of this run.',
  'perk.pick.have': '(have {n})',
  'perk.pick.take': 'Take perk',
  'perk.pick.takeNamed': 'Take {name}',
  'a11y.perkChoices': 'Perks',
  'perk.active.title': 'Active perks',
  'perk.active.none': 'No perks yet. You get to pick one every {n} floors, and some chests hold one.',
  'common.backToDigging': 'Back to digging',
  'perk.sharpEdge': 'Sharp Edge',
  'perk.sharpEdge.desc': '+{n} pickaxe power.',
  'perk.secondWind': 'Second Wind',
  'perk.secondWind.desc': '+{n} energy now.',
  'perk.luckyStrike': 'Lucky Strike',
  'perk.luckyStrike.desc': '{pct} chance each gem drop is doubled.',
  'perk.tremor': 'Tremor',
  'perk.tremor.desc': 'Breaking a block deals {n} damage to the blocks next to it.',
  'perk.gasMask': 'Gas Mask',
  'perk.gasMask.desc': 'Gas pockets drain {pct} less energy.',
  'perk.prospector': 'Prospector',
  'perk.prospector.desc': 'Gem sparkles show the color of the gem tier.',
  'perk.efficientSwing': 'Efficient Swing',
  'perk.efficientSwing.desc': '{pct} chance a tap costs no energy.',
  'perk.treasureSense': 'Treasure Sense',
  'perk.treasureSense.desc': 'Chests glow once exposed.',
  'perk.deepBreath': 'Deep Breath',
  'perk.deepBreath.desc': 'Each new floor restores {n} energy.',
  'perk.greed': 'Greed',
  'perk.greed.desc': 'Gem values +{pct}, but max energy −{n}.',

  // Gems
  'gems.title': 'Gems this run',
  'gems.total': 'Total',
  'gems.none': 'No gems yet. Blocks next to a gem sparkle.',
  'gem.quartz': 'Quartz',
  'gem.amethyst': 'Amethyst',
  'gem.sapphire': 'Sapphire',
  'gem.ruby': 'Ruby',
  'gem.diamond': 'Diamond',

  // Clean floor bonus
  'clean.title': '🧹 Clean floor bonus',
  'clean.body':
    'Break every block on a floor to raise your gem multiplier. Deeper floors are worth more: floor 1 adds +{pct1}, ' +
    'floor 10 adds +{pct10}. It applies to the gems you bring back, up to ×{max}. Each cleared floor also gives back ' +
    'energy: +{energy1}⚡ on floor 1, +{energy10}⚡ on floor 10.',
  'clean.floors': 'Floors cleaned',
  'clean.multiplier': 'Multiplier',

  // Leaving the mine
  'leave.title': 'Leave the mine?',
  'leave.body': "You'll return to the surface and keep {kept} gems from this run{bonus}.",
  'leave.bonus': ' ({gems} × {mult} clean floor bonus)',
  'leave.confirm': 'Leave Mine',
  'leave.cancel': 'Keep digging',

  // Out of energy
  'oom.title': 'Out of energy!',
  'oom.body': 'You collapse and get carried out. You keep {pct}% of your gems{bonus}: {kept} (found {gems}).',
  'oom.bonus': ', after the ×{mult} clean floor bonus',
  'oom.carriedOut': 'Get carried out',
  'common.continue': 'Continue',
  'ad.energy': '📺 Watch an ad for +{n} energy',
  'ad.failedRetry': "The ad couldn't play. You can try again.",

  // Run summary
  'summary.newBest': 'New best depth!',
  'summary.titleLeft': 'Back on the surface',
  'summary.titleExhausted': 'Carried out',
  'summary.depth': 'Depth reached',
  'summary.depthValue': 'Floor {n}',
  'summary.blocks': 'Blocks broken',
  'summary.gemsFound': 'Gems found',
  'summary.clean': '🧹 Clean floors {n} · ×{mult}',
  'summary.gemsKept': 'Gems kept',
  'summary.seed': 'seed {n}',
  'ad.double': '📺 Double gems from this run {bonus}',
  'ad.failed': "The ad couldn't play.",

  // Mock ad overlay (development)
  'mockAd.rewarded': 'Rewarded ad',
  'mockAd.interstitial': 'Interstitial ad',
  'mockAd.label': '{kind} · mock',
  'mockAd.placeholder': 'Your ad here',
  'mockAd.countdown': 'Ends in {n}s',
};

export type MessageKey = keyof typeof en;
