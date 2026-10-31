import { deckRules } from "@realms/contracts";
import type { AdventureContent } from "./deck";
import { adventureRules } from "./rules";
import {
  expandDeck,
  type AdventureDef,
  type Condition,
  type Effect,
  type Localized,
} from "./definition";

/** Every problem that would make an adventure unplayable or unfinishable. An empty list means it is safe to publish. */
export function validateAdventure(def: AdventureDef, content: AdventureContent): string[] {
  const problems: string[] = [];
  const say = (message: string) => problems.push(`${def.id}: ${message}`);
  const text = (value: Localized | undefined, where: string) => {
    if (!value?.en?.trim()) say(`${where} has no English text`);
  };
  text(def.name, "the adventure name");
  text(def.premise, "the premise");

  const unique = <T extends { id: string }>(list: T[], what: string) => {
    const seen = new Set<string>();
    for (const item of list) {
      if (seen.has(item.id)) say(`duplicate ${what} id "${item.id}"`);
      seen.add(item.id);
    }
    return seen;
  };
  const nodeIds = unique(def.nodes, "node"),
    eventIds = unique(def.events, "event"),
    enemyIds = unique(def.enemies, "enemy");

  const deckProblems = (
    cards: string[],
    what: string,
    minimum: number = deckRules.minimumCards,
  ) => {
    const counts = new Map<string, number>();
    for (const id of cards) {
      const card = content.cards[id];
      if (!card) {
        say(`${what} uses unknown card "${id}"`);
        continue;
      }
      counts.set(card.deckLimitKey, (counts.get(card.deckLimitKey) ?? 0) + 1);
      const limit = card.legendary ? deckRules.copiesPerLegendary : deckRules.copiesPerCard;
      if (counts.get(card.deckLimitKey)! > limit)
        say(`${what} has too many copies of ${card.name}`);
    }
    if (cards.length < minimum) say(`${what} has ${cards.length} cards; a deck needs ${minimum}`);
  };
  deckProblems(expandDeck(def.starterDeck), "the starter deck", adventureRules.minimumCards);
  for (const enemy of def.enemies) {
    deckProblems(expandDeck(enemy.deck), `enemy "${enemy.id}"`);
    text(enemy.name, `enemy "${enemy.id}"`);
    if (enemy.life !== undefined && !(enemy.life > 0)) say(`enemy "${enemy.id}" has no life`);
  }

  if (!nodeIds.has(def.start)) say(`start "${def.start}" is not a node`);
  const finals = def.nodes.filter((node) => node.type === "final");
  if (finals.length !== 1) say(`needs exactly one final battle, found ${finals.length}`);

  for (const node of def.nodes) {
    if (!(node.x >= 0 && node.x <= 100 && node.y >= 0 && node.y <= 100))
      say(`node "${node.id}" is off the map`);
    for (const next of node.next) {
      if (!nodeIds.has(next)) say(`node "${node.id}" leads to unknown "${next}"`);
      if (next === node.id) say(`node "${node.id}" leads to itself`);
    }
    if (node.type === "final" && node.next.some((id) => byNodeType(def, id) !== "event"))
      say(`the final battle "${node.id}" can only lead to story nodes`);
    if (
      node.type !== "final" &&
      !node.next.length &&
      !(
        node.type === "event" &&
        def.nodes.some(
          (n) => n.next.includes(node.id) && (n.type === "event" || n.type === "final"),
        )
      )
    )
      say(`node "${node.id}" is a dead end`);
    if (node.event && !eventIds.has(node.event))
      say(`node "${node.id}" uses unknown event "${node.event}"`);
    if (node.type === "event" && !node.event) say(`event node "${node.id}" has no event`);
    if (node.type === "battle" || node.type === "elite" || node.type === "final") {
      if (node.enemy && !enemyIds.has(node.enemy))
        say(`node "${node.id}" uses unknown enemy "${node.enemy}"`);
      if (!node.enemy && !node.pool) say(`battle "${node.id}" has no enemy or pool`);
      if (node.pool) {
        const pool = def.pools[node.pool];
        if (!pool?.length) say(`node "${node.id}" draws from empty pool "${node.pool}"`);
      }
    }
  }
  for (const [name, pool] of Object.entries(def.pools))
    for (const id of pool) if (!enemyIds.has(id)) say(`pool "${name}" lists unknown enemy "${id}"`);

  // Graph: acyclic, everything reachable from the start, everything can still reach the end.
  const byId = new Map(def.nodes.map((node) => [node.id, node]));
  const state = new Map<string, 1 | 2>();
  const visit = (id: string, trail: string[]) => {
    if (state.get(id) === 2) return;
    if (state.get(id) === 1) return say(`the route loops: ${[...trail, id].join(" > ")}`);
    state.set(id, 1);
    for (const next of byId.get(id)?.next ?? []) if (byId.has(next)) visit(next, [...trail, id]);
    state.set(id, 2);
  };
  if (byId.has(def.start)) visit(def.start, []);
  const reached = new Set<string>(),
    walk = (id: string) => {
      if (reached.has(id) || !byId.has(id)) return;
      reached.add(id);
      byId.get(id)!.next.forEach(walk);
    };
  walk(def.start);
  for (const node of def.nodes)
    if (!reached.has(node.id)) say(`node "${node.id}" cannot be reached`);
  const beforeFinal = new Set<string>();
  const walkBeforeFinal = (id: string) => {
    if (beforeFinal.has(id) || !byId.has(id) || byId.get(id)!.type === "final") return;
    beforeFinal.add(id);
    byId.get(id)!.next.forEach(walkBeforeFinal);
  };
  walkBeforeFinal(def.start);
  for (const id of beforeFinal)
    if (!byId.get(id)!.next.length) say(`node "${id}" can end before the final battle`);
  const afterFinal = new Set<string>();
  const walkAfterFinal = (id: string) => {
    if (afterFinal.has(id) || !byId.has(id)) return;
    afterFinal.add(id);
    const node = byId.get(id)!;
    if (node.type !== "event") say(`node "${id}" after the final battle must be a story`);
    node.next.forEach(walkAfterFinal);
  };
  finals.forEach((node) => node.next.forEach(walkAfterFinal));
  const toEnd = new Set<string>([...finals.map((node) => node.id), ...afterFinal]);
  for (let changed = true; changed;) {
    changed = false;
    for (const node of def.nodes)
      if (!toEnd.has(node.id) && node.next.some((next) => toEnd.has(next))) {
        toEnd.add(node.id);
        changed = true;
      }
  }
  for (const node of def.nodes)
    if (!toEnd.has(node.id)) say(`node "${node.id}" cannot reach the final battle`);

  // Scenes.
  const flagsSet = new Set<string>();
  const effectsOf = (list: Effect[], where: string) => {
    for (const effect of list) {
      if (effect.type === "flag") flagsSet.add(effect.flag);
      if (
        (effect.type === "addCard" || effect.type === "removeCard" || effect.type === "recruit") &&
        !content.cards[effect.card]
      )
        say(`${where} uses unknown card "${effect.card}"`);
      if (
        effect.type === "recruit" &&
        content.cards[effect.card] &&
        !content.cards[effect.card].legendary
      )
        say(`${where} recruits non-legendary card "${effect.card}"`);
      if (effect.type === "battle" && !enemyIds.has(effect.enemy))
        say(`${where} starts a fight with unknown enemy "${effect.enemy}"`);
      if (effect.type === "offer")
        for (const id of effect.cards ?? [])
          if (!content.cards[id]) say(`${where} offers unknown card "${id}"`);
      if (effect.type === "booster" && !(effect.count > 0)) say(`${where} grants no boosters`);
    }
  };
  const conditions: { list: Condition[]; where: string }[] = [];
  const boosterIds = new Set<string>();
  for (const event of def.events) {
    const where = `event "${event.id}"`;
    if (!event.beats.length) say(`${where} has no text`);
    event.beats.forEach((beat, i) => text(beat, `${where} beat ${i + 1}`));
    effectsOf(event.effects ?? [], where);
    if (event.choices?.length) {
      const ids = new Set<string>();
      for (const choice of event.choices) {
        if (ids.has(choice.id)) say(`${where} repeats choice "${choice.id}"`);
        ids.add(choice.id);
        text(choice.label, `${where} choice "${choice.id}"`);
        effectsOf(choice.effects, `${where} choice "${choice.id}"`);
        if (choice.when)
          conditions.push({ list: choice.when, where: `${where} choice "${choice.id}"` });
      }
      if (!event.choices.some((choice) => !choice.when?.length))
        say(`${where} needs a choice that is always open, or the run could get stuck`);
    }
    for (const effect of [
      ...(event.effects ?? []),
      ...(event.choices ?? []).flatMap((c) => c.effects),
    ])
      if (effect.type === "booster") {
        if (boosterIds.has(effect.id)) say(`booster id "${effect.id}" is used twice`);
        boosterIds.add(effect.id);
      }
  }
  for (const { list, where } of conditions)
    for (const condition of list)
      if ("flag" in condition && !flagsSet.has(condition.flag))
        say(`${where} needs flag "${condition.flag}", which nothing sets`);
      else if ("card" in condition && !content.cards[condition.card])
        say(`${where} needs unknown card "${condition.card}"`);
  return problems;
}
const byNodeType = (def: AdventureDef, id: string) => def.nodes.find((n) => n.id === id)?.type;
