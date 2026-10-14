# Fantasy Card Game — Rules & Technical Architecture

**Status:** Implementation blueprint / design draft 0.2 (prototype defaults accepted)  
**Updated:** 2026-10-11  
**Primary implementation:** TypeScript, browser client, authoritative server when multiplayer is introduced  
**Source of rules:** User's October 2026 ruleset, adapted through the design discussion.

> **How to read this document**
>
> - **[LOCKED]** means established in the original rules or explicitly agreed in discussion.
> - **[PROPOSED]** means an implementation default **accepted for prototype testing**, but not yet a permanently finalized game rule.
> - **[OPEN]** marks decisions that remain worth playtesting or formally finalizing; use the documented prototype default unless tests suggest changing it.
> - **[DERIVED]** is a clear consequence of locked rules, rather than a newly invented mechanic.
>
> The target is a **specific card game with an extension-based runtime**, not a general-purpose collectible-card-game framework. Extend the runtime by writing an operation, hook or ability **once**; create individual cards and most future keywords as **data**.

---

## 1. Product vision and non-goals

### 1.1 Game identity

A two-player fantasy card game built around a scarce shared resource: **five creature slots per player**. Creatures are both combatants **and** energy infrastructure. Small zero-cost creatures establish an economy; they typically enter exhausted, so ramp takes time. More expensive creatures are stronger but consume the same limited slots. Players must actively decide whether to attack or generate energy and how to free space for better units.

The collectible world is organized into **eight broad fantasy factions**, with dual-faction and neutral cards. The factions are cultural, political and supernatural groupings, not just eight elements or eight races. Cards from any factions may be mixed in a deck; colored energy supplies the constraint.

### 1.2 Non-goals for initial implementation

- No Magic-style stack, interrupts, complicated priority passes or instant-speed responses.
- No separate land/resource deck or automatic base energy; **zero-cost creatures establish the economy**.
- No mandatory faction cap when building a deck.
- No arbitrary user-supplied JavaScript executed as card content.
- No configurable game board, player count or alternative turn structure in v1.
- No full 3D board or requirement to use React Three Fiber.
- No polished online multiplayer, card collection backend, matchmaking or monetization in the first playable milestone.

### 1.3 The key content contract

A new card can select existing registered extensions by stable ID, supply validated parameters, media paths, localization keys and metadata. **The card never imports a function or carries executable source code.** When a genuinely new primitive is needed, add it once as a typed, tested extension; old cards do not change.

---

## 2. Rules of play

This section is normative except where labeled **[PROPOSED]** or **[OPEN]**. It keeps the original rule's two card types and its term **monster**; code may use `creature` internally consistently, but UI naming should be selected once.

### 2.1 Winning and life **[LOCKED]**

- Exactly two players begin with **10 life** each.
- A player loses when their life reaches 0; if both reach 0 due to the same fully resolved effect/game event, the game is a draw.
- Life-based victory/defeat is checked after the current effect or game event fully resolves. Empty-library defeat ends resolution immediately (prototype amendment below).
- The remaining player wins.

### 2.2 Deck construction **[LOCKED]**

- Minimum **30 cards** per deck; no upper limit is specified in the original rules (**[OPEN]** whether to establish one for competitive play).
- Maximum **three copies** of a card by **name and variant**; only one copy of each **Legendary** card.
- Shuffle before the game. Each player draws **five** initial cards.
- Approx. **10–12 zero-cost cards** is an initial deckbuilding guideline, **not** a legality rule.
- **[LOCKED]** Any combination of faction affiliations is allowed in a deck.
- **[PROPOSED]** Define a stable `deckLimitKey` to enforce the original *name + variant* restriction independently of localization or display-name changes.

### 2.3 Cards and zones **[LOCKED]**

- **Monster** cards persist on the battlefield, with Attack, Defense, Energy and optional abilities.
- **Spell** cards resolve their effects and normally go to their owner's discard pile.
- Each player has a deck, hand, discard pile and **five battlefield slots** (modified from three).
- Destroyed monsters move to their owner's discard pile, freeing the slot immediately.
- **Prototype amendment (2026-10-11):** An empty library immediately loses the game. Drawing the last card ends the match, including spell and death-trigger draws. The first library to empty loses; discards do not recycle.
- Damage marked on monsters is temporary and cleared at turn end.

### 2.4 Turn sequence **[LOCKED]**

1. **Draw Phase:** draw two cards; choose one to keep and discard the other. The first player skips their **first** Draw Phase.
2. **Play Phase:** the active player may play any number of affordable cards, exhaust monsters to generate energy, and use abilities permitted during the phase.
3. **Attack Phase:** any eligible unexhausted monster may attack once. Defender chooses blockers subject to the rules below.
4. **End Phase:** ready monsters, remove damage, empty energy pools, expire end-of-turn effects, then pass the turn.

**[PROPOSED sequencing]** Explicitly resolve start/end phase hooks before moving to the next phase, and make phase changes player orders where appropriate. Whether a player may voluntarily skip a phase is implied by normal progression but should be codified.

### 2.5 Battlefield and entry exhaustion **[LOCKED; resolves original contradiction]**

- A player has at most **five** occupied monster slots.
- A monster normally needs a free slot to be played.
- **All monsters enter exhausted by default.** This supersedes the older language in the source permitting immediate attack/energy production after entry.
- An ability such as **Ready** may specifically cause a monster to enter unexhausted.
- An exhausted monster may not attack or generate energy again until readied; it **may block** unless prohibited by an effect.
- An unexhausted monster may attack **or** exhaust to generate energy; not both in the same readiness cycle.
- All surviving monsters become unexhausted during their controller's End Phase **as written in the original rule**. **[OPEN, HIGH IMPACT]** This differs from beginning-of-turn readying: it allows a player to end their turn with fresh blockers. Do not silently change it.
- Empty slots are strategically valuable. **No general-purpose, free sacrifice action** is granted by default; sacrifice, return, Consume and similar space-making tools are card abilities or explicit extensions.
- **[PROPOSED]** The **`consume`** ability sacrifices one eligible friendly creature **as part of the cost of playing the incoming monster**, freeing its slot before the normal free-slot check. The incoming monster occupies that newly freed slot and enters exhausted unless another ability says otherwise. This is an **opt-in card ability**, not a universal replacement action.

### 2.6 Energy types and payment **[LOCKED concept; PROPOSED exact semantics]**

