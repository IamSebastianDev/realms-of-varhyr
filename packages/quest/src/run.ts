import type { QuestContent } from "./content";
import { baseDeck, candidates, canAdd, enemyDeck, offerPack, playableFactions } from "./deck";
import { questRules } from "./rules";
import { makeRng, hashString, type Rng } from "./rng";
import type { MapNode, QuestMap } from "./map";
import {
  allNodes,
  bossName,
  distance,
  affiliationAt,
  generateWorld,
  generatedPlaces,
  pickStart,
  placeDestination,
  resolveRole,
  rollCache,
  templateOf,
  type CacheFind,
  type Role,
  type World,
} from "./world";

export type Enemy = { name: string; faction: string; deck: string[]; life: number };
export type Pick = {
  kind: "pick";
  title: string;
  size: number;
  pick: number;
  cards: string[];
  source: "draft" | "reward" | "exchange" | "found";
  taken: string[];
};
export type Shop = {
  kind: "shop";
  premium: boolean;
  items: { card: string; price: number; sold: boolean }[];
};
/** The rumors a settlement knows, kept in `RunState.rumors`; the offer only says which settlement is listening. */
export type RumorView = { kind: "rumors"; origin: string };
export type Offer = Pick | Shop | RumorView;
export type Reward = { packs: number; silver: number };
export type Rumor = { id: string; template: string; reward: Reward; accepted: boolean };
/** An accepted rumor: a saved destination that pays its reward once when cleared. */
export type Quest = {
  id: string;
  template: string;
  origin: string;
  destination: string;
  /** The booster pack its packs come from. */ pack: string;
  reward: Reward;
  status: "active" | "done";
};
/** Something the account is owed (boosters, crowns), recorded once per source so it can be applied exactly once. */
export type Payout = {
  id: string;
  source: "boss" | "quest";
  title: string;
  packs: Record<string, number>;
  crowns: number;
};
export type Encounter = {
  node: string;
  role: Role;
  /** Actions already used here, so each can happen once. */ used: string[];
};
export type Fight = { node: string; enemy: Enemy; seed: number; tier: number };
export type Stage = "draft" | "map" | "over";
export type Result = "dead" | "retired";

/** Everything about an expedition in plain data, saved between nodes. */
export type RunState = {
  version: 2;
  id: string;
  pack: string;
  faction: string;
  /** Seeds the world, rewards and every roll; nothing that was rolled is ever rolled again. */
  seed: number;
  step: number;
  startedAt: number;
  stage: Stage;
  result: Result | null;
  deck: string[];
  life: number;
  silver: number;
  drafted: number;
  position: string;
  visited: string[];
  /** The places walked to, oldest first (kept short). The map draws the last few legs as a trail. */
  route: string[];
  /** Nodes drawn on the map, rebuilt from where the player has been. */
  revealed: string[];
  /** Waymarks read so far; each lights up a wider circle. */
  beacons: string[];
  world: World;
  /** Places that accepted quests added to the map. */
  extra: MapNode[];
  /** What each cache holds, saved when the place is first visited. */
  caches: Record<string, CacheFind>;
  /** The enemy tier each fight place locked in when it was first visited. */
  tiers: Record<string, number>;
  rumors: Record<string, Rumor[]>;
  /** The place where a new boss rose after the last one fell. Shown as a rumor and kept on the map until the next journey. */
  risen: string | null;
  quests: Quest[];
  earned: Payout[];
  offer: Offer | null;
  encounter: Encounter | null;
  fight: Fight | null;
  stats: { fights: number; silverEarned: number };
};

export type StartInput = {
  map: QuestMap;
  content: QuestContent;
  pack: string;
  faction: string;
  now: number;
  seed: number;
};

const rngFor = (state: RunState) => makeRng(hashString(`${state.seed}|${state.step}`));
const next = (state: RunState, change: Partial<RunState>): RunState => ({
  ...state,
  ...change,
  step: state.step + 1,
});
const between = (rng: Rng, range: readonly [number, number]) => rng.range(range[0], range[1]);
const lookup = (map: QuestMap, state: Pick2) =>
  new Map(allNodes(map, state.extra).map((node) => [node.id, node]));
type Pick2 = { extra: readonly MapNode[] };

