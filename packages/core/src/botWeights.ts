/**
 * Every number the bot's judgement rests on. The defaults are the shipped behaviour; scripts/tune-bot.ts searches for
 * better ones by self-play. Weights are read at decision time, so a change is picked up immediately and stays
 * deterministic as long as every client uses the same values.
 */
export type BotWeights = {
  /** Value of one life point. */ life: number;
  /** Value of a playable card in hand. */ hand: number;
  /** Value of each faction colour a player can produce. */ colors: number;
  /** Value of one point of attack on a creature (holdings count `holding` times this). */ attack: number;
  holding: number;
  /** Value of a point of defense, and the discount for damage already taken. */ defense: number;
  damage: number;
  /** Value of a point of energy output. */ output: number;
  /** Weight on buffs that reach other creatures (board at full, hand at `handSupport`). */ support: number;
  handSupport: number;
  /** Cost of channelling a creature for energy: its attack times this, plus a base amount. */ spendAttack: number;
  spendBase: number;
  /** Bonus for a card that replaces itself. */ cycle: number;
  /** A play must beat this to be worth making instead of passing. */ minPlay: number;
  /** How much the learned evaluator (botModel.json) counts against the hand-written one, 0 to 1, and its log-odds scale. */ model: number;
  modelScale: number;
  /** Combat: share of a creature's value counted for killing a blocker and for losing the attacker; value of unblocked damage. */ killBlocker: number;
  loseAttacker: number;
  openDamage: number;
  /** 1 resolves a choice a spell opens (Sabotage's discard) before the play is scored; 0 scores the state before it. */ resolve: number;
  /** Share of a "until end of turn" buff counted (1: as if permanent). */ tempBuff: number;
  /** 1: the "keep a slot for a hand upgrade next turn" check starts from an empty pool, so energy already channelled is not counted twice. */ freshCycle: number;
  /** Plays planned ahead within a turn (1: one at a time), and how many candidates are followed at each step. */ depth: number;
  breadth: number;
  /** Worth of a position's energy supply: econ * (1 - econDecay^energy), so the first producers matter most. Killing (denial) or finding (library search) one is worth the change in it. */ econ: number;
  econDecay: number;
  denial: number;
  /** Share of the opponent's best counter-attack (as it would score for them) subtracted from a position. */ exposure: number;
  /** 1: never hold the last slot for a better card while the opponent could attack through an open lane. */ holdExposure: number;
};
export const defaultWeights: BotWeights = {
  life: 1.8,
  hand: 0.6,
  colors: 4,
  attack: 2,
  holding: 0.5,
  defense: 0.65,
  damage: 0.7,
  output: 0.6,
  support: 1,
  handSupport: 0.5,
  spendAttack: 0.9,
  spendBase: 0.15,
  cycle: 0.2,
  minPlay: 0.05,
  killBlocker: 0.85,
  loseAttacker: 0.9,
  openDamage: 4,
  model: 0,
  modelScale: 12,
  resolve: 1,
  tempBuff: 0.25,
  freshCycle: 1,
  depth: 3,
  breadth: 4,
  econ: 20,
  econDecay: 0.6,
  denial: 1,
  exposure: 0,
  holdExposure: 0,
};
export const weights: BotWeights = { ...defaultWeights };
export const setBotWeights = (next: Partial<BotWeights>) =>
  Object.assign(weights, defaultWeights, next);