- Energy is generated by exhausting an unexhausted monster during the Play Phase or by explicit card effects. It is held in a temporary pool, not attached to the monster after generation.
- There are **eight faction energy types**, plus **generic requirements** on card costs.
- **[PROPOSED]** Generic is a cost requirement, **not a ninth colored energy type**: any faction energy can pay a generic requirement. Neutral monsters may produce `neutral` energy usable for generic requirements only. If generic itself becomes storable, change the type model explicitly.
- Costs can combine faction-specific and generic amounts; a specific requirement must be met with matching energy.
- A dual-faction card may demand both types; a dual-faction energy producer may choose one type when exhausted. It does **not** automatically generate both.
- A newly played monster cannot pay its own cost because it is not in play until the payment and summon are completed.
- Overproduction remains available during the **Play Phase**, then expires at phase end. Temporary pools from other windows follow their own expiration rules.
- **[OPEN]** How to select which stored colors pay generic costs. **[PROPOSED]** Let the player specify allocation; optionally propose an autofill that never spends colored energy needed for a simultaneously specified colored cost.
- **[OPEN]** Whether a creature may generate multiple colors in fixed combination, versus a choice of exactly one output. Start with explicit `options` of output bundles so both are representable without changing the core engine.

### 2.7 Combat and blocking **[LOCKED]**

- Each unexhausted monster may declare one attack during the Attack Phase, then becomes exhausted.
- **[AMENDED 2026-10-12, rules `varhir-rules-0.9`] Lanes.** Each attacker declares a target lane: its own position or an adjacent one (no wraparound), at most one attacker per lane. The enemy card in that lane blocks automatically if it can (any creature or holding, exhausted or not, unless an effect such as Flank Evasion forbids it); an empty lane or a non-blocking card means the attack hits the player. Defenders make no blocking choice; the `block` command and the block stage no longer exist. The paragraphs below describe the earlier manual-blocking model and apply only where they do not conflict.
- **[AMENDED 2026-10-12, rules `varhir-rules-0.10`] Opening mulligan.** Each player, player one first, may return up to two cards from the opening five; replacements are drawn before the returned cards are shuffled in. It is a pending choice answered by the `mulligan` command and is opt-in at match creation.
- **[AMENDED 2026-10-12, rules `varhir-rules-0.12`] Draw destination.** After drawing two and keeping one, the player sends the other to the discard pile or under the library, i.e. the bottom, drawn last (`choose.other`). Cards under the library are hidden information; the event does not name them.
- The defending player may assign at most one blocker to each attacker and may use each defending monster to block at most one attacker. The latest 2026-10-11 user amendment removes multi-blocking and damage reordering while retaining retaliation. Exhausted defenders remain valid blockers unless an effect forbids it.
- An unblocked attack deals damage equal to the attacker's Attack to the **defending player**.
- A blocked attacker deals its full Attack to its single blocker. That blocker deals its own full Attack back simultaneously, even if killed in the exchange. Apply both hits before checking deaths or resolving queued triggers. Damage accumulates during the turn; marked damage reaching current Defense destroys a monster.
- Excess damage does **not** spill over to the player unless a card explicitly overrides that behavior.
- **[AMENDED 2026-10-11]** Blockers retaliate simultaneously. Armor applies separately to each incoming hit. Only destroyed defending monsters contribute defensive death energy; attacker deaths still trigger normal abilities.
- **[OPEN, HIGH IMPACT]** Are attackers declared together and blockers assigned together, or is combat handled one attacker at a time? Source references all declared attacks/blocks and a post-combat window. **[PROPOSED]** Declare attacks as a batch, then assign all blocks, then resolve combat in deterministic order and open one death window.
- **[OPEN]** Whether blockers may be assigned to creatures already exhausted by previous steps, whether attacks can target monsters directly, and whether special keywords override basic assignment. Defaults: attacks target opponent only; blocking is defender's optional choice.

### 2.8 Post-combat death-energy window **[LOCKED concept; OPEN color model]**

After all declared attacks and blocks have resolved, each defending monster destroyed in that Attack Phase contributes its **Energy value** to a **temporary defensive energy pool** belonging to the defending player.

- Only the defender may spend that pool.
- It may be spent only on spells allowed in this death window.
- Those spells resolve completely, sequentially, without a stack.
- All unspent death-window energy expires when the window closes.
- **[PROPOSED]** Award the dead monsters' faction-specific printed/last-known **energy production** (selected based on its death snapshot for optional colors). **[OPEN, HIGH IMPACT]** An energy output with multiple choices needs an exact rule: owner chooses a legal output for each destroyed monster, or a separate printed `deathEnergy` attribute. The source rules predate colored energy and do not settle this.
- **[OPEN]** Whether creatures destroyed by death-window spells can add more energy to the same window. Original rule specifies destroyed *defending monsters during that Attack Phase*; **[PROPOSED]** no, because spell deaths occur after combat resolution.

### 2.9 Spell timing and resolution **[LOCKED]**

- Spells can be played by the active player during Play Phase, and by the defender during the post-combat death window when that spell's timing permits.
- A spell's complete effect finishes before another voluntary action or spell can start.
- **[CONFIRMED 2026-10-11] No combat tricks for now.** No voluntary spell casting between attacker declaration and combat damage, and no second Play Phase after combat.
- **No stack.** Triggered effects resolve as part of the current deterministic resolution process.
- **[OPEN]** Exact precedence when a spell's operation creates simultaneous triggers; propose active-player-first ordering with deterministic tie-breaks only after playtesting.

### 2.10 Ability vocabulary **[LOCKED categories; PROPOSED keywords]**

Original rule categories: **static**, **triggered** and immediate **spell** effects. Common triggers: played, attacks, blocks, destroyed, another monster destroyed, turn start and turn end. Triggered effects resolve immediately and fully. Static effects apply while their source remains active; leaving play removes them.

Candidate reusable keywords/extensions, **not yet rules**:

- `ready`: enters unexhausted, bypassing the default entry exhaustion.
- `consume`: sacrifices an eligible friendly creature as an additional play cost, freeing its battlefield slot before the incoming monster enters. This is a card ability, not a universal action.
- `sacrifice`: destroys a friendly creature as a cost or effect.
- `return`: moves an in-play creature to hand.
- `grow`: accumulates counters and gains or unlocks stats/effects.
- `formation`: conditions based on adjacent slots, creature types or neighboring allies.
- `channel`: optional additional energy expenditure improves an effect.
- `deathbound`: reusable death-trigger package.

**Do not implement all keywords before the vertical slice.** Register mechanics when a test card needs them.

---

## 3. World, factions and card taxonomy