export function startRun({ map, content, pack, faction, now, seed }: StartInput): RunState {
  const start = pickStart(map, faction, seed);
  if (!start) throw new Error("This faction has no start site on the map.");
  const state: RunState = {
    version: 2,
    id: `${pack}|${faction}|${seed}`,
    pack,
    faction,
    seed,
    step: 0,
    startedAt: now,
    stage: "draft",
    result: null,
    deck: baseDeck(content, faction),
    life: questRules.maxLife,
    silver: questRules.startSilver,
    drafted: 0,
    position: start.id,
    route: [start.id],
    visited: [],
    revealed: [],
    beacons: [],
    world: generateWorld(map, start.id, seed),
    extra: generatedPlaces(map, seed),
    caches: {},
    tiers: {},
    rumors: {},
    risen: null,
    quests: [],
    earned: [],
    offer: null,
    encounter: null,
    fight: null,
    stats: { fights: 0, silverEarned: 0 },
  };
  return draftOffer(state, content);
}

function draftOffer(state: RunState, content: QuestContent): RunState {
  const cards = offerPack(content, state.faction, state.deck, rngFor(state), questRules.packSize);
  if (!cards.length) return finishDraft(state);
  return next(state, {
    offer: {
      kind: "pick",
      title: "Draft",
      size: questRules.packSize,
      pick: 1,
      cards,
      source: "draft",
      taken: [],
    },
  });
}
function finishDraft(state: RunState): RunState {
  return next(state, { stage: "map", offer: null });
}

/** Which nodes are drawn: everything within reach of where the player has been, plus the destinations of accepted quests. */
export function reveal(state: RunState, map: QuestMap): string[] {
  const nodes = lookup(map, state),
    reveal = map.settings.reveal;
  const start = pickStart(map, state.faction, state.seed);
  const sources = [start?.id, state.position, ...state.visited]
    .filter((id, index, all) => id && all.indexOf(id) === index)
    .map((id) => nodes.get(id!))
    .filter(Boolean) as { x: number; y: number }[];
  const wide = state.beacons.map((id) => nodes.get(id)).filter(Boolean) as {
    x: number;
    y: number;
  }[];
  const shown = new Set<string>([
    ...(state.risen ? [state.risen] : []),
    ...state.quests.filter((quest) => quest.status === "active").map((quest) => quest.destination),
  ]);
  for (const node of nodes.values()) {
    if (!state.world[node.id]) continue;
    if (
      sources.some((source) => distance(map, source, node) <= reveal) ||
      wide.some((source) => distance(map, source, node) <= reveal * questRules.waymarkReveal)
    )
      shown.add(node.id);
  }
  return [...shown];
}
export const sync = (state: RunState, map: QuestMap): RunState => ({
  ...state,
  revealed: reveal(state, map),
});

/** Take one of the offered cards (the draft, a reward, an exchange). */
export function takeCard(
  state: RunState,
  content: QuestContent,
  map: QuestMap,
  id: string,
): RunState {
  const offer = state.offer;
  if (state.stage === "over" || !offer || offer.kind !== "pick")
    throw new Error("There is nothing to pick from.");
  if (!offer.cards.includes(id) || offer.taken.includes(id))
    throw new Error("That card is not on offer.");
  if (!canAdd(content, state.deck, id)) throw new Error("The deck cannot take another copy.");
  const taken = [...offer.taken, id],
    deck = [...state.deck, id];
  if (offer.source === "draft") {
    const drafted = state.drafted + 1,
      after = { ...state, deck, drafted };
    return drafted >= questRules.draftPicks
      ? sync(finishDraft(after), map)
      : draftOffer(after, content);
  }
  const done = taken.length >= offer.pick;
  return next(state, { deck, offer: done ? null : { ...offer, taken } });
}
/** Turn down what is on offer; the draft cannot be skipped. */
export function skipOffer(state: RunState): RunState {
  if (!state.offer || (state.offer.kind === "pick" && state.offer.source === "draft")) return state;
  return next(state, { offer: null });
}

/** Any place the map has shown can be walked to, including ones used up before: a city still sells, a cleared place just stands there. */
export const canTravel = (state: RunState, id: string) =>
  state.stage === "map" && !state.offer && !state.fight && state.revealed.includes(id);

const grade = (state: RunState, content: QuestContent) =>
  state.deck.reduce(
    (sum, id) => sum + (questRules.gradePoints[content.cards[id]?.rarity ?? "common"] ?? 0),
    0,
  );
/** How strong enemies are: wins plus the deck's card grade, in steps. A boost to the deck is only partly answered by the enemy. */
export const tierOf = (state: RunState, content: QuestContent) =>
  Math.min(
    questRules.maxTier,
    Math.floor((state.stats.fights + grade(state, content)) / questRules.tierStep),
  );

