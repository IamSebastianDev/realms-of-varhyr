import {
  areAdjacent,
  battlefieldPositions,
  type AbilityExtension,
  type BattlefieldState,
  type BeforePayload,
  type CardInstance,
  type GameState,
  type HookContext,
  type PlayerId,
  type Pool,
  type Registry,
} from "@realms/contracts";

/**
 * Building blocks for abilities: small pieces that are composed instead of written out each time.
 *
 *   hooks: whenFriendlyDies({ subtype: param("subtype") }, searchLibraryForSubtype(param("subtype")))
 *   cast:  run(damage(chosen, param("amount")))
 *
 * A trigger says when something happens, a selector says to what, and an effect says what happens.
 * The ability definition (defineAbility) keeps the parameter schema, the text and the target kind, and consumes these.
 * Blocks only issue orders through `ctx.issue`; they never change state themselves, so replays stay deterministic.
 */
export type Params = Record<string, unknown>;
/** A literal, or a function that reads the value from the card's ability parameters. */
export type Value<T> = T | ((params: Params) => T);
/** Reads one ability parameter. `fallback` is used when the card leaves it out. */
export const param =
  <T = unknown>(name: string, fallback?: T) =>
  (params: Params): T =>
    (params[name] ?? fallback) as T;
const read = <T>(value: Value<T>, params: Params): T =>
  typeof value === "function" ? (value as (params: Params) => T)(params) : value;

export type Effect = (ctx: HookContext, params: Params) => void;
/** Picks the cards or players an effect applies to. Nothing selected means the effect does nothing. */
export type Selector = (ctx: HookContext, params: Params) => string[];
/** A yes/no question about some context: a hook firing, a static modifier's target, an activation. */
export type Predicate<C> = (context: C, params: Params) => boolean;
export type Condition = Predicate<HookContext>;
/** All of them. With none given, true. Works on any predicate, so hooks and static modifiers share it. */
export const and =
  <C>(...all: Predicate<C>[]): Predicate<C> =>
  (context, params) =>
    all.every((predicate) => predicate(context, params));
/** At least one of them. With none given, false. */
export const or =
  <C>(...some: Predicate<C>[]): Predicate<C> =>
  (context, params) =>
    some.some((predicate) => predicate(context, params));
export const not =
  <C>(one: Predicate<C>): Predicate<C> =>
  (context, params) =>
    !one(context, params);
export type Hooks = Record<string, (ctx: HookContext, params: Params) => void>;

const enemyOf = (ctx: HookContext): PlayerId => (ctx.source.controller === "p1" ? "p2" : "p1");
const isCreature = (ctx: HookContext, id: string) =>
  ctx.registry.cards[ctx.state.cards[id].definitionId].type === "creature";

// Selectors
/** The target chosen when the card was played or the ability activated. */
export const chosen: Selector = (ctx) => (ctx.target ? [ctx.target] : []);
export const self: Selector = (ctx) => [ctx.source.id];
/** The controller of the card using the ability. */
export const you: Selector = (ctx) => [ctx.source.controller];
export const opponent: Selector = (ctx) => [enemyOf(ctx)];
/** Every enemy creature on the battlefield. */
export const enemyCreatures: Selector = (ctx) =>
  ctx.state.players[enemyOf(ctx)].board.filter((id): id is string => !!id && isCreature(ctx, id));
/** Every friendly creature on the battlefield. */
export const friendlyCreatures: Selector = (ctx) =>
  ctx.state.players[ctx.source.controller].board.filter(
    (id): id is string => !!id && isCreature(ctx, id),
  );
/** The enemy creature in the lane opposite this card, if there is one. */
export const oppositeCreature: Selector = (ctx) => {
  if (ctx.source.slot === null) return [];
  const id = ctx.state.players[enemyOf(ctx)].board[ctx.source.slot];
  return id && isCreature(ctx, id) ? [id] : [];
};

/** Everything any of the selectors found, without repeats. */
export const union =
  (...all: Selector[]): Selector =>
  (ctx, params) => [...new Set(all.flatMap((selector) => selector(ctx, params)))];

// Effects
export const draw =
  (amount: Value<number>): Effect =>
  (ctx, params) =>
    ctx.issue({ type: "draw", player: ctx.source.controller, amount: read(amount, params) });
