import type { CardDefinition, Pool, Registry } from "@realms/contracts";

/** Production capability for deck analysis and bot valuation, independent of readiness.
 * Printed outputs also generate response energy when the creature dies, on any turn and from any cause; activated outputs never do. */
export function energyProductionOptions(card: CardDefinition, registry: Registry): Pool[] {
  return [
    ...(card.stats?.energyOutputs ?? []),
    ...card.abilities.flatMap(
      (binding) =>
        registry.abilities[binding.id].activationEnergy?.(binding.params, registry) ?? [],
    ),
  ];
}