/** Walk to a node and open it. The first visit to a travel location settles what it is, for good. */
export function travel(
  state: RunState,
  map: QuestMap,
  id: string,
  content?: QuestContent,
): RunState {
  if (!canTravel(state, id)) throw new Error("That place cannot be reached.");
  let world = state.world,
    caches = state.caches,
    tiers = state.tiers;
  if (world[id] === "unknown") {
    const role = resolveRole(state.seed, id);
    world = { ...world, [id]: role };
    if (role === "cache") caches = { ...caches, [id]: rollCache(state.seed, id) };
  }
  const role = world[id]!;
  if (
    tiers[id] === undefined &&
    content &&
    (role === "encounter" || role === "boss" || role === "arena")
  )
    tiers = { ...tiers, [id]: tierOf(state, content) };
  return sync(
    next(state, {
      world,
      caches,
      tiers,
      position: id,
      route: [...(state.route ?? [state.position]), id].slice(-40),
      encounter: { node: id, role, used: [] },
    }),
    map,
  );
}
/** Close the place. A place you used counts as visited once you walk away. */
export function leave(state: RunState, map: QuestMap): RunState {
  if (state.fight || (state.offer?.kind === "pick" && state.offer.source === "draft")) return state;
  const encounter = state.encounter,
    usedUp = !!encounter && encounter.used.length > 0 && !state.visited.includes(encounter.node);
  return sync(
    next(state, {
      encounter: null,
      offer: null,
      visited: usedUp ? [...state.visited, encounter!.node] : state.visited,
    }),
    map,
  );
}

function done(state: RunState, map: QuestMap, change: Partial<RunState> = {}): RunState {
  const node = state.encounter?.node;
  return sync(
    next(state, {
      ...change,
      visited: node && !state.visited.includes(node) ? [...state.visited, node] : state.visited,
    }),
    map,
  );
}
const use = (state: RunState, action: string): Encounter => ({
  ...state.encounter!,
  used: [...state.encounter!.used, action],
});
const heal = (state: RunState, amount: number) => Math.min(questRules.maxLife, state.life + amount);

export type Action =
  | { type: "fight" }
  | { type: "heal" }
  | { type: "shop" }
  | { type: "buy"; index: number }
  | { type: "rumors" }
  | { type: "accept"; rumor: string }
  | { type: "search" }
  | { type: "read" }
  | { type: "exchange"; index: number }
  | { type: "smith"; index: number };

/** What a role can do, for the dialog's buttons. Villages offer no healing and no market; cities offer both. */
export function actionsFor(role: Role): Action["type"][] {
  switch (role) {
    case "encounter":
    case "boss":
    case "arena":
      return ["fight"];
    case "camp":
      return ["heal"];
    case "city":
      return ["heal", "shop", "rumors", "smith"];
    case "village":
      return ["rumors", "smith"];
    case "capital":
      return ["shop", "smith"];
    case "merchant":
      return ["shop"];
    case "shrine":
      return ["exchange"];
    case "ruin":
    case "cache":
      return ["search"];
    case "waymark":
    case "landmark":
      return ["read"];
    case "unknown":
      return [];
  }
}

/** What a copy sells for at the end of the expedition; a smith pays a share of it, rounded down. */
export const keepPriceOf = (content: QuestContent, id: string) =>
  questRules.keepPrice[content.cards[id]?.rarity ?? "common"];
export const smithValue = (content: QuestContent, id: string) =>
  Math.floor(keepPriceOf(content, id) * questRules.smithShare);

function shopItems(state: RunState, content: QuestContent, premium: boolean) {
  const rng = rngFor(state),
    prices = premium ? questRules.capitalPrices : questRules.shopPrice;
  const cards = offerPack(
    content,
    state.faction,
    state.deck,
    rng,
    questRules.shopSize,
    premium ? ["rare", "legendary"] : undefined,
  );
  const fallback = cards.length
    ? cards
    : offerPack(content, state.faction, state.deck, rng, questRules.shopSize);
  return fallback.map((card) => ({
    card,
    price: prices[content.cards[card]!.rarity],
    sold: false,
  }));
}

const questAt = (state: RunState, node: string) =>
  state.quests.find((quest) => quest.destination === node && quest.status === "active");