All names below are **working lore/content**, not fundamental engine enums. Content authors may rename them by updating definitions and localization while preserving stable IDs.

| Stable ID | Working name | Setting | Mechanical direction |
| --- | --- | --- | --- |
| `crownlands` | The Crownlands | Kingdoms, cities, knights, diplomacy | Formation, defense, ally synergy |
| `elderwood` | The Elderwood | Elves, beasts, druids, ancient forests | Growth, ramp, evolution |
| `ironbound` | The Ironbound | Dwarven fortresses, engineers, craft | Armor, resilience, upgrading |
| `ashen` | The Ashen Covenant | Undead, revenants, necromancers | Sacrifice, graveyard, death triggers |
| `clans` | The Free Clans | Orcs, goblins, nomads, raiders | Aggression, turnover, attack rewards |
| `conclave` | The Veiled Conclave | Mages, artificers, constructs | Spells, conversion, control |
| `abyssal` | The Abyssal Host | Demons, eldritch corruption | Risk, self-damage, volatile power |
| `tidebound` | The Tidebound | Mariners, pirates, aquatic cultures | Tempo, return-to-hand, card selection |

- **[LOCKED]** Individual cards may have multiple affiliations; neutral cards have no faction affiliation.
- **[PROPOSED]** Neutral is `factions: []`, not a ninth energy color.
- Card affiliation, creature subtype (`Human`, `Knight`, `Undead`, `Construct`, etc.), energy production and colored cost are **different fields**.
- Affiliation does not imply a particular energy output or prohibit hybrid behavior.
- No need to support all 28 possible two-faction pairs at launch. Pairings can be added by expansion.
- **[PROPOSED]** Prototype content target: 12–20 carefully chosen cards; later initial pool possibly ~240, not a launch requirement.

---

## 4. Architecture at a glance

```text
  card definitions + keyword params + factions + assets (CONTENT)
                               │
                     schema validation
                               ▼
  ┌─────────────────────────────────────────────────────┐
  │              MATCH RULES RUNTIME                    │
  │                                                     │
  │  state ──► validate player order ──► transaction     │
  │    ▲                                  │              │
  │    │                             before hooks       │
  │    │                                  │              │
  │    │                            core operation      │
  │    │                                  │              │
  │    └── apply mutations ◄── after hooks / followups   │
  │                          │                          │
  │             event log + next state + pending choice │
  └──────────────────────────┬──────────────────────────┘
                             │
                    per-player projections
                             │
                  ┌──────────┴──────────┐
                  ▼                     ▼
             browser UI          authority/server
     card views + animations      lobby/transport
```

### 4.1 Ownership boundaries

| Package | Owns | Does not own |
| --- | --- | --- |
| `@game/core` | Deterministic state, actions/orders, phases, zones, payments, combat, hook execution, choice lifecycle | React, assets, sockets |
| `@game/extensions` | Typed reusable operations and ability implementations | Individual card identities |
| `@game/content` | Data-only cards, factions, keywords, presets, sets and manifests | Executable gameplay effects |
| `@game/contracts` | Public transport types, versioning, schema definitions | Runtime stateful match processing |
| `@game/renderer` | View models, animation event mapping, cards/board/UI | Rules decisions, secret information |
| `apps/web` | Menus, client match session, input, deck UI | Authoritative game execution online |
| `apps/server` | Match authority, authentication as needed, sockets, persistence | Card rendering |
| `apps/sandbox` | Local match simulator, debug panels, scenario/test content | Live matchmaking |

**[PROPOSED repository layout]**

```text
apps/
  web/
  server/
  sandbox/
packages/
  core/src/{state,entities,zones,orders,phases,combat,energy,hooks,choices,projection,prng}/
  extensions/src/{registry,abilities,operations,statuses,keywords}/
  content/{cards,factions,keywords,sets,media-manifest}/
  contracts/src/
  renderer/src/{components,animations,view-models}/
tests/{scenarios,fixtures,property,replays}/
docs/{architecture,rules,decisions}/
```

The folder structure is a starting point, not a mandatory abstraction per file.

---

## 5. Runtime model: ECS-inspired, not necessarily a full ECS

Cards are **entities** with unique instance IDs. Their reusable behaviors are **components/ability bindings**. Registered **systems/extensions** respond to hooks and emit **orders**. No archetype database or optimized dense ECS storage is required for ten battlefield monsters.

### 5.1 Distinguish definition, instance and runtime state

```ts
type PlayerId = string & { readonly __brand: 'PlayerId' };
type CardInstanceId = string & { readonly __brand: 'CardInstanceId' };
type CardDefinitionId = string & { readonly __brand: 'CardDefinitionId' };
type FactionId = string & { readonly __brand: 'FactionId' };

type Zone = 'deck' | 'hand' | 'battlefield' | 'discard';
type Phase = 'draw' | 'play' | 'attack' | 'end';

type CardInstance = {
  id: CardInstanceId;
  definitionId: CardDefinitionId;
  ownerId: PlayerId;
  controllerId: PlayerId;
  zone: Zone;
  slot?: 0 | 1 | 2 | 3 | 4;
  exhausted: boolean;
  damage: number;
  counters: Record<string, number>;
  attachedEffects: RuntimeEffectId[];
};
```

- Card **definitions** are immutable and validated at content load.
- Instances are created per match; two copies of the same definition never share state.
- `ownerId` does not necessarily change if control changes; `controllerId` may.
- Cards in deck/hand need identity but not battlefield state. Keep one canonical representation; do not allow duplicate copies of the same instance in multiple zones.
- **[PROPOSED]** Represent each zone as ordered card instance IDs and the battlefield as a length-five array of IDs/null; instance `zone`/`slot` must be updated atomically with those indexes. Alternatively derive location from zone structures; choose *one* canonical owner to avoid inconsistency.

### 5.2 Example top-level state

```ts
type GameState = {
  schemaVersion: number;
  matchId: string;
  contentVersion: string;
  revision: number;
  seed: string;
  randomCursor: number;
  activePlayer: PlayerId;
  phase: Phase;
  turn: number;
  winner: PlayerId | 'draw' | null;
  players: Record<PlayerId, PlayerState>;
  cards: Record<CardInstanceId, CardInstance>;
  activeCombat: CombatState | null;
  pendingChoice: PendingChoice | null;
  resolution: ResolutionState;
  nextSequence: number;
};

type PlayerState = {
  life: number;
  deck: CardInstanceId[];
  hand: CardInstanceId[];
  discard: CardInstanceId[];
  battlefield: [CardInstanceId | null, CardInstanceId | null,
                CardInstanceId | null, CardInstanceId | null,
                CardInstanceId | null];
  energyPool: EnergyPool;
  deathEnergyPool: EnergyPool;
};
```