export const damage =
  (targets: Selector, amount: Value<number>): Effect =>
  (ctx, params) => {
    for (const target of targets(ctx, params))
      ctx.issue({
        type: "damage",
        target,
        amount: read(amount, params),
        source: ctx.source.id,
      });
  };
/** The controller picks one enemy creature, holding or the enemy player, and this card deals the damage to it. */
export const damageChosenEnemy =
  (amount: Value<number>): Effect =>
  (ctx, params) =>
    ctx.issue({
      type: "damage-pick",
      player: ctx.source.controller,
      amount: read(amount, params),
      source: ctx.source.id,
    });
export const heal =
  (targets: Selector, amount: Value<number>): Effect =>
  (ctx, params) => {
    for (const target of targets(ctx, params))
      ctx.issue({ type: "heal", target: target as PlayerId, amount: read(amount, params) });
  };
/** Until-end-of-turn bonus on creatures. */
export const boost =
  (
    targets: Selector,
    bonus: { attack?: Value<number | undefined>; defense?: Value<number | undefined> },
  ): Effect =>
  (ctx, params) => {
    // A bonus read from a parameter the card leaves out is simply not given.
    const attack = bonus.attack === undefined ? undefined : read(bonus.attack, params),
      defense = bonus.defense === undefined ? undefined : read(bonus.defense, params);
    for (const target of targets(ctx, params))
      ctx.issue({
        type: "boost",
        target,
        ...(attack !== undefined ? { attack } : {}),
        ...(defense !== undefined ? { defense } : {}),
        source: ctx.source.id,
      });
  };
export const destroy =
  (targets: Selector): Effect =>
  (ctx, params) => {
    for (const target of targets(ctx, params)) ctx.issue({ type: "destroy", target });
  };
/** The controller chooses a spell in their discard pile and casts it without paying its cost. */
export const repriseSpell = (): Effect => (ctx) =>
  ctx.issue({ type: "reprise", player: ctx.source.controller, source: ctx.source.id });
/** Exhausted creatures become ready again. Ready ones are left alone. */
export const readyCards =
  (targets: Selector): Effect =>
  (ctx, params) => {
    for (const target of targets(ctx, params)) ctx.issue({ type: "ready", target });
  };
export const returnToHand =
  (targets: Selector): Effect =>
  (ctx, params) => {
    for (const target of targets(ctx, params)) ctx.issue({ type: "return", target });
  };
/** Every copy of the named card goes from the library to the hand. */
export const searchLibrary =
  (card: Value<string>): Effect =>
  (ctx, params) =>
    ctx.issue({
      type: "search",
      player: ctx.source.controller,
      card: read(card, params),
      source: ctx.source.id,
    });
/** The player picks a creature with the subtype from the library for the hand; `first` takes the topmost one instead. */
export const searchLibraryForSubtype =
  (subtype: Value<string>, first?: Value<boolean>): Effect =>
  (ctx, params) =>
    ctx.issue({
      type: "search-subtype",
      player: ctx.source.controller,
      subtype: read(subtype, params),
      first: first === undefined ? false : read(first, params),
      source: ctx.source.id,
    });
/** The player picks a creature or holding costing at most `maxCost` energy in total from the library for the hand; `first` takes the topmost one instead. */
export const searchLibraryByCost =
  (maxCost: Value<number>, first?: Value<boolean>): Effect =>
  (ctx, params) =>
    ctx.issue({
      type: "search-cost",
      player: ctx.source.controller,
      maxCost: read(maxCost, params),
      first: first === undefined ? false : read(first, params),
      source: ctx.source.id,
    });
export const ransack = (): Effect => (ctx) =>
  ctx.issue({ type: "ransack", player: ctx.source.controller, source: ctx.source.id });
export const gainEnergy =
  (output: Value<Pool>): Effect =>
  (ctx, params) =>
    ctx.issue({
      type: "gain-energy",
      player: ctx.source.controller,
      output: read(output, params),
      source: ctx.source.id,
    });
/** Energy of each type of the selected card, or neutral energy for a card with no faction. */
export const gainEnergyOfTypes =
  (targets: Selector, amount: Value<number>): Effect =>
  (ctx, params) => {
    for (const target of targets(ctx, params)) {
      const factions = ctx.registry.cards[ctx.state.cards[target].definitionId].factions,
        types = factions.length ? factions : ["neutral"],
        gained = read(amount, params);
      ctx.issue({
        type: "gain-energy",
        player: ctx.source.controller,
        output: Object.fromEntries(types.map((type) => [type, gained])),
        source: ctx.source.id,
      });
    }
  };