function enemyFor(
  state: RunState,
  content: QuestContent,
  map: QuestMap,
  node: string,
  role: Role,
  tier: number,
): Enemy {
  const rng = makeRng(hashString(`${state.seed}|enemy|${node}`));
  const at = lookup(map, state).get(node);
  const playable = playableFactions(content);
  const others = playable.filter((faction) => faction !== state.faction);
  const own =
    at?.affiliation && playable.includes(at.affiliation)
      ? at.affiliation
      : rng.pick(others.length ? others : playable);
  const names = content.factionNames?.[own] ?? own;
  if (role === "boss")
    return {
      name: bossName(own, state.seed, node),
      faction: own,
      deck: enemyDeck(content, own, rng),
      life: questRules.maxLife + questRules.bossLife + tier,
    };
  const quest = questAt(state, node);
  const name = quest
    ? templateOf(quest.template).enemy
    : role === "arena"
      ? `Champion of ${names}`
      : `Raiders of ${names}`;
  return {
    name,
    faction: own,
    deck: enemyDeck(content, own, rng),
    life: questRules.maxLife + tier + (role === "arena" ? 3 : 0),
  };
}

/** The settlement's rumors, made the first time anyone asks and kept from then on. */
function rumorsAt(state: RunState, node: string): Rumor[] {
  const known = state.rumors[node];
  if (known) return known;
  return Array.from({ length: questRules.rumorsPerSettlement }, (_, index) => {
    const rng = makeRng(hashString(`${state.seed}|rumor|${node}|${index}`)),
      pool = ["bandits", "raiders", "deserters"];
    const template = templateOf(rng.pick(pool));
    return {
      id: `${node}:${index}`,
      template: template.id,
      reward: { packs: template.packs, silver: template.silver },
      accepted: false,
    };
  });
}
const packOf = (content: QuestContent, state: RunState, affiliation: string) =>
  content.packs.find((pack) => pack.factions.includes(affiliation))?.id ?? state.pack;
const earn = (state: RunState, payout: Payout): RunState =>
  state.earned.some((entry) => entry.id === payout.id)
    ? state
    : { ...state, earned: [...state.earned, payout] };