Store only data in state—no closures, class instances, DOM references, timeouts or non-serializable Maps unless serialized deliberately. Match state must be replayable and suitable for server snapshots.

### 5.3 Transactions, orders and derived events

Distinguish four things:

1. **Player commands:** untrusted intent from a player/client: `playCard`, `tapForEnergy`, `declareAttackers`, `assignBlockers`, `selectDraw`, `chooseEffectTarget`, `endPhase`.
2. **Internal orders:** trusted operations requested by the core or extensions: `spendEnergy`, `moveCard`, `dealDamage`, `destroy`, `draw`, `applyModifier`, etc. These remain **subject to invariant validation**, even when trusted.
3. **Lifecycle hooks:** typed interception/notification points around the order or game lifecycle.
4. **Domain events:** immutable facts describing the committed result for logging, animation and replay diagnostics: `card.moved`, `damage.dealt`, `creature.destroyed`.

**Do not expose a generic `executeAnyOrder` socket endpoint.** Clients send narrow player commands; the server validates identity, turn, phase, options, ownership and affordability.

```ts
type PlayerCommand =
  | { type: 'playCard'; cardId: CardInstanceId; slot?: number;
      payment?: PaymentAllocation; targets?: TargetRef[] }
  | { type: 'exhaustForEnergy'; creatureId: CardInstanceId; option: number }
  | { type: 'declareAttackers'; attackerIds: CardInstanceId[] }
  | { type: 'assignBlockers'; assignments: BlockingAssignment[] }
  | { type: 'selectDraw'; keepId: CardInstanceId }
  | { type: 'resolveChoice'; choiceId: string; selection: unknown }
  | { type: 'endPhase' };

type DispatchResult = {
  state: GameState;
  events: GameEvent[];
  pendingChoice?: PendingChoice;
  error?: { code: string; message: string };
};
```

**Atomicity:** rejected commands must leave state, random cursor and event sequence unchanged. Apply commands to a transaction/draft, validate, then commit once. An order chain may suspend at a pending choice; only complete, committed transactions become visible externally.

---

## 6. Extension/plugin API

The `core` provides typed lifecycle points; the `extensions` registry binds reusable behavior. Keep the handler API small, deterministic and explicit.

### 6.1 Definition and registration

```ts
interface AbilityDefinition<Params> {
  id: string;
  version: number;
  paramsSchema: Schema<Params>; // implemented with Valibot
  hooks: Partial<{
    [K in HookName]: HookHandler<K, Params>;
  }>;
}

interface AbilityBinding<Params = unknown> {
  abilityId: string;
  params: Params;
  enabled?: boolean;
}

interface HookContext {
  readonly state: Readonly<GameState>;
  readonly sourceId: CardInstanceId;
  readonly controllerId: PlayerId;
  issue(order: InternalOrder): void;
  query(selector: Selector): readonly CardInstanceId[];
  calculate(expression: Expression): number;
}

const deathbound = defineAbility({
  id: 'deathbound',
  version: 1,
  paramsSchema: v.object({ amount: v.pipe(v.number(), v.integer(), v.minValue(1)) }),
  hooks: {
    'creature.destroyed': (ctx, event, params) => {
      if (event.creatureId !== ctx.sourceId) return;
      ctx.issue({ type: 'draw', playerId: event.lastControllerId,
                  amount: params.amount });
    }
  }
});
```

The above is an **API sketch**, not code to paste verbatim: `HookName`, `HookHandler`, `Schema`, `Selector`, `Expression`, `InternalOrder` and the generic inference implementation are to be supplied by the core. The event must carry last-known controller data because destroyed entities may have already left the battlefield.

### 6.2 Required hooks for the first implementation

| Hook | Timing | Can mutate requested order? | Typical use |
| --- | --- | --- | --- |
| `turn.started` / `turn.ended` | Lifecycle | No, issue orders | Start/end buffs |
| `phase.started` / `phase.ended` | Lifecycle | No, issue orders | Ready/cleanup, energy expiration |
| `card.play.before` | Before commit | Constrained rewrite/cancel | Cost changes, Consume |
| `card.played` | After commit | Issue orders | Battlecries |
| `creature.enter.before` | Before entry | Constrained rewrite | Ready keyword |
| `creature.entered` | After entry | Issue orders | Summon triggers |
| `creature.attacked` / `creature.blocked` | Committed actions | Issue orders | Attack/block effects |
| `damage.before` | Before damage | Constrained rewrite/cancel | Armor, ward |
| `damage.dealt` | After damage | Issue orders | Retaliation |
| `creature.destroy.before` | Before destruction | Constrained replacement | Prevention/replacement |
| `creature.destroyed` | After removal | Issue orders | Deathbound, sacrifice effects |
| `energy.generate.before` / `energy.generated` | Around energy | Constrained rewrite / issue orders | Energy multipliers |

**[PROPOSED]** Start with these hooks and add new named hooks when needed, rather than a hook around every helper function. A single game action may emit multiple committed events, but their sequence is well defined.

### 6.3 Hook ordering and effect queue

A recommended processing flow:

```text
Receive player command
  -> Validate command against current phase/state/identity
  -> Expand to internal order(s)
  -> BEFORE hooks (ordered, constrained order rewrite/cancel)
  -> Core operation mutates transaction state
  -> Record fact events
  -> AFTER hooks enqueue follow-up orders
  -> Process queued orders one by one
  -> Resolve any immediate triggers and state-based destruction checks
  -> If player input needed: persist pendingChoice + continuation, pause
  -> Check outcome, commit snapshot + events
```

- **[PROPOSED]** Stage order: `precondition` → `replacement/prevention` → `amount adjustment` → `commit` → `after/trigger` → `state-based actions` → `victory`.
- For competing hooks of the same stage: explicit priority, then active player/controller order, board slot, ability ID, and a stable registration index. **[OPEN]** Exact published gameplay tie-breaker; do not use nondeterministic JS object iteration or import order.
- **Important:** an extension does not directly mutate `ctx.state`; it issues orders or returns a limited, validated patch to the current `before`-hook payload.
- **Important:** a death-trigger ability must be discoverable from the dying creature's last-known abilities, even after battlefield removal.
- Prevent infinite loops through an **order/effect budget per committed command**, cycle diagnostics and a deterministic failure mode. For production, define whether a budget breach invalidates the action, ends the match or marks it unresolved. **[PROPOSED]** Reject transaction with `RESOLUTION_LIMIT` and log diagnostics during development.
- Avoid using raw `Date.now()`, `Math.random()`, network I/O, filesystem I/O or external state in extensions.

