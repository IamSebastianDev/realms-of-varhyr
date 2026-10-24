import cards from "./matches/mercenaries-turn-9/cards.json";
import { abilities } from "@realms/extensions";
import * as v from "valibot";
import { defineAbility } from "@realms/extensions/definition";
import { legacyAbilities } from "./legacyAbilities";
import { compileContent } from "@realms/content/compiler";
/** A recorded game is replayed on its own card pool and only the abilities it uses, so newly added abilities cannot change it. */
const abilityIds = [
  "adjacent-banner",
  "armor",
  "channel-neutral",
  "charge",
  "damage",
  "draw",
  "flank-evasion",
  "guard",
  "heal",
  "invocation",
  "rally",
  "rime",
  "shield-wall",
  "war-banner",
];
/** The original neutral-only ability, kept as it was when the match was recorded. Live content now uses `channel`. */
const legacyChannelNeutral = defineAbility(
  "channel-neutral",
  v.object({ amount: v.pipe(v.number(), v.integer(), v.minValue(1)) }),
  {
    name: "Channel {amount} Neutral",
    description:
      "Gain {amount} neutral energy in your current casting-phase pool. It can pay generic costs, but not faction-specific costs, and expires with that pool.",
    translations: {
      de: {
        name: "Kanalisieren: {amount} Neutral",
        description:
          "Erhalte {amount} neutrale Energie im Energievorrat deiner aktuellen Zauberphase. Sie bezahlt allgemeine Kosten, aber keine Fraktionskosten, und verfällt mit diesem Vorrat.",
      },
    },
    cast: (ctx, p) =>
      ctx.issue({
        type: "gain-energy",
        player: ctx.source.controller,
        output: { neutral: p.amount as number },
        source: ctx.source.id,
      }),
  },
);
const pinned: typeof abilities = {
  ...abilities,
  ...Object.fromEntries(legacyAbilities.map((a) => [a.id, a])),
  "channel-neutral": legacyChannelNeutral,
};
/** The abilities the recording needs, by id. Texts and names do not matter for a replay, so the live ones are used. */
export const recordedAbilities = Object.fromEntries(abilityIds.map((id) => [id, pinned[id]]));
export const recordedRegistry = compileContent(cards, recordedAbilities, undefined, ["crownlands"]);
