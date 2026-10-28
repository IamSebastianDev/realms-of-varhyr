import { registry } from "@realms/content";
import type { PlayerView } from "@realms/contracts";
import { localizedAbility, localizedCard, t as msg } from "@realms/ui/i18n";

import type { Draft } from "./matchTypes";

export type ChoiceBanner = { text: string; source?: string };

/**
 * The instruction shown big over the battlefield while the game waits for a pick on the board: what to choose, and for which card.
 * The wording of a target comes from the card's own targeting ability ("Ready target friendly creature.").
 */
export function choiceBanner({
  view,
  stage,
  draft,
  damagePick,
  returns,
}: {
  view: PlayerView;
  stage: "none" | "mode" | "consume" | "position" | "target";
  draft: Draft | null;
  damagePick: { amount: number; sourceName: string } | null;
  returns?: boolean;
}): ChoiceBanner | null {
  if (damagePick)
    return {
      text: msg("Deal {v0} damage to a target.", { v0: damagePick.amount }),
      source: msg(damagePick.sourceName),
    };
  const card = draft && view.cards[draft.cardId];
  if (!draft || !card || stage === "none" || stage === "mode") return null;
  const def = registry.cards[card.definitionId];
  const source = localizedCard(def).name;
  if (stage === "consume")
    return {
      text: returns
        ? msg("Choose a friendly creature to return to your hand.")
        : msg("Choose a friendly creature to sacrifice."),
      source,
    };
  if (stage === "position") return { text: msg("Choose a position to deploy to."), source };
  const binding =
    draft.activation !== undefined
      ? def.abilities[draft.activation]
      : [...(def.cast ?? []), ...def.abilities].find((b) => registry.abilities[b.id]?.target);
  const description = binding
    ? localizedAbility(binding, registry.abilities[binding.id]).description
    : undefined;
  return { text: description ?? msg("Choose a highlighted target."), source };
}
