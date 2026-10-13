import type { CardDefinition, Pool, Registry } from '../../contracts/src';

/** Production capability for deck analysis and bot valuation, independent of readiness.
 * Printed outputs also generate death energy; activated outputs never do. */
export function energyProductionOptions(card: CardDefinition, registry: Registry): Pool[] {
  return [
    ...(card.stats?.energyOutputs ?? []),
    ...card.abilities.flatMap(binding => registry.abilities[binding.id].activationEnergy?.(binding.params, registry) ?? []),
  ];
}