export function act(
  state: RunState,
  content: QuestContent,
  map: QuestMap,
  action: Action,
): RunState {
  const encounter = state.encounter;
  if (state.stage !== "map" || !encounter || state.fight) throw new Error("Nothing to do here.");
  const { role, node } = encounter,
    rng = rngFor(state);
  const kind = action.type === "buy" ? "shop" : action.type === "accept" ? "rumors" : action.type;
  if (!actionsFor(role).includes(kind)) throw new Error(`A ${role} cannot do that.`);
  const repeatable = ["buy", "exchange", "smith", "accept", "shop", "rumors"];
  if (!repeatable.includes(action.type) && encounter.used.includes(action.type))
    throw new Error("Already done here.");
  if (["search", "read", "exchange"].includes(action.type) && state.visited.includes(node))
    throw new Error("Already done here."); // Coming back to a place does not renew what it gave.
  switch (action.type) {
    case "fight": {
      if (state.visited.includes(node)) throw new Error("This place has been cleared.");
      const tier = state.tiers[node] ?? tierOf(state, content);
      return next(state, {
        fight: {
          node,
          tier,
          enemy: enemyFor(state, content, map, node, role, tier),
          seed: (rng.next() * 4294967295) >>> 0 || 1,
        },
      });
    }
    case "heal": {
      const rate =
        role === "camp" ? questRules.campHealSilverPerLife : questRules.cityHealSilverPerLife;
      const missing = questRules.maxLife - state.life,
        afford = Math.floor(state.silver / rate),
        amount = Math.min(missing, afford);
      if (amount <= 0)
        throw new Error(missing ? "Not enough silver to heal." : "Already at full life.");
      const change = {
        life: state.life + amount,
        silver: state.silver - amount * rate,
        encounter: use(state, "heal"),
      };
      return role === "camp" ? done(state, map, change) : next(state, change);
    }
    case "shop": {
      const premium = role === "capital";
      return next(state, {
        offer: { kind: "shop", premium, items: shopItems(state, content, premium) },
        encounter: use(state, "shop"),
      });
    }
    case "buy": {
      const offer = state.offer;
      if (!offer || offer.kind !== "shop") throw new Error("No shop is open.");
      const item = offer.items[action.index];
      if (!item || item.sold) throw new Error("That is not for sale.");
      if (state.silver < item.price) throw new Error("Not enough silver.");
      if (!canAdd(content, state.deck, item.card))
        throw new Error("The deck cannot take another copy.");
      const items = offer.items.map((entry, index) =>
        index === action.index ? { ...entry, sold: true } : entry,
      );
      const bought = {
        ...state,
        deck: [...state.deck, item.card],
        silver: state.silver - item.price,
        offer: { ...offer, items },
      };
      return next(bought, {
        encounter: encounter.used.includes("buy") ? encounter : use(state, "buy"),
      });
    }
    case "rumors": {
      const rumors = rumorsAt(state, node);
      return next(state, {
        rumors: { ...state.rumors, [node]: rumors },
        offer: { kind: "rumors", origin: node },
        encounter: encounter.used.includes("rumors") ? encounter : use(state, "rumors"),
      });
    }
    case "accept": {
      const list = rumorsAt(state, node),
        rumor = list.find((entry) => entry.id === action.rumor);
      if (!rumor) throw new Error("Nobody here knows of that.");
      if (rumor.accepted) throw new Error("You already took this task.");
      const origin = lookup(map, state).get(node)!;
      const spot = placeDestination(
        map,
        state.extra,
        origin,
        makeRng(hashString(`${state.seed}|destination|${rumor.id}`)),
      );
      if (!spot) throw new Error("No road leads there.");
      const id = `q${state.quests.length + 1}`,
        affiliation = affiliationAt(map, spot);
      const place: MapNode = {
        id,
        x: spot.x,
        y: spot.y,
        kind: "transient",
        affiliation,
        name: templateOf(rumor.template).title,
      };
      const quest: Quest = {
        id: rumor.id,
        template: rumor.template,
        origin: node,
        destination: id,
        pack: packOf(content, state, origin.affiliation),
        reward: rumor.reward,
        status: "active",
      };
      const rumors = {
        ...state.rumors,
        [node]: list.map((entry) => (entry.id === rumor.id ? { ...entry, accepted: true } : entry)),
      };
      return sync(
        next(state, {
          extra: [...state.extra, place],
          world: { ...state.world, [id]: "encounter" },
          quests: [...state.quests, quest],
          rumors,
        }),
        map,
      );
    }
    case "search": {
      if (role === "cache") {
        const find = state.caches[node] ?? rollCache(state.seed, node);
        const base = { encounter: use(state, "search"), caches: { ...state.caches, [node]: find } };
        if (find.kind === "life")
          return done(state, map, { ...base, life: heal(state, find.amount) });
        if (find.kind === "silver")
          return done(state, map, {
            ...base,
            silver: state.silver + find.amount,
            stats: { ...state.stats, silverEarned: state.stats.silverEarned + find.amount },
          });
        return done(state, map, base);
      }
      if (rng.chance(0.5)) {
        const silver = between(rng, questRules.foundSilver);
        return done(state, map, {
          silver: state.silver + silver,
          encounter: use(state, "search"),
          stats: { ...state.stats, silverEarned: state.stats.silverEarned + silver },
        });
      }
      const cards = offerPack(content, state.faction, state.deck, rng, questRules.foundPick.size);
      if (!cards.length) return done(state, map, { encounter: use(state, "search") });
      return done(state, map, {
        encounter: use(state, "search"),
        offer: {
          kind: "pick",
          title: "Found",
          size: questRules.foundPick.size,
          pick: 1,
          cards,
          source: "found",
          taken: [],
        },
      });
    }
    case "read":
      return done(state, map, { beacons: [...state.beacons, node], encounter: use(state, "read") });
    case "exchange": {
      const id = state.deck[action.index];
      if (id === undefined) throw new Error("That card is not in the deck.");
      const card = content.cards[id]!,
        deck = state.deck.filter((_, index) => index !== action.index);
      const cards = offerPack(content, state.faction, deck, rng, questRules.exchangePick.size, [
        card.rarity,
      ]);
      if (!cards.length) throw new Error("Nothing here can replace that card.");
      return done(state, map, {
        deck,
        encounter: use(state, "exchange"),
        offer: {
          kind: "pick",
          title: "Exchange",
          size: questRules.exchangePick.size,
          pick: 1,
          cards,
          source: "exchange",
          taken: [],
        },
      });
    }
    case "smith": {
      const id = state.deck[action.index];
      if (id === undefined) throw new Error("That card is not in the deck.");
      if (state.deck.length <= questRules.minDeck)
        throw new Error(`The deck cannot go below ${questRules.minDeck} cards.`);
      return next(state, {
        deck: state.deck.filter((_, index) => index !== action.index),
        silver: state.silver + smithValue(content, id),
        encounter: encounter.used.includes("smith") ? encounter : use(state, "smith"),
      });
    }
  }
}