### 6.4 Effects vs orders

**Operations** are reusable low-level game mutations (`dealDamage`, `draw`, `move`, `modifyStats`). **Abilities** decide *when* and *why* those operations happen. **Keywords** are reusable, named bundles of ability bindings with metadata/tooltips. **Cards** reference keywords/abilities and their validated parameters.

A highly specialized ability may be TypeScript; that is acceptable **once per reusable mechanic**, not once per card. Avoid forcing every possible ability into JSON expression syntax. Add selectors/expressions only where they pay off for reuse.

### 6.5 Static modifiers

Do not permanently rewrite printed stats when a continuous aura is active. Compute effective stats from printed base + counters + attached buffs + live static modifiers. Cache only if necessary, invalidating deterministically on state change. For max ten board creatures, simple recalculation is adequate.

Define the interaction between damage and Defense decreases: **[PROPOSED]** after a static modifier changes effective Defense, run state-based destruction checks; then route resulting deaths through normal orders/events.

### 6.6 Pending choices

Effects sometimes require interaction before completion: choose a target, select a produced energy type, select a creature to Consume, order simultaneous triggers, or choose among two drawn cards.

```ts
type PendingChoice = {
  id: string;
  playerId: PlayerId;
  kind: 'draw-pick' | 'target' | 'energy-option' | 'payment' | 'ability-option';
  allowedOptions: unknown[]; // normalized, typed per kind in final union
  resumeToken: string;        // internal opaque continuation key
};
```

While a choice exists, only the appropriate `resolveChoice` or permitted match-management commands are accepted. Serialize a **data-only continuation** (pending orders, indices and bindings), not a JS closure. Never expose private options (e.g., deck contents) to the wrong player.

---

## 7. Declarative content schema

Use Valibot at the **content import boundary**, plus build-time cross-reference checks. Typed TypeScript content objects or JSON files are both acceptable; JSON is preferable for non-programmer tooling and external authoring.

```json
{
  "id": "elderwood.forest-sprite",
  "revision": 1,
  "set": "core",
  "nameKey": "card.elderwood.forest-sprite.name",
  "descriptionKey": "card.elderwood.forest-sprite.description",
  "type": "monster",
  "rarity": "common",
  "legendary": false,
  "factions": ["elderwood"],
  "subtypes": ["spirit"],
  "cost": { "generic": 0, "factions": {} },
  "stats": {
    "attack": 1,
    "defense": 1,
    "energyOutputs": [{ "factions": { "elderwood": 1 } }]
  },
  "abilities": [],
  "visuals": {
    "still": "elderwood/forest-sprite.webp",
    "loop": "elderwood/forest-sprite.webm"
  }
}
```

Dual-faction example:

```json
{
  "id": "crownlands-ironbound.runeguard",
  "type": "monster",
  "factions": ["crownlands", "ironbound"],
  "cost": {
    "generic": 1,
    "factions": { "crownlands": 1, "ironbound": 1 }
  },
  "stats": {
    "attack": 2, "defense": 4,
    "energyOutputs": [
      { "factions": { "crownlands": 1 } },
      { "factions": { "ironbound": 1 } }
    ]
  },
  "abilities": [{ "id": "defensive-formation", "params": { "defense": 1 } }]
}
```

The second example omits ordinary required metadata for brevity. **[PROPOSED]** Use independent schemas for monsters and spells (tagged `type` union); a spell has no `stats`, no battlefield slot and a `cast` effect binding.

### 7.1 Schema checks

- IDs unique and stable; references resolve to registered factions, ability IDs and keywords.
- Nonnegative integer costs, attack, defense, and energy amounts; restrict zero Defense if it causes immediate destruction unless intentional.
- Legendary/deck-limit constraints; valid rarity/set/visual reference.
- Extension parameters validated by the extension's own schema.
- Spell timing flags validated against available phases/windows.
- Content version pinned in match state; updates must not alter a running match.
- Localization keys and still artwork must exist. Animated artwork optional.
- Deck-building validation uses the same registry as runtime validation.

### 7.2 Versioning/migrations

Pin a **content bundle hash** and **engine rules version** in every match/replay. Published card balance edits should bump card revision and bundle hash. Do not reinterpret historical replays through current balance data. Extension migrations apply to serialized state only when intentionally supported.

---

## 8. Detailed command flows

### 8.1 Play a monster

1. Verify it is the active player's Play Phase, the card is in their hand, the target slot is free (or a registered `consume` ability frees a slot during cost payment), and cost can be paid.
2. Collect required target, cost and payment choices if not already provided.
3. Spend typed energy from the Play Phase pool, tracking exact allocation.
4. Apply allowed `card.play.before` modifiers/prevention.
5. Move card from hand to battlefield, set controller/slot, mark **exhausted by default**.
6. Apply `creature.enter.before` overrides such as `ready` where defined.
7. Emit `card.played`, `creature.entered` in stable sequence; process triggered orders and victory checks.

**Implementation detail:** establish clearly whether `card.play.before` runs before or after payment authorization; use a validated **final cost** before payment, and avoid double payment if effects redirect or cancel a summon.

### 8.2 Generate energy

1. Verify active Play Phase, creature controlled, on board and not exhausted.
2. Choose a legal output from the creature's current effective `energyOutputs`.
3. Resolve energy-generation interception.
4. Exhaust creature and add output to active Play Phase pool atomically; emit exhaustion/energy events.
5. Trigger follow-up abilities. Never allow the same creature to exhaust twice without being readied.

### 8.3 Draw-two-keep-one

1. Draw up to two using reshuffle-if-needed semantics.
2. If two cards were drawn, present only those two to the active player as a `draw-pick` choice. Choice resolution keeps one and discards the other.
3. If only one is obtainable, **[PROPOSED]** automatically keep it; if zero, do nothing. The original rule does not specify special handling for partial draws.
4. Skip this entire step on the first player's first turn.

### 8.4 Combat

1. Active player declares eligible unique attackers; exhaust them.
2. Defending player assigns zero or one valid blocker per attacker, with each blocker used at most once. The attacker reviews the committed formation and confirms combat.
3. Apply attack/block triggers in deterministic order.
4. Resolve engagements in attacker board-slot order. Within each engagement, apply the attacker's full hit and its single blocker's full return hit before death checks or queued effects. Otherwise damage the defending player. A declared block still prevents spillover if its blocker leaves before damage.
5. Gather destroyed **defending** monsters for the death-energy snapshot.
6. Open defender's death-energy spell window, present available spells and energy choices, resolve one at a time, then expire the pool.
7. Continue to End Phase; do not permit Play Phase summons between combat and this window.

