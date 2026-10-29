import type { Command, Registry } from "@realms/contracts";
import { fixture, type BenchmarkCase, type FixtureOptions, type Piece } from "./fixture";

const end: Command = { type: "end" };
const confirm: Command = { type: "confirm-combat" };
const field = (
  alias: string,
  card: string,
  slot: number,
  extra: Pick<Piece, "owner" | "exhausted" | "damage"> = {},
) => ({
  alias,
  card,
  slot,
  zone: "board" as const,
  ...extra,
});
const hand = (alias: string, card: string) => ({ alias, card, zone: "hand" as const });
const enemy = (
  alias: string,
  card: string,
  slot: number,
  extra: Pick<Piece, "owner" | "exhausted" | "damage"> = {},
) => field(alias, card, slot, { owner: "p2" as const, ...extra });
type Fixture = ReturnType<typeof fixture>;

/** Stable IDs let comparison reports track each tactical exercise across revisions. */
export function benchmarkCases(registry: Registry): BenchmarkCase[] {
  const cases: BenchmarkCase[] = [];
  function win(
    title: string,
    category: string,
    options: FixtureOptions,
    plan: (f: Fixture) => Command[],
    rationale: string,
  ) {
    const f = fixture(options, registry);
    cases.push({
      id: `rov-${String(cases.length + 1).padStart(3, "0")}`,
      title,
      category,
      task: "Find a legal sequence that wins before giving the opponent a full turn.",
      state: f.state,
      actor: "p1",
      reference: plan(f),
      objective: "You win the game during this decision sequence.",
      rationale,
      passes: (state) => state.outcome === "p1",
    });
  }
  win(
    "Direct spell lethal",
    "removal-and-lethal",
    {
      pieces: [hand("burn", "cleansing-light")],
      energy: { crownlands: 2 },
      life: { p2: 2 },
    },
    (f) => [f.play("burn", { target: "p2" })],
    "Damage can target the enemy player; spending it on a creature is unnecessary.",
  );
  win(
    "Channel two separate producers",
    "energy",
    {
      pieces: [
        field("a", "crownlands-recruit", 1),
        field("b", "goldfield-farmer", 3),
        hand("burn", "cleansing-light"),
      ],
      life: { p2: 2 },
    },
    (f) => [f.energy("a"), f.energy("b"), f.play("burn", { target: "p2" })],
    "Both ready producers can channel in the same play phase.",
  );
  win(
    "Choose Primal's required colour",
    "energy",
    {
      pieces: [field("unicorn", "ancient-unicorn", 2), hand("burn", "cleansing-light")],
      energy: { neutral: 1 },
      life: { p2: 2 },
    },
    (f) => [f.activate("unicorn", 0, { target: "crownlands" }), f.play("burn", { target: "p2" })],
    "Primal is an activated ability; generic energy alone cannot satisfy the coloured requirement.",
  );
  win(
    "Preserve a second spell's colour",
    "energy",
    {
      pieces: [hand("burn", "cleansing-light"), hand("puncture", "puncture")],
      energy: { crownlands: 1, "bright-marches": 1, neutral: 1 },
      life: { p2: 4 },
    },
    (f) => [
      f.play("burn", { target: "p2", payment: { crownlands: 1, neutral: 1 } }),
      f.play("puncture", { target: "p2" }),
    ],
    "Spend generic energy on the generic part and retain Marches energy for Puncture; reversing the spell order also works.",
  );
  for (const [spell, energy, life, title] of [
    ["moment-of-glory", "bright-marches", 3, "Temporary Marches buff creates lethal"],
    ["enrage", "horde", 4, "Temporary Horde buff creates lethal"],
    ["form-of-the-bear", "conclave", 5, "Conclave transformation creates lethal"],
  ] as const)
    win(
      title,
      "buff-sequencing",
      {
        pieces: [field("attacker", "crownlands-recruit", 2), hand("buff", spell)],
        energy: { [energy]: spell === "form-of-the-bear" ? 2 : 1 },
        life: { p2: life },
      },
      (f) => [f.play("buff", { target: f.ids.attacker }), end, f.attack(["attacker", 2]), confirm],
      "Cast a play-only temporary buff before entering combat, then use the buff before it expires.",
    );
  win(
    "An exhausted new Banner still supports its neighbour",
    "positioning",
    {
      pieces: [field("attacker", "crownlands-recruit", 2), hand("banner", "ban-vale-cavalry")],
      energy: { crownlands: 3 },
      life: { p2: 3 },
    },
    (f) => [f.play("banner", { slot: 1 }), end, f.attack(["attacker", 2]), confirm],
    "Deploy Cavalry adjacent to the ready attacker. Static Banner works immediately even though Cavalry enters exhausted.",
  );
  win(
    "Fealty reaches across the battlefield",
    "positioning",
    {
      pieces: [
        field("attacker", "crownlands-recruit", 4),
        hand("leader", "alderic-warmaster-of-the-empire"),
      ],
      energy: { crownlands: 4 },
      life: { p2: 2 },
    },
    (f) => [f.play("leader", { slot: 0 }), end, f.attack(["attacker", 4]), confirm],
    "Fealty is global and passive, so the leader need not be adjacent or ready.",
  );
  win(
    "Accord refunds only the first spell",
    "trigger-sequencing",
    {
      pieces: [
        field("accord", "academy-apprentice", 0, { exhausted: true }),
        field("producer", "dockhand-construct", 4),
        hand("a", "arcane-missile"),
        hand("b", "arcane-missile"),
      ],
      energy: { "northern-league": 1, neutral: 1 },
      life: { p2: 4 },
    },
    (f) => [f.play("a", { target: "p2" }), f.energy("producer"), f.play("b", { target: "p2" })],
    "The first spell refunds one League energy; the exhausted Apprentice's passive still works. The second cast gets no second refund.",
  );
  win(
    "Trade adds generic energy when channelling",
    "trigger-sequencing",
    {
      pieces: [field("captain", "stormborn-captain", 2), hand("missile", "arcane-missile")],
      life: { p2: 2 },
    },
    (f) => [f.energy("captain"), f.play("missile", { target: "p2" })],
    "Stormborn Captain channels its printed output plus Trade's neutral energy, paying the entire missile cost.",
  );
  win(
    "Refresh restores an exhausted attacker",
    "trigger-sequencing",
    {
      pieces: [
        field("attacker", "crownlands-recruit", 2, { exhausted: true }),
        hand("captain", "stormborn-captain"),
      ],
      energy: { "northern-league": 2 },
      life: { p2: 1 },
    },
    (f) => [
      f.play("captain", { slot: 0, target: f.ids.attacker }),
      end,
      f.attack(["attacker", 2]),
      confirm,
    ],
    "Captain's entry effect readies the old creature; the Captain itself still enters exhausted.",
  );
  win(
    "Prowess turns a draw spell into lethal",
    "trigger-sequencing",
    {
      pieces: [field("mage", "quickcast-mage", 2), hand("peek", "peek")],
      energy: { "northern-league": 1 },
      life: { p2: 3 },
    },
    (f) => [f.play("peek"), end, f.attack(["mage", 2]), confirm],
    "The spell triggers Prowess before combat and supplies the otherwise missing attack point.",
  );
  win(
    "Quickened permits attacking on entry",
    "readiness",
    {
      pieces: [hand("mage", "quickcast-mage")],
      energy: { "northern-league": 2 },
      life: { p2: 2 },
    },
    (f) => [f.play("mage", { slot: 2 }), end, f.attack(["mage", 2]), confirm],
    "Quickened is the exception to ordinary exhausted entry.",
  );
  win(
    "Charge removes the centre blocker before combat",
    "positioning",
    {
      pieces: [
        field("attacker", "crownlands-recruit", 1),
        hand("bear", "ursa-elder-bear"),
        enemy("guard", "elvish-honourguard", 2),
      ],
      energy: { conclave: 5 },
      life: { p2: 1 },
    },
    (f) => [f.play("bear", { slot: 2 }), end, f.attack(["attacker", 2]), confirm],
    "Ursa's Charge damages the opposing creature in its own lane. Clearing the Guard unlocks a winning attack; its response window is passed in this exercise.",
  );
  win(
    "Scorch can target the enemy player",
    "entry-effects",
    {
      pieces: [hand("mage", "emberfield-battlemage")],
      energy: { "ember-fields": 3 },
      life: { p2: 2 },
    },
    (f) => [f.play("mage", { slot: 2, target: "p2" })],
    "The entry ability can finish the player without waiting for the exhausted creature to attack.",
  );
  win(
    "One Guard cannot intercept twice",
    "lanes-and-guards",
    {
      phase: "attack",
      pieces: [
        field("a", "cleaverfield-brigade", 1),
        field("b", "vanguard-pikemen", 3),
        enemy("guard", "borderpost", 2),
      ],
      life: { p2: 2 },
    },
    (f) => [f.attack(["a", 1], ["b", 3]), confirm],
    "A single attack is intercepted; declaring both together sends the second attacker through.",
  );
  win(
    "Reserve Guard for an attack on its own lane",
    "lanes-and-guards",
    {
      phase: "attack",
      pieces: [
        field("a", "cleaverfield-brigade", 1),
        field("b", "crownlands-recruit", 2),
        enemy("guard", "borderpost", 2),
      ],
      life: { p2: 3 },
    },
    (f) => [f.attack(["a", 1], ["b", 2]), confirm],
    "The Guard must cover its own targeted lane first, allowing the other attacker to hit the player.",
  );
  win(
    "An exhausted defender still blocks",
    "lanes-and-guards",
    {
      phase: "attack",
      pieces: [
        field("attacker", "crownlands-recruit", 2),
        enemy("blocker", "dockhand-construct", 2, { exhausted: true }),
      ],
      life: { p2: 1 },
    },
    (f) => [f.attack(["attacker", 1]), confirm],
    "Readiness does not stop automatic blocking. Select an empty reachable lane instead.",
  );
  win(
    "A Holding still blocks its occupied lane",
    "lanes-and-guards",
    {
      phase: "attack",
      pieces: [field("attacker", "crownlands-recruit", 2), enemy("holding", "store-house", 2)],
      life: { p2: 1 },
    },
    (f) => [f.attack(["attacker", 3]), confirm],
    "Holdings defend even though they cannot attack or channel. This one has no Guard, so an adjacent empty lane remains open.",
  );
  {
    const f = fixture(
      {
        phase: "attack",
        pieces: [
          field("attacker", "cleaverfield-brigade", 0),
          enemy("a", "dockhand-construct", 0),
          enemy("b", "dockhand-construct", 1),
        ],
      },
      registry,
    );
    cases.push({
      id: "rov-021",
      title: "Flank reach does not wrap",
      category: "lanes-and-guards",
      task: "Destroy a reachable enemy blocker in combat and keep your attacker alive.",
      state: f.state,
      actor: "p1",
      reference: [f.attack(["attacker", 0]), confirm],
      objective: "At least one enemy blocker dies and your attacker stays on the battlefield.",
      rationale:
        "Left Flank can target only lanes 0 and 1. Either reachable blocker is a valid solution; lane 4 is illegal.",
      passes: (s) =>
        s.cards[f.ids.attacker].zone === "board" &&
        [f.ids.a, f.ids.b].some((id) => s.cards[id].zone === "discard"),
    });
  }
  win(
    "Outflank contributes to effective attack",
    "positioning",
    {
      phase: "attack",
      pieces: [field("attacker", "alpaca-mountaineers", 0)],
      life: { p2: 5 },
    },
    (f) => [f.attack(["attacker", 0]), confirm],
    "Outflank adds two attack at the flank; use effective stats, not just the printed value.",
  );
  win(
    "Covert ignores the Guard",
    "lanes-and-guards",
    {
      phase: "attack",
      pieces: [field("attacker", "elven-scouts", 2), enemy("guard", "borderpost", 2)],
      life: { p2: 2 },
    },
    (f) => [f.attack(["attacker", 2]), confirm],
    "Covert attacks cannot be blocked, including by a Guard in the targeted lane.",
  );
  win(
    "Remove the Guard rather than the largest creature",
    "removal-and-lethal",
    {
      pieces: [
        field("attacker", "crownlands-recruit", 2),
        hand("death", "death"),

        enemy("guard", "bronwin-tree-guard", 2),
        enemy("threat", "ursa-elder-bear", 4),
      ],
      energy: { "black-host": 1, neutral: 1 },
      life: { p2: 1 },
    },
    (f) => [f.play("death", { target: f.ids.guard }), end, f.attack(["attacker", 2]), confirm],
    "Destroying the central Guard opens a winning lane. Killing the larger creature on the far flank leaves the Guard blocking every reachable lane.",
  );
  win(
    "Spend response energy on a response-only spell",
    "response-windows",
    {
      response: true,
      pieces: [hand("revenge", "revenge")],
      responseEnergy: { neutral: 2 },
      life: { p2: 3 },
    },
    (f) => [f.play("revenge", { target: "p2" })],
    "Revenge is legal in the response window and its generic cost can be paid from response energy.",
  );
  {
    const f = fixture(
      {
        response: true,
        pieces: [hand("revenge", "revenge")],
        energy: { neutral: 2 },
        responseEnergy: {},
        life: { p2: 3 },
      },
      registry,
    );
    cases.push({
      id: "rov-026",
      title: "Normal energy is not response energy",
      category: "response-windows",
      task: "Close this response window without losing the game or spending a card illegally.",
      state: f.state,
      actor: "p1",
      reference: [end],
      objective: "The response window is closed and Revenge remains in hand.",
      rationale:
        "The two pools are separate. With zero response energy, pass; the normal pool does not pay for Revenge here.",
      passes: (s) =>
        !s.outcome && s.responseStep !== "p1" && s.cards[f.ids.revenge].zone === "hand",
    });
  }
  win(
    "A response-only spell cannot be cast during play",
    "response-windows",
    {
      pieces: [field("attacker", "crownlands-recruit", 2), hand("revenge", "revenge")],
      energy: { neutral: 2 },
      life: { p2: 1 },
    },
    (f) => [end, f.attack(["attacker", 2]), confirm],
    "The winning legal route is the ready creature's attack; Revenge cannot be cast in this phase.",
  );
  win(
    "Drawing your final card loses before later spell effects",
    "library-and-sequencing",
    {
      pieces: [hand("missile", "arcane-missile"), hand("burn", "cleansing-light")],
      energy: { "northern-league": 1, crownlands: 1, neutral: 1 },
      librarySize: 1,
      life: { p2: 2 },
    },
    (f) => [f.play("burn", { target: "p2" })],
    "Arcane Missile draws before dealing damage; taking the last library card immediately loses. Cleansing Light wins without drawing.",
  );
  {
    const f = fixture(
      {
        phase: "draw",
        pieces: [
          { alias: "producer", card: "goldfield-farmer", zone: "choice" },
          { alias: "bear", card: "ursa-elder-bear", zone: "choice" },
        ],
        drawChoices: ["producer", "bear"],
      },
      registry,
    );
    cases.push({
      id: "rov-029",
      title: "Keep a playable producer from the draw choice",
      category: "pending-choices",
      task: "Resolve the draw choice and establish an energy-producing creature on your empty battlefield this turn.",
      state: f.state,
      actor: "p1",
      reference: [
        { type: "choose", choiceId: "benchmark-draw", option: f.ids.producer, other: "bottom" },
        f.play("producer", { slot: 2 }),
      ],
      objective:
        "Goldfield Farmer is on the battlefield; either destination for the unchosen card is accepted.",
      rationale:
        "With no energy and no board, the free producer is playable. Keeping the expensive bear cannot establish a producer this turn.",
      passes: (s) => !s.outcome && s.cards[f.ids.producer].zone === "board",
    });
  }
  {
    const f = fixture(
      { pieces: [field("bosci", "bosci-lord-of-seacliffe", 2), hand("bear", "ursa-elder-bear")] },
      registry,
    );
    cases.push({
      id: "rov-030",
      title: "Rally deploys without an energy payment",
      category: "activated-abilities",
      task: "Deploy the creature in your hand this turn, keeping Bosci on the battlefield.",
      state: f.state,
      actor: "p1",
      reference: [f.activate("bosci", 0, { target: f.ids.bear, slot: 1 })],
      objective: "Both Bosci and Ursa are on your battlefield.",
      rationale:
        "Rally pays through exhausting Bosci, not through Ursa's printed energy cost. An open slot is still required.",
      passes: (s) =>
        !s.outcome && s.cards[f.ids.bear].zone === "board" && s.cards[f.ids.bosci].zone === "board",
    });
  }
  {
    const f = fixture(
      {
        phase: "attack",
        pieces: [field("a", "cleaverfield-brigade", 2), enemy("b", "cleaverfield-brigade", 2)],
      },
      registry,
    );
    cases.push({
      id: "rov-031",
      title: "Blocked combat deals simultaneous damage",
      category: "combat-trades",
      task: "Trade your Brigade for the opposing Brigade in combat.",
      state: f.state,
      actor: "p1",
      reference: [f.attack(["a", 2]), confirm],
      objective: "Both Brigades are in their owners' discard piles.",
      rationale:
        "The defender deals its attack back even though the attack kills it. Neither side gets first strike.",
      passes: (s) => s.cards[f.ids.a].zone === "discard" && s.cards[f.ids.b].zone === "discard",
    });
  }
  return cases;
}