/** Energy of the chosen type, for abilities whose target is an energy type rather than a card. */
export const gainEnergyOfChosen =
  (amount: Value<number>): Effect =>
  (ctx, params) => {
    if (ctx.target)
      ctx.issue({
        type: "gain-energy",
        player: ctx.source.controller,
        output: { [ctx.target]: read(amount, params) },
        source: ctx.source.id,
      });
  };
/** The top cards of your library go to your discard pile. */
export const mill =
  (amount: Value<number>): Effect =>
  (ctx, params) =>
    ctx.issue({ type: "mill", player: ctx.source.controller, amount: read(amount, params) });
/** Puts the chosen card onto the chosen free position. Does nothing without both. `ready` skips entering exhausted. */
export const deployChosen =
  (options: { ready?: boolean } = {}): Effect =>
  (ctx) => {
    if (ctx.target && ctx.slot !== undefined)
      ctx.issue({
        type: "deploy",
        target: ctx.target,
        player: ctx.source.controller,
        slot: ctx.slot,
        ...(options.ready ? { ready: true } : {}),
      });
  };
/** Runs the effects in order. */
export const sequence =
  (...effects: Effect[]): Effect =>
  (ctx, params) => {
    for (const effect of effects) effect(ctx, params);
  };
export const onlyIf =
  (condition: Condition, ...effects: Effect[]): Effect =>
  (ctx, params) => {
    if (condition(ctx, params)) sequence(...effects)(ctx, params);
  };
/** For `cast` and `activate`: the effects as one function. */
export const run = sequence;

// Triggers
/** Combines trigger blocks. Hooks on the same event run in the order given. */
export function triggers(...all: Hooks[]): Hooks {
  const merged: Hooks = {};
  for (const hooks of all)
    for (const [event, hook] of Object.entries(hooks)) {
      const earlier = merged[event];
      merged[event] = earlier
        ? (ctx, params) => {
            earlier(ctx, params);
            hook(ctx, params);
          }
        : hook;
    }
  return merged;
}
export const when = (event: string, condition: Condition, ...effects: Effect[]): Hooks => ({
  [event]: (ctx, params) => {
    if (condition(ctx, params)) sequence(...effects)(ctx, params);
  },
});
/** When this card is played by the player. Entering by other means (Rally, Raise) has no chosen target, so effects on `chosen` do nothing. */
export const whenPlayed = (...effects: Effect[]) =>
  when("card.played", (ctx) => ctx.event.cardId === ctx.source.id, ...effects);
/**
 * When a creature its controller owns is destroyed. `other` leaves out this card itself; `subtype` limits it to one subtype (exact match).
 * `where` adds any further condition about the dead creature, e.g. `or(diedWithSubtype("orc"), diedWithSubtype("goblin"))`.
 */
export const whenFriendlyDies = (
  filter: { subtype?: Value<string>; other?: boolean; where?: Condition },
  ...effects: Effect[]
) =>
  when(
    "creature.destroyed",
    and(
      friendlyDied,
      ...(filter.other ? [not(selfDied)] : []),
      ...(filter.subtype !== undefined ? [diedWithSubtype(filter.subtype)] : []),
      ...(filter.where ? [filter.where] : []),
    ),
    ...effects,
  );

// Conditions on a hook
/** The event's creature is the card itself. */
export const selfDied: Condition = (ctx) => ctx.event.cardId === ctx.source.id;
/** The destroyed creature was controlled by the same player as this card. */
export const friendlyDied: Condition = (ctx) =>
  !!ctx.event.snapshot && ctx.event.snapshot.controller === ctx.source.controller;
/** The destroyed creature has the subtype (exact, case-sensitive match). */
export const diedWithSubtype =
  (subtype: Value<string>): Condition =>
  (ctx, params) => {
    const dead = ctx.event.snapshot;
    return !!dead && ctx.registry.cards[dead.definitionId].subtypes.includes(read(subtype, params));
  };