### 8.5 End phase

1. Run end-phase and end-turn triggers at a defined point.
2. Remove temporary damage, ready surviving monsters per original rules, expire `until-end-of-turn` modifiers, and clear all phase/window pools.
3. Pass active player and enter next Draw Phase.

**[OPEN]** Exact order of end-turn triggers, cleanup and readying: they can affect cards with `when readied` or `if damaged` abilities. Define a published order before introducing those cards.

---

## 9. Privacy, determinism and multiplayer

### 9.1 Determinism

`apply(state, command, contentRegistry)` must produce the same `(nextState, events)` given identical initial data and RNG state. Use seeded PRNG for shuffling, random targets and randomized effects. Stable sequence numbers govern orders, events and ability processing. Avoid nondeterministic object iteration; use explicit sorting when required.

### 9.2 Public projections

The **authoritative state must not be sent wholesale** to the opponent. Separate:

- **Public:** life, battlefield slots, visible cards and statuses, discard piles (unless a future card makes them private), energy pools, phase, action log.
- **Own private:** own hand, pending draws/choices, deck size but not order unless entitled.
- **Opponent private:** hidden hand/card identities, deck order, undisclosed choices, unrevealed random results.

Define `projectForPlayer(state, playerId)` and `projectForSpectator(state)`; derive these server-side. Events also need visibility scopes. **Never leak a hidden card via an animation event or a pending-choice payload.** For local hotseat, the UI may know both sides but should still use projections.

### 9.3 Transport **[PROPOSED]**

- WebSocket command envelope: `{ matchId, clientActionId, expectedRevision, command }`.
- Server authenticates player membership, validates command and applies it on one serialized match executor.
- Response: `{ revision, events, publicProjection, privateProjectionDelta?, pendingChoice? }`.
- Reject stale revisions or idempotently replay prior `clientActionId` results.
- Persist match snapshots plus ordered commands (or event log) for restoration/replays.
- First playable build uses the same engine in a local in-memory session, no network required.

---

## 10. Presentation/display engine

### 10.1 Technical direction

**React + HTML/CSS** for board, cards, hands, text and controls. Optional Web Animations API for transitions and Canvas/WebGL/R3F only for effects requiring it. Do not put gameplay rules into visual components.

### 10.2 Three separate models

1. **Game state:** authoritative, immediately correct.
2. **Player view:** filtered projection with only information the player is allowed to see.
3. **Animation state:** ephemeral state machine/queue derived from game events; may temporarily display transitions between two committed revisions.

Animation queue must be cancellable/skippable. A disconnect, refresh, fast-forward or reduced-motion preference must never alter game outcome. Input restrictions come from legal-action projection, not CSS animation completion.

### 10.3 Card media

- Static image fallback for every card (`WebP` or `AVIF`).
- Optional muted, looping five-second card video (`WebM` with `MP4` fallback if required); no per-card soundtrack.
- UI interaction sounds only: draw, play, attack, damage, discard, win/loss, etc.
- Pause/defer off-screen or otherwise hidden video; use static art for large collections and most thumbnails.
- Favor restrained Gwent-like living illustrations, not cinematic camera motion.
- Provide card inspection at higher media resolution, keyboard/touch alternatives, readable card text, motion controls and `prefers-reduced-motion` fallback.

### 10.4 Renderer event mapping

| Game event | Typical animation |
| --- | --- |
| `card.drawn` | Card moves toward private hand (never reveal opponent card) |
| `card.played` | Hand card into chosen board slot |
| `energy.generated` | Colored energy counter pulse |
| `creature.exhausted` | Tilt/overlay/status indicator |
| `attack.declared` | Attacker advances |
| `block.assigned` | Defender intercepts |
| `damage.dealt` | Impact/highlight/life reduction |
| `creature.destroyed` | Dissolve/remove/free slot |
| `spell.cast` | Visual preset keyed by card presentation data |
| `game.ended` | Victory/loss presentation |

The event log is a **presentation instruction source**, not authority for recomputing game rules.

---

## 11. Content production workflow

1. Author card JSON (or editor form) against schemas.
2. Validate faction IDs, ability IDs/params, card references, localization and asset manifest.
3. Render static card preview from the exact content registry.
4. Run a deterministic sample scenario and effect regression tests.
5. Generate/attach illustration; animation optional and can be added later without touching rules.
6. Tag card set and content version, then publish content bundle.

**Card editor (later):** A form-driven UI that introspects Valibot ability parameter schemas, shows legal selectors/targets, previews tooltip text and exports validated JSON. Not a prerequisite for v1.

**Card balance:** Keep stats/costs as content. Add CLI simulations, seeded match scenarios and telemetry only once meaningful gameplay exists. Avoid overbuilding a generalized balance AI before rules settle.

---

## 12. Testing strategy and acceptance tests

The rules engine is small enough to test exhaustively at the boundary, but extension composition deserves heavier automated coverage than the visual layer.

### 12.1 Core unit/scenario tests

- Starting decks shuffled deterministically; each player starts with five cards and 10 life.
- First player skips first draw; later draws present two choices and discard one.
- Five board slots only; sixth monster rejected unless a valid `consume` ability or other explicit slot-freeing effect applies.
- Monster enters exhausted; cannot immediately attack or generate energy; `ready` can override.
- Exhausted monster can block but cannot generate energy or attack.
- End-phase readying follows the chosen rule, not the pre-adaptation behavior.
- A zero-cost monster can enter without existing energy; an expensive monster cannot pay for itself.
- Typed colored and generic payments succeed/fail correctly; excess energy lasts only through Play Phase.
- Dual-energy output choice records one selected bundle, not both.
- Attack declarations reject reused attackers. Block assignments reject repeated attackers and repeated blockers; serialize each one-to-one pair in state and replay.
- Unblocked attackers damage the player. Blocked attackers and their single defenders strike each other simultaneously; verify armor, marked damage, mutual death, aura snapshots and no player spillover.
- Damage accumulates until end phase; destroy when damage >= effective Defense.
- Destroyed defenders create appropriate temporary death energy; only eligible spells may spend it; pool expires.
- Spell resolution serializes without a stack; triggers fire exactly once in correct order.
- Drawing the final library card immediately loses; discards never recycle. Test turn draws, spell/trigger draws, and first-empty precedence.
- Both players reaching 0 through one fully resolved event results in draw.
- Rejected commands do not change state, RNG cursor, sequence or event log.

