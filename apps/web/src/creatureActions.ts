import type { PlayerView, Pool } from "@realms/contracts";

export type CreatureAction =
  | { kind: "activate"; ability: number; target?: string; output?: Pool }
  | { kind: "channel"; option: number; output: Pool }
  | { kind: "undo-channel" }
  | { kind: "attack"; lane: number; current: boolean }
  | { kind: "withdraw" };

export { undoableChannels, undoChannel } from "@realms/core/channelUndo";

/** `lanes` holds the lane already chosen for each selected attacker; a lane can hold only one attacker. */
export function creatureActions(
  view: PlayerView,
  cardId: string,
  undoable: string[],
  attackers: string[],
  lanes: Record<string, number> = {},
): CreatureAction[] {
  const card = view.cards[cardId];
  if (!card || card.zone !== "board") return [];
  if (view.phase === "play" && undoable.includes(cardId) && card.exhausted)
    return [{ kind: "undo-channel" }];
  const energy = view.legal.energy.find((a) => a.cardId === cardId);
  const playActions: CreatureAction[] = [
    ...(energy?.options.map((output, option) => ({ kind: "channel" as const, option, output })) ??
      []),
    ...view.legal.activations
      .filter((a) => a.cardId === cardId)
      .flatMap((a) =>
        a.energyOptions
          ? a.energyOptions.map((output) => ({
              kind: "activate" as const,
              ability: a.ability,
              target: Object.keys(output)[0],
              output,
            }))
          : [{ kind: "activate" as const, ability: a.ability }],
      ),
  ];
  if (playActions.length) return playActions;
  const reachable = view.legal.lanes[cardId];
  if (reachable) {
    const claimed = new Set(attackers.filter((id) => id !== cardId).map((id) => lanes[id]));
    const selected = attackers.includes(cardId);
    return [
      ...reachable
        .filter((lane) => !claimed.has(lane))
        .map((lane) => ({
          kind: "attack" as const,
          lane,
          current: selected && lanes[cardId] === lane,
        })),
      ...(selected ? [{ kind: "withdraw" as const }] : []),
    ];
  }
  return [];
}