/** The event was caused by this card's controller. */
export const byYou: Condition = (ctx) => ctx.event.player === ctx.source.controller;
/** The spell that was just cast has this subtype. Left out (undefined), any spell qualifies. */
export const castSpellSubtype =
  (subtype: Value<string | undefined>): Condition =>
  (ctx, params) => {
    const wanted = read(subtype, params);
    if (!wanted) return true;
    const id = ctx.event.cardId;
    return !!id && ctx.registry.cards[ctx.state.cards[id].definitionId].subtypes.includes(wanted);
  };
export const duringYourPlayPhase: Condition = (ctx) =>
  ctx.state.phase === "play" && ctx.state.active === ctx.source.controller;
/** The event is the controller's first of its type since the current turn started. */
export const firstThisTurn =
  (type: string): Condition =>
  (ctx) => {
    let start = ctx.state.events.length - 1;
    while (start >= 0 && ctx.state.events[start].type !== "turn.started") start--;
    return (
      ctx.state.events
        .slice(start + 1)
        .filter((event) => event.type === type && event.player === ctx.source.controller).length ===
      1
    );
  };

// Static modifiers: continuous bonuses a card gives to cards on the battlefield
/** What a continuous modifier looks at: the card that has the ability and the card it may apply to. */
export type StaticContext = {
  source: CardInstance;
  target: CardInstance;
  registry: Registry;
  state?: BattlefieldState;
};
export type StaticCondition = Predicate<StaticContext>;
/** A literal, or a function of the parameters and what the modifier is looking at. */
export type StaticAmount = number | ((params: Params, context: StaticContext) => number);
export type Modifier = (
  context: StaticContext,
  params: Params,
) => { attack?: number; defense?: number };

const targetCard = (context: StaticContext) => context.registry.cards[context.target.definitionId];
export const targetIsSource: StaticCondition = ({ source, target }) => source.id === target.id;
export const sameController: StaticCondition = ({ source, target }) =>
  source.controller === target.controller;
export const otherController: StaticCondition = ({ source, target }) =>
  source.controller !== target.controller;
/** Neighbouring position, same side. Both cards must be on the battlefield. */
export const adjacent: StaticCondition = ({ source, target }) => areAdjacent(source, target);
/** On the other side, in the same lane. */
export const opposite: StaticCondition = ({ source, target }) =>
  source.controller !== target.controller &&
  source.slot !== null &&
  target.zone === "board" &&
  source.slot === target.slot;
export const targetOnBoard: StaticCondition = ({ target }) => target.zone === "board";
export const targetIsCreature: StaticCondition = (context) =>
  targetCard(context).type === "creature";
export const targetHasSubtype =
  (subtype: Value<string>): StaticCondition =>
  (context, params) =>
    targetCard(context).subtypes.includes(read(subtype, params));
/** The source stands on the first or last position. */
export const sourceOnFlank: StaticCondition = ({ source }) =>
  source.slot === 0 || source.slot === battlefieldPositions.length - 1;
/** How many creatures stand next to the source. Zero when the battlefield is not available. */
export const adjacentCreatures: StaticAmount = (_params, { source, registry, state }) =>
  state
    ? state.players[source.controller].board.filter(
        (id) =>
          id &&
          registry.cards[state.cards[id].definitionId].type === "creature" &&
          areAdjacent(source, state.cards[id]),
      ).length
    : 0;

/** How many cards of the given types lie in the discard pile of the card's controller. Zero when the piles are not available. */
export const cardsInDiscard =
  (types: Value<readonly string[]>): StaticAmount =>
  (params, { source, registry, state }) => {
    const wanted = read(types, params);
    return (state?.players[source.controller].discard ?? []).filter((id) =>
      wanted.includes(registry.cards[state!.cards[id].definitionId].type),
    ).length;
  };
/** The parameter's value for every spell its controller has cast this turn. Zero when the count is not available or the parameter is left out. */
export const perSpellCast =
  (value: Value<number | undefined>): StaticAmount =>
  (params, { source, state }) =>
    (read(value, params) ?? 0) * (state?.players[source.controller].spellsCast ?? 0);
/** The amount, but only while the ability's `stat` parameter names this stat. */
export const forStat =
  (stat: "attack" | "defense", amount: StaticAmount): StaticAmount =>
  (params, context) =>
    params.stat === stat ? readStatic(amount, params, context) : 0;

const readStatic = (amount: StaticAmount, params: Params, context: StaticContext) =>
  typeof amount === "function" ? amount(params, context) : amount;
