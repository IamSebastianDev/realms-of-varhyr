/**
 * Every number the bot's judgement rests on. The defaults are the shipped behaviour; scripts/tune-bot.ts searches for
 * better ones by self-play. Weights are read at decision time, so a change is picked up immediately and stays
 * deterministic as long as every client uses the same values.
 */
export type BotWeights = {
  /** Value of one life point. */ life: number;
  /** Value of a playable card in hand. */ hand: number;
  /** Value of each faction colour a player can produce. */ colors: number;
  /** Value of one point of attack on a creature (holdings count `holding` times this). */ attack: number; holding: number;
  /** Value of a point of defense, and the discount for damage already taken. */ defense: number; damage: number;
  /** Value of a point of energy output. */ output: number;
  /** Weight on buffs that reach other creatures (board at full, hand at `handSupport`). */ support: number; handSupport: number;
  /** Cost of channelling a creature for energy: its attack times this, plus a base amount. */ spendAttack: number; spendBase: number;
  /** Bonus for a card that replaces itself. */ cycle: number;
  /** A play must beat this to be worth making instead of passing. */ minPlay: number;
  /** How much the learned evaluator (botModel.json) counts against the hand-written one, 0 to 1, and its log-odds scale. */ model: number; modelScale: number;
  /** Combat: share of a creature's value counted for killing a blocker and for losing the attacker; value of unblocked damage. */ killBlocker: number; loseAttacker: number; openDamage: number;
};
export const defaultWeights: BotWeights = {
  life: 1.8, hand: .6, colors: 4, attack: 2, holding: .5, defense: .65, damage: .7, output: .6, support: 1, handSupport: .5,
  spendAttack: .9, spendBase: .15, cycle: .2, minPlay: .05, killBlocker: .85, loseAttacker: .9, openDamage: 4, model: 0, modelScale: 12,
};
export const weights: BotWeights = { ...defaultWeights };
export const setBotWeights = (next: Partial<BotWeights>) => Object.assign(weights, defaultWeights, next);
