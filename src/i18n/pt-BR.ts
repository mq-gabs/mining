import type { MessageKey } from './en';

/** Brazilian Portuguese UI texts (approved by the user). "Perk" is "bônus" throughout. */
export const ptBR: Record<MessageKey, string> = {
  // Hub
  'hub.tagline': 'Cave fundo. Pegue gemas. Saia com vida.',
  'hub.gems': 'Gemas',
  'hub.runsLeft': 'Expedições restantes',
  'hub.upgrades': 'Melhorias',
  'hub.reset': 'Apagar progresso',
  'hub.start': 'Começar expedição',
  'a11y.settings': 'Configurações',
  'a11y.mute': 'Silenciar som',
  'a11y.unmute': 'Ativar som',

  // Shop
  'upgrade.power': 'Força da Picareta',
  'upgrade.energy': 'Energia Máxima',
  'upgrade.luck': 'Sorte',
  'upgrade.gemValue': 'Valor das Gemas',
  'upgrade.dynamite': 'Cargas de Dinamite',
  'upgrade.drillUnlock': 'Desbloquear Broca',
  'upgrade.drill': 'Cargas de Broca',
  'upgrade.scannerUnlock': 'Desbloquear Scanner',
  'upgrade.scanner': 'Cargas de Scanner',
  'shop.effect.power': 'Força {n}',
  'shop.effect.energy': 'Energia máx. {n}',
  'shop.effect.luck': 'Chance de gema +{pct}',
  'shop.effect.gemValue': 'Valor das gemas ×{mult}',
  'shop.effect.charges': 'Cargas {n}',
  'shop.unlock.charges.one': '{n} carga por expedição.',
  'shop.unlock.charges.other': '{n} cargas por expedição.',
  'shop.level': 'Nv {level}/{max}',
  'shop.max': 'MÁX',
  'a11y.buy': 'Comprar {name} por {cost} gemas',

  // Settings
  'settings.title': 'Configurações',
  'settings.language': '🌐 Idioma',
  'sound.music': '🎵 Música',
  'sound.effects': '🔔 Efeitos',
  'sound.mutedNote': 'O som está desligado. Toque em 🔇 para ouvir as mudanças.',
  'common.done': 'Pronto',

  // Reset progress
  'reset.title': 'Apagar progresso?',
  'reset.body': 'Isso apaga todas as gemas, melhorias e seu recorde de profundidade. Não dá para ser desfeito.',
  'reset.confirm': 'Apagar tudo',
  'common.cancel': 'Cancelar',

  // Run HUD
  'hud.floor': 'Andar {n}',
  'hud.perksEmpty': 'Bônus: nenhum ainda',
  'hud.leave': 'Sair da mina',
  'a11y.cleanChip': 'Bônus de andar limpo',
  'a11y.runGems': 'Gemas encontradas nesta expedição',
  'a11y.rushMeter': 'Medidor de Rush',
  'a11y.activePerks': 'Bônus ativos',
  'a11y.tools': 'Ferramentas',

  // Tools
  'tool.pickaxe': 'Picareta',
  'tool.dynamite': 'Dinamite',
  'tool.drill': 'Broca',
  'tool.scanner': 'Scanner',
  'tool.dynamite.desc': 'Explode uma área {area}. O gás continua selado.',
  'tool.drill.desc': 'Quebra a linha inteira.',
  'tool.scanner.desc': 'Revela o que há numa área {area}.',
  'tool.locked': '{tool}: desbloqueie na loja',
  'tool.aim': '{icon} Toque num bloco: {description}',

  // Grid floats
  'float.freeSwing': 'grátis!',
  'float.perk': 'Bônus!',
  'float.masked': 'protegido',
  'float.caveIn': 'Desabou!',
  'float.rushEnd.one': 'Rush! {n} bloco · +{gems} 💎',
  'float.rushEnd.other': 'Rush! {n} blocos · +{gems} 💎',

  // Banners
  'banner.floor': 'Andar {n}',
  'banner.rush': 'RUSH!',
  'banner.cleared': 'Andar limpo! +{pct} · ×{mult}',
  'banner.cleared.max': ' (máx.)',
  'banner.cleared.energy': ' · +{energy}⚡',
  'banner.cleared.energyAfterRush': ' · +{energy}⚡ após o Rush',

  // Perks
  'perk.pick.title': 'Escolha um bônus',
  'perk.pick.fromChest': 'Você achou uma relíquia no baú.',
  'perk.pick.fromFloor': 'Você chegou ao andar {n}.',
  'perk.pick.lasts': 'Os bônus duram até o fim desta expedição.',
  'perk.pick.have': '(tem {n})',
  'perk.pick.take': 'Pegar bônus',
  'perk.pick.takeNamed': 'Pegar {name}',
  'a11y.perkChoices': 'Bônus',
  'perk.active.title': 'Bônus ativos',
  'perk.active.none': 'Nenhum bônus ainda. Você escolhe um a cada {n} andares, e alguns baús têm um.',
  'common.backToDigging': 'Voltar a cavar',
  'perk.sharpEdge': 'Lâmina Afiada',
  'perk.sharpEdge.desc': '+{n} de força da picareta.',
  'perk.secondWind': 'Fôlego Extra',
  'perk.secondWind.desc': '+{n} de energia agora.',
  'perk.luckyStrike': 'Golpe de Sorte',
  'perk.luckyStrike.desc': '{pct} de chance de cada gema vir em dobro.',
  'perk.tremor': 'Tremor',
  'perk.tremor.desc': 'Quebrar um bloco causa {n} de dano nos blocos vizinhos.',
  'perk.gasMask': 'Máscara de Gás',
  'perk.gasMask.desc': 'Bolsões de gás drenam {pct} menos energia.',
  'perk.prospector': 'Garimpeiro',
  'perk.prospector.desc': 'O brilho mostra a cor do tipo de gema.',
  'perk.efficientSwing': 'Golpe Eficiente',
  'perk.efficientSwing.desc': '{pct} de chance de um toque não gastar energia.',
  'perk.treasureSense': 'Faro de Tesouro',
  'perk.treasureSense.desc': 'Baús brilham quando ficam expostos.',
  'perk.deepBreath': 'Respiração Profunda',
  'perk.deepBreath.desc': 'Cada novo andar recupera {n} de energia.',
  'perk.goldFever': 'Febre do Ouro',
  'perk.goldFever.desc': '{pct} de ganhar +{n} de energia ao pegar uma gema.',

  // Gems
  'gems.title': 'Gemas nesta expedição',
  'gems.total': 'Total',
  'gems.none': 'Nenhuma gema ainda. Blocos ao lado de uma gema brilham.',
  'gem.quartz': 'Quartzo',
  'gem.amethyst': 'Ametista',
  'gem.sapphire': 'Safira',
  'gem.ruby': 'Rubi',

  // Clean floor bonus
  'clean.title': '🧹 Bônus de andar limpo',
  'clean.body':
    'Quebre todos os blocos de um andar para aumentar seu multiplicador de gemas. Andares mais fundos valem mais: ' +
    'o andar 1 dá +{pct1}, o andar 10 dá +{pct10}. Vale para as gemas que você traz de volta, até ×{max}. Cada andar ' +
    'limpo também devolve energia: +{energy1}⚡ no andar 1, +{energy10}⚡ no andar 10.',
  'clean.floors': 'Andares limpos',
  'clean.multiplier': 'Multiplicador',

  // Leaving the mine
  'leave.title': 'Sair da mina?',
  'leave.body': 'Você volta à superfície e fica com {kept} gemas desta expedição{bonus}.',
  'leave.bonus': ' ({gems} × {mult} do bônus de andar limpo)',
  'leave.confirm': 'Sair da mina',
  'leave.cancel': 'Continuar cavando',

  // Out of energy
  'oom.title': 'Sem energia!',
  'oom.body':
    'Você desmaia e alguém te leva para fora. Você fica com {pct}% das suas gemas{bonus}: {kept} (encontradas: {gems}).',
  'oom.bonus': ', já com o bônus de andar limpo ×{mult}',
  'oom.carriedOut': 'Pedir resgate',
  'common.continue': 'Continuar',
  'ad.energy': '📺 Veja um anúncio e ganhe +{n} de energia',
  'ad.failedRetry': 'Não foi possível exibir o anúncio. Tente de novo.',

  // Run summary
  'summary.newBest': 'Novo recorde de profundidade!',
  'summary.titleLeft': 'De volta à superfície',
  'ending.failed': 'Você falhou',
  'ending.hint': 'Toque para continuar',
  'summary.titleExhausted': 'Resgate',
  'summary.depth': 'Profundidade alcançada',
  'summary.depthValue': 'Andar {n}',
  'summary.blocks': 'Blocos quebrados',
  'summary.gemsFound': 'Gemas encontradas',
  'summary.clean': '🧹 Andares limpos {n} · ×{mult}',
  'summary.gemsKept': 'Gemas guardadas',
  'summary.seed': 'semente {n}',
  'ad.double': '📺 Dobre as gemas desta expedição {bonus}',
  'ad.failed': 'Não foi possível exibir o anúncio.',

  // Mock ad overlay (development)
  'mockAd.rewarded': 'Anúncio premiado',
  'mockAd.interstitial': 'Anúncio intersticial',
  'mockAd.label': '{kind} · simulação',
  'mockAd.placeholder': 'Seu anúncio aqui',
  'mockAd.countdown': 'Termina em {n}s',
};