/** While the condition holds for a (source, target) pair, the target gets the bonus. */
export const modify =
  (
    condition: StaticCondition,
    bonus: { attack?: StaticAmount; defense?: StaticAmount },
  ): Modifier =>
  (context, params) => {
    if (!condition(context, params)) return {};
    const attack = bonus.attack === undefined ? 0 : readStatic(bonus.attack, params, context);
    const defense = bonus.defense === undefined ? 0 : readStatic(bonus.defense, params, context);
    return { ...(attack ? { attack } : {}), ...(defense ? { defense } : {}) };
  };
/** For `static`: several modifiers as one. Their bonuses add up. */
export const modifiers =
  (...all: Modifier[]): NonNullable<AbilityExtension["static"]> =>
  (source, target, params, registry, state) => {
    const result: { attack?: number; defense?: number } = {};
    for (const modifier of all) {
      const bonus = modifier({ source, target, registry, state }, params);
      if (bonus.attack) result.attack = (result.attack ?? 0) + bonus.attack;
      if (bonus.defense) result.defense = (result.defense ?? 0) + bonus.defense;
    }
    return result;
  };

// Replacements: change what is about to happen
export type Replacement = (
  payload: BeforePayload,
  params: Params,
  ctx: HookContext,
) => BeforePayload;
/** Damage taken is lower by the amount, down to zero. */
export const reduceDamage =
  (amount: Value<number>): Replacement =>
  (payload, params) => ({
    ...payload,
    amount: Math.max(0, (payload.amount ?? 0) - read(amount, params)),
  });
/** The creature enters the battlefield ready instead of exhausted. */
export const entersReady = (): Replacement => (payload) => ({ ...payload, exhausted: false });
/** Playing the card also costs a creature of yours with at least this cost. Several requirements keep the highest. */
export const requireSacrifice =
  (minimumCost: Value<number>): Replacement =>
  (payload, params) => ({
    ...payload,
    consume: true,
    consumeMin: Math.max(payload.consumeMin ?? 0, read(minimumCost, params)),
  });
/** Playing the card also costs returning a creature of yours to its owner's hand. */
export const requireReturn = (): Replacement => (payload) => ({
  ...payload,
  consume: true,
  returns: true,
});
/** Energy being produced includes more of one type. */
export const addEnergy =
  (type: string, amount: Value<number>): Replacement =>
  (payload, params) => ({
    ...payload,
    output: { ...payload.output, [type]: (payload.output?.[type] ?? 0) + read(amount, params) },
  });
/** For `before`: the replacements applied in order whenever the event is about to happen. */
export const replacing = (
  event: string,
  ...all: Replacement[]
): NonNullable<AbilityExtension["before"]> => ({
  [event]: (ctx, params, payload) =>
    all.reduce((current, replacement) => replacement(current, params, ctx), payload),
});
/** A replacement that applies only while the condition holds. */
export const replaceWhen =
  (condition: Condition, ...all: Replacement[]): Replacement =>
  (payload, params, ctx) =>
    condition(ctx, params)
      ? all.reduce((current, replacement) => replacement(current, params, ctx), payload)
      : payload;

// Combat rules
/** For `canBlock`: this card cannot be blocked when it attacks. It still blocks normally. */
export const unblockable: NonNullable<AbilityExtension["canBlock"]> = (source, attacker) =>
  source.id !== attacker.id;
/** For `intercepts`: this card steps in for attacks on a neighbouring lane, empty ones included. */
export const guardsAdjacentLanes: NonNullable<AbilityExtension["intercepts"]> = (
  source,
  _attacker,
  lane,
) => source.slot !== null && Math.abs(source.slot - lane) === 1;

// Activation conditions
/** What an activation restriction looks at. */
export type ActivationContext = {
  source: CardInstance;
  state: Readonly<GameState>;
  registry: Registry;
};
export const libraryHasAtLeast =
  (cards: Value<number>): Predicate<ActivationContext> =>
  ({ source, state }, params) =>
    state.players[source.controller].deck.length >= read(cards, params);
/** For `canActivate`: the activation is allowed while the condition holds. */
export const activatableWhen =
  (condition: Predicate<ActivationContext>): NonNullable<AbilityExtension["canActivate"]> =>
  (source, state, params, registry) =>
    condition({ source, state, registry }, params);