/** The match is over: carry the life forward and hand out what the fight was worth. */
export function finishFight(
  state: RunState,
  content: QuestContent,
  map: QuestMap,
  result: { won: boolean; life: number },
): RunState {
  const fight = state.fight;
  if (!fight) throw new Error("No fight is under way.");
  const rng = rngFor(state);
  if (!result.won || result.life <= 0)
    return next(state, {
      fight: null,
      encounter: null,
      offer: null,
      stage: "over",
      result: "dead",
      life: 0,
    });
  const role = state.world[fight.node]!,
    life = Math.min(questRules.maxLife, result.life);
  const stats = { ...state.stats, fights: state.stats.fights + 1 };
  const strong = role === "boss" || role === "arena";
  const silver = between(rng, strong ? questRules.arenaSilver : questRules.fightSilver);
  stats.silverEarned += silver;
  let deck = state.deck,
    current: RunState = { ...state };
  const quest = questAt(state, fight.node);
  let gained = silver;
  if (quest) {
    gained += quest.reward.silver;
    stats.silverEarned += quest.reward.silver;
    current = earn(current, {
      id: `quest:${quest.id}`,
      source: "quest",
      title: templateOf(quest.template).title,
      packs: quest.reward.packs ? { [quest.pack]: quest.reward.packs } : {},
      crowns: 0,
    });
    current = {
      ...current,
      quests: current.quests.map((entry) =>
        entry.id === quest.id ? { ...entry, status: "done" } : entry,
      ),
    };
  }
  if (role === "boss") {
    const at = lookup(map, state).get(fight.node),
      faction = at?.affiliation ?? state.faction;
    const prize = candidates(content, faction, deck, ["legendary"])[0];
    if (prize) deck = [...deck, prize.id];
    current = earn(current, {
      id: `boss:${fight.node}`,
      source: "boss",
      title: fight.enemy.name,
      packs: { [packOf(content, state, faction)]: 1 },
      crowns: 0,
    });
  }
  const { size, pick } = strong ? questRules.arenaPick : questRules.fightPick;
  const cards = offerPack(content, state.faction, deck, rng, size);
  const offer: Offer | null = cards.length
    ? { kind: "pick", title: "Spoils", size, pick, cards, source: "reward", taken: [] }
    : null;
  let world = state.world,
    tiers = state.tiers,
    visited = state.visited,
    risen: string | null = state.risen;
  if (role === "boss") {
    // Bosses never run out: the cleared stronghold goes back to being an ordinary place and another candidate takes up the banner.
    const cleared = map.nodes.find((node) => node.id === fight.node);
    world = { ...world, [fight.node]: cleared?.site ?? "landmark" };
    const startId = pickStart(map, state.faction, state.seed)?.id;
    const free = map.nodes.filter(
      (node) =>
        node.target && node.id !== startId && node.id !== fight.node && world[node.id] !== "boss",
    );
    const chosen = makeRng(hashString(`${state.seed}|${state.step}|foe`)).shuffle(free)[0];
    if (chosen) {
      world = { ...world, [chosen.id]: "boss" };
      risen = chosen.id;
      visited = visited.filter((id) => id !== chosen.id);
      tiers = Object.fromEntries(Object.entries(tiers).filter(([id]) => id !== chosen.id));
    }
  }
  const after: RunState = {
    ...current,
    world,
    tiers,
    visited,
    risen,
    deck,
    silver: state.silver + gained,
    life,
    stats,
    fight: null,
    encounter: { node: fight.node, role, used: ["fight"] },
  };
  return done(after, map, { offer });
}

/** Retiring is the player's choice; the final deck then opens as a purchase screen. */
export const retire = (state: RunState): RunState =>
  state.stage === "over"
    ? state
    : next(state, { stage: "over", result: "retired", fight: null, encounter: null, offer: null });

/** Reads a saved run. Only the current format loads: runs from the earlier daily mode simply end. */
export function loadRun(raw: unknown): RunState | null {
  const run = raw as Record<string, unknown> | null;
  if (!run || typeof run !== "object" || run.version !== 2 || !Array.isArray(run.deck)) return null;
  return {
    ...run,
    route: Array.isArray(run.route) ? run.route : [String(run.position)],
    risen: typeof run.risen === "string" ? run.risen : null,
  } as unknown as RunState;
}
