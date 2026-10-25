# Ability blocks

Abilities are composed from small shared pieces in `packages/extensions/src/blocks.ts`. An ability definition (`defineAbility`) keeps what is specific to it: the parameter schema, the target kind, the translated text and the defaults. It consumes blocks for what it does.

```ts
extension("hive", schema, {
  // ...text, translations, announce
  hooks: whenFriendlyDies({ subtype: param("subtype") }, searchLibraryForSubtype(param("subtype"))),
});
```

## Vocabulary

Everything below lives in `blocks.ts`. Each ability uses the parts it needs and the engine hook it plugs into (`hooks`, `cast`, `activate`, `static`, `before`, `canBlock`, `intercepts`, `canActivate`).

### Triggers, selectors, effects (`hooks`, `cast`, `activate`)

- **Triggers** say when: `whenPlayed`, `whenFriendlyDies({ subtype?, other?, where? })`, and the generic `when(event, condition, ...effects)`. `triggers(a, b)` combines several on one ability.
- **Selectors** say to what: `chosen` (the target picked on play or activation), `self`, `you`, `opponent`, `enemyCreatures`, `oppositeCreature`. `union(a, b)` gathers several. A selector that finds nothing makes its effect do nothing.
- **Effects** say what happens: `draw`, `damage`, `heal`, `boost`, `destroy`, `returnToHand`, `searchLibrary`, `searchLibraryForSubtype`, `searchLibraryByCost`, `ransack`, `mill`, `gainEnergy`, `gainEnergyOfTypes`, `gainEnergyOfChosen`, `deployChosen({ ready? })`. `sequence`/`run` run several in order, `onlyIf` guards them.
- **Values** are literals or `param("name", fallback?)`, which reads the card's ability parameters.

For `cast` and `activate`, use `run(...effects)`.

### Conditions: `and`, `or`, `not`

One set of combinators works on every kind of condition (hook, static, activation):

```ts
whenFriendlyDies({ where: or(diedWithSubtype("orc"), diedWithSubtype("goblin")) }, draw(1));
when("spell.cast", and(duringYourPlayPhase, byYou, firstThisTurn("spell.cast")), gainEnergy({ ... }));
```

`and()` with nothing is true, `or()` with nothing is false. Hook conditions: `selfDied`, `friendlyDied`, `diedWithSubtype`, `byYou`, `duringYourPlayPhase`, `firstThisTurn(eventType)`.

### Static modifiers (`static`)

`modify(condition, { attack?, defense? })` gives a bonus to every target that meets the condition. `modifiers(a, b)` puts several together and adds their bonuses. Conditions: `targetIsSource`, `sameController`, `otherController`, `adjacent`, `opposite`, `targetOnBoard`, `targetIsCreature`, `targetHasSubtype(subtype)`, `sourceOnFlank`. An amount can be a literal, `param(...)`, or computed (`adjacentCreatures`).

```ts
static: modifiers(
  modify(and(adjacent, targetIsCreature), { defense: 1 }),
  modify(and(adjacent, targetIsCreature, targetHasSubtype("elf")), { defense: 1 }), // elves get +2 in total
);
```

### Replacements (`before`)

`replacing(event, ...replacements)`: `reduceDamage`, `entersReady`, `requireSacrifice`, `addEnergy`. `replaceWhen(condition, ...replacements)` applies them only while the condition holds.

### Combat and activation

`unblockable` (for `canBlock`), `guardsAdjacentLanes` (for `intercepts`). `activatableWhen(condition)` for `canActivate`, with `libraryHasAtLeast(n)`.

## Rules

- A block only issues orders through `ctx.issue`. It never changes state directly, so resolution stays deterministic and replayable.
- Resolution rules are unchanged: no stack, hooks ordered by the engine, an order budget per command (see `architecture.md`).
- A new effect or trigger is added to `blocks.ts` with a test in `apps/web/tests/blocks.test.ts`. If a card needs behaviour no block covers, add the block rather than a one-off function.
- Text stays on the definition. A composed ability still needs an English description and a German translation.

## Not built from blocks yet

Nothing in the shipped ability set is hand-written any more. What stays on the definition is the parameter schema, text, target kind, `activationEnergy` (Primal) and `placement`. If a new card needs a condition or effect that no block has, add the block.