### 12.2 Extension-level tests

- Register ability and validate its params; invalid params rejected at content compile time.
- Death trigger uses destroyed entity's last-known controller/abilities.
- Before hooks can only change approved fields; post-hooks cannot retroactively cancel events.
- Multiple hooks resolve consistently despite module registration order.
- A trigger chain (`attack` → damage → death → draw) resolves in a bounded deterministic queue.
- A static aura disappears when source leaves play; subsequent effective stats recompute.
- Choice suspension persists across JSON serialization and resumes from valid option only.
- Infinite-effect-loop scenario returns deterministic error/diagnostic and leaves committed state valid.

### 12.3 Property-based and integration tests

- No instance exists in two zones.
- Board never has more than five monsters.
- Energy pools never go negative.
- Costs are fully paid before card enters play.
- Exhausted cards cannot perform exhausting actions.
- Every replay with same seed and accepted command list produces identical state hash.
- Opponent projection never contains hidden hand or deck identities.
- UI animations can be skipped and still end at the correct projected state.
- Content bundle compiles with no unknown ability, faction, keyword or broken asset path.

### 12.4 Developer/debug tooling

- Headless CLI scenario runner with seeded states.
- Time-travel through snapshots/commands; inspect state and event list.
- A debug match screen with board slots, turn/phase, card IDs, pools, order queue, event log and legal actions.
- Golden-file test scenarios for complicated triggered-effect chains.
- State invariant assertions in development builds.

---

## 13. Implementation roadmap

### Milestone 0 — Confirm rules and fixtures

**Deliverable:** `rules.md`, decision log, canonical JSON content samples, Valibot schemas, and ~12 simple test cards.

- Resolve the high-impact questions in §15 or explicitly codify temporary prototype defaults.
- Write scenarios for initial draw, ramp, five-slot lock, colored payment, combat and death-energy window.
- Give every card/ability/faction a stable ID.

**Done when:** the rules scenarios can be described unambiguously in test fixtures.

### Milestone 1 — Minimal headless game

**Deliverable:** deterministic local match engine.

- Match state and seeded shuffle.
- Zones, start/draw/play/attack/end phase flow.
- Five slots, exhausted entry, Ready override.
- Colored energy pools and payment.
- Play basic monsters and simple spells.
- Attack/block/damage/death/10-life victory.
- Implement discard reshuffle and basic post-combat death window.

**Done when:** two scripts can play a complete legal match with no UI.

### Milestone 2 — Extension runtime

**Deliverable:** hooks, typed registry and ability components.

- `before/after` hook lifecycle, internal order queue, transactional commit, stable sequencing.
- Trigger ownership and last-known state.
- `pendingChoice` continuation and legal-option validation.
- Static-modifier calculation.
- Sample abilities: Ready, damage-on-play, Deathbound, aura +1 Attack, optional Consume.

**Done when:** adding a new card with existing abilities requires only content changes, and chained triggers behave deterministically.

### Milestone 3 — Basic playable UI

**Deliverable:** local browser match.

- Board, five slots per side, hands, life, draw choice, typed energy pool, phase controls, attack/block selection.
- Event animation queue and static media rendering.
- Clear legal action indicators and useful error messages.
- Debug panel and instant animation-skip mode.

**Done when:** two people can finish a game in browser locally without editing code or state.

### Milestone 4 — Content tools and balance harness

**Deliverable:** extensible card library pipeline.

- Registry validation and batch JSON import.
- Card preview and generated tooltip text.
- Starter decks for two or three faction archetypes with neutral support.
- Scenario-based balance adjustments and automated seeded simulations.
- Attach WebM/MP4 loops selectively; static art required for all cards.

**Done when:** one small expansion can be added without modifying engine code.

### Milestone 5 — Server-authoritative online matches

**Deliverable:** rooms/lobbies and recoverable matches.

- WebSocket commands, per-player projections, idempotency and revision control.
- Auth/session constraints, reconnect/replay snapshots, persistence.
- Client renders authoritative responses; never submits arbitrary internal orders.

**Done when:** two remote players can play safely without reading each other's private cards, and reconnect to a restored match.

### Milestone 6 — Production polish

- A small local card collection and deck builder are implemented in the frontend prototype. Follow-ups include richer collection/deck management, keyword glossary, localization, sound settings and accessibility.
- Content-set packaging, expansion versioning, production observability, anti-abuse and deployment.
- Optimize card media bandwidth, autoplay, render performance and animations.

---

## 14. Concrete first vertical slice: suggested test cards

These are **fixture concepts**, not final balanced card content:

| Card | Cost | Stats / energy | Mechanic exercised |
| --- | --- | --- | --- |
| Elderwood Sprite | 0 | 1/1, 1 Elderwood | Basic delayed ramp |
| Free Clans Scout | 0 | 1/1, 1 Clans | `ready` override (balance test) |
| Crownlands Recruit | 0 | 1/2, 1 Crownlands | Basic defender |
| Ironbound Guard | 1 Ironbound | 1/4, 1 Ironbound | Typed payment, blocking |
| Ashen Initiate | 0 | 0/1, 1 Ashen | Sacrifice target |
| Conclave Adept | 1 Conclave | 1/2, 1 Conclave | Spell synergy |
| Tidebound Courier | 1 Tidebound | 1/2, 1 Tidebound | Return-to-hand test |
| Abyssal Whelp | 1 Abyssal | 3/1, 1 Abyssal | Aggressive tradeoff |
| Runeguard | 1 Crownlands + 1 Ironbound + 1 generic | 2/4, either faction energy | Dual affiliation/output choice |
| Grave Collector | 2 Ashen | 2/2, 1 Ashen | Death-trigger draw |
| Cleansing Light | 1 Crownlands + 1 generic | Spell | Damage/heal operation test |
| Final Bargain | 1 Ashen | Spell, death-window eligible | Defensive death-pool test |

Note: a **costed monster cannot normally be the first source of its own faction energy**; playtest decks require adequate zero-cost ramp in that faction or qualifying neutral/dual-faction conversion. Fixtures may force test states when testing mechanics, but starter decks must obey real ramp economics.

---

## 15. Open questions & decisions to record

The user has **accepted all suggested defaults in this table for initial testing**. Treat the third column as the operational prototype rule, not merely a suggestion. The questions remain tracked for playtesting and later finalization; do not block implementation on them. **`Consume`** is the canonical name of the former proposed `Replace` ability.

