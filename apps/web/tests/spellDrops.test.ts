import { describe, expect, it } from "vitest";
import { apply, createMatch, projectForPlayer } from "@realms/core";
import type { CardDefinition, GameState, PlayerId } from "@realms/contracts";
import { compileContent, registry as base, starterDecks } from "@realms/testing/content";
import { hitDropZone, nextPlayStage, resolveDrop } from "../src/features/match/lib/cardInteraction";

const enemy = (player: PlayerId): PlayerId => (player === "p1" ? "p2" : "p1");
const spell = (id: string, cast: CardDefinition["cast"]): CardDefinition => ({
  ...base.cards["cleansing-light"],
  id,
  deckLimitKey: id,
  cost: { generic: 1, factions: {} },
  cast,
});
const content = compileContent([
  ...Object.values(base.cards),
  spell("draw-spell", [{ id: "draw", params: { amount: 1 } }]),
  spell("creature-spell", [{ id: "destroy", params: {} }]),
  spell("raise-spell", [
    { id: "raise", params: { subtype: base.cards["crown-recruit"].subtypes[0] } },
  ]),
]);
function setup(viewer: PlayerId = "p1") {
  const state = createMatch(content, [starterDecks.verdant, starterDecks.hollow], 731);
  for (const player of Object.values(state.players)) {
    for (const id of player.hand) {
      state.cards[id].zone = "deck";
      player.deck.push(id);
    }
    player.hand = [];
    player.energy = { neutral: 10, crownlands: 10 };
  }
  state.active = viewer;
  state.events = [];
  return state;
}
function place(
  state: GameState,
  definitionId: string,
  owner: PlayerId,
  zone: "hand" | "board" | "discard",
  slot = 0,
) {
  const player = state.players[owner],
    id = player.deck.pop()!;
  Object.assign(state.cards[id], { definitionId, zone, slot: zone === "board" ? slot : null });
  if (zone === "board") player.board[slot] = id;
  else player[zone].push(id);
  return id;
}

describe("spell drag destinations", () => {
  it.each(["p1", "p2"] as const)(
    "accepts the whole %s opponent panel and keeps battlefield gaps distinct from player damage",
    (viewer) => {
      const foe = enemy(viewer),
        state = setup(viewer);
      const cardId = place(state, "cleansing-light", viewer, "hand");
      const view = projectForPlayer(state, viewer, content);
      const layout = {
        board: { left: 200, top: 20, width: 600, height: 400 },
        slots: [],
        players: {
          [viewer]: { left: 0, top: 300, width: 180, height: 200 },
          [foe]: { left: 0, top: 20, width: 180, height: 200 },
        },
      };
      // A point far from the avatar still hits the player's panel.
      const panel = hitDropZone({ x: 170, y: 210 }, viewer, layout, true)!;
      expect(resolveDrop(view, viewer, content, cardId, panel)).toEqual({ cardId, target: foe });
      const gap = hitDropZone({ x: 500, y: 90 }, viewer, layout, true)!;
      const drop = resolveDrop(view, viewer, content, cardId, gap)!;
      expect(drop).toEqual({ cardId });
      const legal = view.legal.playable.find((play) => play.cardId === cardId)!;
      expect(nextPlayStage(content.cards["cleansing-light"], legal, drop)).toBe("target");
      expect(state.cards[cardId].zone).toBe("hand");
      expect(hitDropZone({ x: 500, y: 90 }, viewer, layout, false)).toBeNull();
      expect(hitDropZone({ x: 900, y: 90 }, viewer, layout, true)).toBeNull();
    },
  );

  it("casts targeted spells directly on a legal field card and asks for a target on an empty or friendly slot", () => {
    const state = setup(),
      cardId = place(state, "cleansing-light", "p1", "hand");
    const target = place(state, "crown-recruit", "p2", "board", 2);
    place(state, "crown-recruit", "p1", "board", 2);
    const view = projectForPlayer(state, "p1", content);
    expect(resolveDrop(view, "p1", content, cardId, { player: "p1", slot: 2 })).toEqual({ cardId });
    expect(resolveDrop(view, "p1", content, cardId, { player: "p2", slot: 1 })).toEqual({ cardId });
    const drop = resolveDrop(view, "p1", content, cardId, { player: "p2", slot: 2 })!;
    expect(drop.target).toBe(target);
    const result = apply(
      state,
      { actor: "p1", expectedRevision: state.revision, command: { type: "play", ...drop } },
      content,
    );
    expect(result.error).toBeUndefined();
    expect(result.state.cards[cardId].zone).toBe("discard");
  });

  it("does not invent a player target for a creature-only spell", () => {
    const state = setup(),
      cardId = place(state, "creature-spell", "p1", "hand");
    const target = place(state, "crown-recruit", "p2", "board", 1);
    const view = projectForPlayer(state, "p1", content);
    const drop = resolveDrop(view, "p1", content, cardId, { player: "p2", area: "player" })!;
    expect(drop).toEqual({ cardId });
    expect(
      nextPlayStage(
        content.cards["creature-spell"],
        view.legal.playable.find((play) => play.cardId === cardId)!,
        drop,
      ),
    ).toBe("target");
    expect(view.legal.playable.find((play) => play.cardId === cardId)!.targets).toEqual([target]);
  });

  it("casts untargeted spells on either battlefield row or player panel, and still rejects unplayable spells", () => {
    const state = setup(),
      cardId = place(state, "draw-spell", "p1", "hand");
    const view = projectForPlayer(state, "p1", content);
    for (const player of ["p1", "p2"] as const)
      for (const area of ["battlefield", "player"] as const) {
        const drop = resolveDrop(view, "p1", content, cardId, { player, area })!;
        const result = apply(
          state,
          { actor: "p1", expectedRevision: state.revision, command: { type: "play", ...drop } },
          content,
        );
        expect(result.error).toBeUndefined();
        expect(result.state.cards[cardId].zone).toBe("discard");
      }
    state.players.p1.energy = {};
    expect(
      resolveDrop(projectForPlayer(state, "p1", content), "p1", content, cardId, { player: "p2" }),
    ).toBeNull();
    expect(resolveDrop(view, "p1", content, cardId, null)).toBeNull();
  });

  it("keeps Raise’s pile target and placement choices, even when dropped over an occupied or enemy slot", () => {
    const state = setup(),
      cardId = place(state, "raise-spell", "p1", "hand");
    place(state, "crown-recruit", "p1", "discard");
    place(state, "crown-recruit", "p1", "board", 0);
    const view = projectForPlayer(state, "p1", content),
      legal = view.legal.playable.find((play) => play.cardId === cardId)!;
    expect(legal).toBeDefined();
    expect(resolveDrop(view, "p1", content, cardId, { player: "p1", slot: 1 })).toEqual({
      cardId,
      slot: 1,
    });
    for (const player of ["p1", "p2"] as const) {
      const drop = resolveDrop(view, "p1", content, cardId, { player, slot: 0 })!;
      expect(drop).toEqual({ cardId });
      expect(nextPlayStage(content.cards["raise-spell"], legal, drop, true)).toBe("target");
    }
  });
});
