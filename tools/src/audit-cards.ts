import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { repoRoot } from "./repoRoot";

/**
 * A static look at the card pool: no games, only the numbers printed on the cards.
 * It finds outliers and gaps for a person to judge; it does not say what a card should be.
 * Usage: npm run audit:cards [-- --out report.md]
 */

type Params = Record<string, unknown>;
type Binding = { id: string; params?: Params };
type Card = {
  id: string;
  name: string;
  type: "creature" | "spell" | "holding";
  factions: string[];
  rarity: string;
  legendary?: boolean;
  cost: { generic: number; factions?: Record<string, number> };
  stats?: { attack: number; defense: number; energyOutputs?: Record<string, number>[] };
  abilities?: Binding[];
  cast?: Binding[];
  modal?: boolean;
};

const args = process.argv.slice(2);
const outIndex = args.indexOf("--out");
const out = outIndex >= 0 ? args[outIndex + 1] : undefined;

const cardsDir = join(repoRoot, "assets/cards");
const cards: Card[] = [];
for (const entry of await readdir(cardsDir, { withFileTypes: true }))
  if (entry.isDirectory() && !entry.name.startsWith("."))
    cards.push(JSON.parse(await readFile(join(cardsDir, entry.name, "data.json"), "utf8")));

const factionIds = (
  await Promise.all(
    (await readdir(join(repoRoot, "assets/factions"))).map(async (file) =>
      JSON.parse(await readFile(join(repoRoot, "assets/factions", file), "utf8")),
    ),
  )
)
  .map((faction) => faction.id as string)
  .filter((id) => id !== "neutral")
  .sort();

const totalCost = (card: Card) =>
  card.cost.generic + Object.values(card.cost.factions ?? {}).reduce((a, b) => a + b, 0);
/** The best single energy option, because a producer chooses one. */
const output = (card: Card) =>
  Math.max(
    0,
    ...(card.stats?.energyOutputs ?? []).map((option) =>
      Object.values(option).reduce((a, b) => a + b, 0),
    ),
  );
const power = (card: Card) => (card.stats ? card.stats.attack + card.stats.defense : 0);
const mean = (values: number[]) =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
const deviation = (values: number[]) => {
  const m = mean(values);
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)));
};
const f1 = (n: number) => (Math.round(n * 10) / 10).toString();
const abilityIds = (card: Card) => (card.abilities ?? []).map((a) => a.id);
const label = (card: Card) => `${card.name}${card.legendary ? " ★" : ""}`;
const group = (card: Card) =>
  card.factions.length === 0 || card.factions[0] === "neutral"
    ? "neutral"
    : card.factions.length > 1
      ? "hybrid"
      : card.factions[0];

const lines: string[] = [];
const table = (head: string[], rows: (string | number)[][]) => {
  lines.push(`| ${head.join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`);
  for (const row of rows) lines.push(`| ${row.join(" | ")} |`);
  lines.push("");
};
const section = (title: string, note?: string) => {
  lines.push(`## ${title}`, "");
  if (note) lines.push(note, "");
};

lines.push("# Card pool audit", "", `${cards.length} cards, read from assets/cards.`, "");

// 1. Composition
section(
  "Composition",
  "Mono-faction rows should match the set targets; hybrids are counted apart.",
);
{
  const groups = [...factionIds, "neutral", "hybrid"];
  const rows = groups.map((g) => {
    const mine = cards.filter((card) => group(card) === g);
    const count = (pick: (card: Card) => boolean) => mine.filter(pick).length;
    return [
      g,
      mine.length,
      count((c) => c.rarity === "legendary"),
      count((c) => c.rarity === "rare"),
      count((c) => c.rarity === "common"),
      count((c) => c.type === "creature"),
      count((c) => c.type === "spell"),
      count((c) => c.type === "holding"),
      f1(mean(mine.map(totalCost))),
    ];
  });
  table(
    [
      "group",
      "cards",
      "legendary",
      "rare",
      "common",
      "creatures",
      "spells",
      "holdings",
      "avg cost",
    ],
    rows,
  );
}