| Priority | Question | Suggested prototype default | Why it matters |
| --- | --- | --- | --- |
| **P0** | Does blocker retaliate? | Yes: simultaneous return damage; one blocker per attacker (latest user amendment, 2026-10-11) | Changes combat lethality/economy |
| **P0** | Lane attacks and automatic blocks (2026-10-12) | Attacker picks own/adjacent lane; the card in that lane blocks automatically; empty lane hits the player | Makes position matter; removes the defender's block decision |
| **P0** | Batch attacks and blocks, or sequential combat? | Batch declare, batch block, then resolve | Impacts triggers and death pool |
| **P0** | When do monsters ready? | During controller's End Phase, as source says | Defensive readiness/tempo |
| **P0** | Typed energy from destroyed defenders with multiple options? | Defender chooses one legal printed output per destroyed defender | Determines reactive spell availability |
| **P0** | Can `consume` free a slot *before* checking ability to play? | Yes, as an additional play cost of a card with `consume` | Defines five-slot escape route |
| **P1** | When do end-turn triggers fire relative to ready/cleanup? | Trigger, damage clear, expire, ready, empty pools, pass | Affects timing synergies |
| **P1** | How are simultaneous triggers ordered? | Stable priority/controller/slot/ID order | Fairness, replayability |
| **P1** | What can death-window spells target and trigger? | Normal effects, no new death energy from spell deaths | Limits chains |
| **P1** | What if only one card can be drawn in draw-two-keep-one? | Keep it automatically | Edge-case handling |
| **P1** | Can costs/energy output change from abilities? | Yes via typed hooks/modifiers | Content richness |
| **P1** | Is there a maximum deck size? | No for initial prototype | Deckbuilder/competitive constraints |
| **P2** | UI term: Monster or Creature? | Monster in formal rules, Creature in runtime | Naming only |
| **P2** | Is neutral energy a distinct pool type? | Yes, payable for generic costs only | Neutral-ramp balancing |
| **P2** | Are multi-faction cards inherently stronger? | No automatic bonus | Balance policy, not engine rule |

**Decision log template**

```md
### DEC-001 — Combat damage semantics
- Date:
- Status: accepted / proposed / superseded
- Decision:
- Rationale:
- Consequences for rules:
- Consequences for implementation/tests:
```

---

## 16. Guidance for an AI coding agent

When implementing this design, follow this order of authority:

1. Explicit **[LOCKED]** rules from this document.
2. Explicit accepted decision records.
3. **Accepted-for-testing [PROPOSED]** prototype defaults for matters not permanently finalized.
4. Existing test fixtures and registered content schema.

**Do not silently invent game rules** when a card or test exposes a gap. Add an `OPEN` item and use a narrowly scoped, explicitly documented prototype default with a test. Do not reintroduce immediate-ready monsters by default; entry exhaustion is intentional. Do not add a base energy source or free sacrifice action. Do not give all cards custom code. Do not implement a stack. Do not conflate card affiliation with energy output. Do not trust UI state as match authority.

Recommended development cadence:

- Implement one gameplay invariant with scenario tests.
- Expose it through the smallest command/order/hook contract that supports reusable cards.
- Add fixture card content referencing that capability.
- Add renderer event and UI action only when necessary to play the flow.
- Record a decision for gameplay changes; bump content or rules version appropriately.

### Definition of done for engine architecture

A developer can add several new cards—including at least one dual-faction creature, a spell and a multi-ability monster—by editing **only content files and assets**. The loader validates them; the headless engine can play them; events are suitable for the renderer; online projection would not leak secrets; and deterministic replay reproduces the match. A **new reusable mechanic** requires adding one typed extension and its tests, not special-casing specific card IDs in core.

---

## Appendix A — Source/adaptation traceability

| Source concept (October 2026 rules) | Adaptation |
| --- | --- |
| §1.1 10 life, win/lose/draw | Unchanged |
| §1.2 30-card decks, 3 copies, Legendary singleton, initial 5 | Unchanged |
| §1.3 monsters and spells | Unchanged |
| §2.2 draw 2 choose 1; first-player skip | Unchanged |
| §2.3 / §3.1 three battlefield monsters | **Five**, explicit user decision |
| §2.3 no summoning sickness vs §3.3 enters exhausted | **Enters exhausted**, explicit latest user decision; Ready exception |
| §2.3 exhaustion creates energy | Same structure, now typed/faction energy |
| §2.4 unblocked/blocked attacks and defender blockers | Amended 2026-10-11: simultaneous retaliation with at most one blocker per attacker and no damage reordering |
| §2.5 death-energy window | Preserved; colored output needs explicit decision |
| §2.6/§3.3 end turn ready and clear damage | Preserved pending timing clarification |
| §3.4 static/triggered/spell effects | Extension hook framework, content references reusable implementations |
| §4 temporary energy pools and cost payment | Preserved; colored/faction + generic costs added |
| §4.3 spell timing, no stack | Preserved |
| §5 deck/discard and reshuffling | Preserved |
| §6 victory checks after full resolution | Preserved |

## Appendix B — Explicit architectural principles

**A1.** Core rules are concrete and game-specific.  
**A2.** Extensions are normal, testable TypeScript code, registered once.  
**A3.** Cards and expansions are data; they reference registered extensions by ID.  
**A4.** All game mutations pass through transactional orders/invariants.  
**A5.** Pre-hooks intercept; post-hooks react.  
**A6.** All resolution and randomness are deterministic and replayable.  
**A7.** The authoritative state is separate from per-player projections and animation state.  
**A8.** The five-slot economy and default exhausted entry must remain central design constraints.  
**A9.** No general-purpose scripting DSL, no Magic-like stack, no extra resource layer without explicit design approval.  
**A10.** Build a playable headless vertical slice before scale, polish, or broad content production.

### Prototype card authoring source (2026-10-11)

Card definitions and media now live in `assets/cards/<card-name>/data.json`, `data.png`, and optional `data.webm`. Factions are defined once each in `assets/factions/<faction-id>.json` (name, short label, color and an optional booster pack); cards reference them by ID, including dual affiliations and neutral cards. Stable IDs are independent of folder names. A Node authoring importer validates complete definitions and registered extensions, then generates the shared data-only catalogue and public media. Vite watches the source folders, while build/test/headless commands import explicitly before execution. The pure content compiler remains usable in browser and server environments and has no filesystem dependency. See `assets/README.md` for the authoring contract and `scripts/card-assets.ts` for import validation and staged writes.
