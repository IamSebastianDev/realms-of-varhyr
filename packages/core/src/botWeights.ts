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
};
export const weights: BotWeights = { ...defaultWeights };
export const setBotWeights = (next: Partial<BotWeights>) =>
  Object.assign(weights, defaultWeights, next);
