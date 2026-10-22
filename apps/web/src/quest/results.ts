import type { Action, RunState } from "@realms/quest";

/** What an action just did, in the words the result panel shows. `art` names an optional painting in assets/quest/art (found-silver.webp and so on). */
export type ActionResult = {
  node: string;
  kind: "silver" | "life" | "nothing" | "info";
  title: string;
  detail?: string;
  silver?: number;
  life?: number;
  art?: string;
};

/**
 * Describes the outcome of an action by comparing the run before and after it. Null when something else answers for itself:
 * a pick pack, the shop or a fight opens its own screen.
 */
export function describeResult(
  before: RunState,
  after: RunState,
  action: Action,
): ActionResult | null {
  const node = before.encounter?.node;
  if (!node || after.fight || after.offer) return null;
  const silver = after.silver - before.silver,
    life = after.life - before.life,
    role = before.encounter!.role;
  switch (action.type) {
    case "search": {
      if (role === "cache") {
        const find = after.caches[node];
        if (find?.kind === "silver")
          return {
            node,
            kind: "silver",
            title: "Silver in the dirt",
            detail: "Whoever buried it never came back.",
            silver,
            art: "found-silver",
          };
        if (find?.kind === "life")
          return {
            node,
            kind: "life",
            title: "Something to drink",
            detail: "A flask, still sealed, and still good.",
            life,
            art: "found-life",
          };
        return {
          node,
          kind: "nothing",
          title: "Nothing here",
          detail: "The hole is empty. Someone got here first.",
          art: "found-nothing",
        };
      }
      if (silver > 0)
        return {
          node,
          kind: "silver",
          title: "Silver among the stones",
          detail: "Others missed it.",
          silver,
          art: "found-silver",
        };
      return {
        node,
        kind: "nothing",
        title: "Nothing more to find",
        detail: "You turn over every stone and find only dust.",
        art: "found-nothing",
      };
    }
    case "heal":
      return {
        node,
        kind: "life",
        title: "Wounds tended",
        detail: "Bandaged and fed, you walk steadier.",
        life,
        silver,
        art: "healed",
      };
    case "read":
      return {
        node,
        kind: "info",
        title: "The road opens up",
        detail: "The places around this waymark are marked on your map.",
      };
    case "smith":
      return {
        node,
        kind: "silver",
        title: "Card destroyed",
        detail: "The smith pays half its worth.",
        silver,
      };
    default:
      return null;
  }
}