// 2. Producers
section(
  "Energy producers",
  "A free producer is a 0-cost creature with an energy output, or a 0-cost holding with Channel or Primal. Output is the best single option.",
);
{
  const free = (card: Card) =>
    totalCost(card) === 0 &&
    (output(card) > 0 ||
      (card.type === "holding" &&
        abilityIds(card).some((id) => id === "channel" || id === "primal")));
  const rows = [...factionIds, "neutral", "hybrid"].map((g) => {
    const mine = cards.filter((card) => group(card) === g);
    const producers = mine.filter((card) => card.type === "creature" && output(card) > 0);
    return [
      g,
      mine.filter(free).length,
      mine.filter(free).map(label).join(", ") || "none",
      producers.length,
      f1(mean(producers.map(output))),
    ];
  });
  table(["group", "free", "which", "creature producers", "avg output"], rows);
}

// 3. Creature curve and outliers
const creatures = cards.filter((card) => card.type === "creature");
const buckets = new Map<number, Card[]>();
for (const card of creatures)
  buckets.set(totalCost(card), [...(buckets.get(totalCost(card)) ?? []), card]);
const sum = (card: Card) => power(card) + output(card);

section(
  "Creature curve",
  "Power is Attack + Defense; output is the best energy option. Abilities are not priced, so read the numbers with the ability column.",
);
table(
  ["cost", "creatures", "avg Attack", "avg Defense", "avg output", "avg A+D+output"],
  [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([cost, list]) => [
      cost,
      list.length,
      f1(mean(list.map((c) => c.stats!.attack))),
      f1(mean(list.map((c) => c.stats!.defense))),
      f1(mean(list.map(output))),
      f1(mean(list.map(sum))),
    ]),
);

section(
  "Outliers within a cost",
  "Creatures whose A+D+output is far from the average at their cost (more than 1.5 standard deviations, at least 1.5 points). Weaker outliers are not a defect; the list shows where to look.",
);
{
  const rows: (string | number)[][] = [];
  for (const [cost, list] of [...buckets.entries()].sort(([a], [b]) => a - b)) {
    if (list.length < 4) continue;
    const m = mean(list.map(sum)),
      sd = Math.max(deviation(list.map(sum)), 1);
    for (const card of list) {
      const delta = sum(card) - m;
      if (Math.abs(delta) >= Math.max(1.5 * sd, 1.5))
        rows.push([
          cost,
          label(card),
          group(card),
          `${card.stats!.attack}/${card.stats!.defense}, out ${output(card)}`,
          abilityIds(card).join(", ") || "-",
          `${delta > 0 ? "+" : ""}${f1(delta)}`,
        ]);
    }
  }
  table(["cost", "card", "faction", "stats", "abilities", "vs average"], rows);
}

// 4. Spells
section(
  "Spells by cost",
  "Raw effect amounts, not weighted. Damage per energy is shown for pure damage spells.",
);
{
  const describe = (b: Binding) => {
    const amounts = Object.entries(b.params ?? {})
      .filter(([, v]) => typeof v === "number")
      .map(([k, v]) => `${k} ${v}`)
      .join(" ");
    return amounts ? `${b.id} ${amounts}` : b.id;
  };
  const spells = cards
    .filter((card) => card.type === "spell")
    .sort((a, b) => totalCost(a) - totalCost(b) || a.name.localeCompare(b.name));
  table(
    ["cost", "spell", "faction", "effects", "damage / energy"],
    spells.map((card) => {
      const damage = (card.cast ?? [])
        .filter((b) => b.id === "damage" || b.id === "barrage")
        .reduce((total, b) => total + (Number(b.params?.amount) || 0), 0);
      return [
        totalCost(card),
        label(card),
        group(card),
        `${card.modal ? "choose one: " : ""}${(card.cast ?? []).map(describe).join("; ")}`,
        damage && totalCost(card) ? f1(damage / totalCost(card)) : "-",
      ];
    }),
  );
}

// 5. Roles per faction
section(
  "Roles per faction",
  "How many cards in each group can remove, draw, ramp or protect. Counted from ability and spell effect ids.",
);
{
  const roles: Record<string, string[]> = {
    removal: ["damage", "destroy", "plague", "barrage", "scorch", "charge", "bounce", "weaken"],
    "card flow": [
      "draw",
      "searchForCreatureOrHolding",
      "muster",
      "hive",
      "ransack",
      "reprise",
      "raise",
    ],
    ramp: ["channel", "primal", "trade", "dark-harvest", "sacrifice"],
    defence: ["guard", "armor", "shield-wall", "banner", "rest", "heal", "steadfast"],
  };
  const has = (card: Card, ids: string[]) =>
    [...(card.abilities ?? []), ...(card.cast ?? [])].some((b) => ids.includes(b.id));
  const rows = [...factionIds, "neutral", "hybrid"].map((g) => {
    const mine = cards.filter((card) => group(card) === g);
    return [g, ...Object.values(roles).map((ids) => mine.filter((card) => has(card, ids)).length)];
  });
  table(["group", ...Object.keys(roles)], rows);
  lines.push(
    "Abilities counted per role:",
    "",
    ...Object.entries(roles).map(([role, ids]) => `- ${role}: ${ids.join(", ")}`),
    "",
  );
}

// 6. Dominance
section(
  "Strictly better cards",
  "Pairs of the same rarity where one card costs no more, is at least as strong in every printed number, has every ability the other has, and can be played in every deck the other can. Ability amounts are not compared. A rare or legendary over a common is usually intended and left out.",
);
{
  const pairs: (string | number)[][] = [];
  const playsWhereverOther = (a: Card, b: Card) =>
    group(a) === "neutral" || a.factions.every((f) => b.factions.includes(f));
  const better = (a: Card, b: Card) => {
    if (a.id === b.id || a.type !== b.type || a.rarity !== b.rarity) return false;
    if (!playsWhereverOther(a, b)) return false;
    if (totalCost(a) > totalCost(b)) return false;
    if (!abilityIds(b).every((id) => abilityIds(a).includes(id))) return false;
    if (a.type === "spell") return false;
    const sa = [totalCost(a), a.stats!.attack, a.stats!.defense, output(a), abilityIds(a).length];
    const sb = [totalCost(b), b.stats!.attack, b.stats!.defense, output(b), abilityIds(b).length];
    const atLeast =
      sa[0] <= sb[0] && sa[1] >= sb[1] && sa[2] >= sb[2] && sa[3] >= sb[3] && sa[4] >= sb[4];
    return atLeast && sa.some((v, i) => v !== sb[i]);
  };
  for (const a of cards)
    for (const b of cards)
      if (better(a, b)) pairs.push([label(a), a.rarity, label(b), b.rarity, group(b)]);
  if (pairs.length) table(["better", "rarity", "than", "rarity", "faction"], pairs);
  else lines.push("None found.", "");
}

// 7. Legendaries
section("Legendaries", "Sorted by cost.");
table(
  ["card", "faction", "type", "cost", "stats", "abilities / effects"],
  cards
    .filter((card) => card.legendary || card.rarity === "legendary")
    .sort((a, b) => totalCost(a) - totalCost(b) || a.name.localeCompare(b.name))
    .map((card) => [
      card.name,
      group(card),
      card.type,
      totalCost(card),
      card.stats ? `${card.stats.attack}/${card.stats.defense}, out ${output(card)}` : "-",
      [...abilityIds(card), ...(card.cast ?? []).map((b) => b.id)].join(", ") || "-",
    ]),
);

const report = lines.join("\n");
if (out) {
  await writeFile(out, report);
  console.log(`Wrote ${out}`);
} else console.log(report);
