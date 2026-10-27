import { useSyncExternalStore } from "react";
import type { CardDefinition, GameEvent, GameState, PlayerId } from "@realms/contracts";
import type { StageRect } from "@realms/ui/stage";

/** One burst of cards leaving a library for a hand, as the table shows it. Presentation only: the engine has already moved them. */
export type DrawFlight = {
  id: string;
  player: PlayerId;
  /** The drawer's own cards (known to the viewer), or none for the opponent's, which are only counted. */
  cardIds: string[];
  count: number;
  /** Wait this long (ms) before the first card leaves, e.g. for a dialog to finish fading in. */
  lead?: number;
};
/** A card kept from the turn's draw, carried from where it was shown to its place in the hand. */
export type KeepFlight = { id: string; cardId: string; card: CardDefinition; from: StageRect };
/** How a card that is still on its way is held back, and how it turns up: face-down cards flip over, a carried card fades in. */
export type Arrival = { delay: number; mode: "flip" | "fade" };

/** Milliseconds between two cards of one draw, and the time one card takes from library to hand. */
export const DRAW_STAGGER = 150;
export const DRAW_FLIGHT = 620;
export const KEEP_FLIGHT = 480;
const SETTLE = 400;

let flights: DrawFlight[] = [];
let keeps: KeepFlight[] = [];
let arriving: Record<string, Arrival> = {};
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/** Shows a draw: the flight, and which hand cards stay hidden until their own flight lands. */
export function announceDraw(flight: DrawFlight) {
  flights = [...flights, flight];
  const lead = flight.lead ?? 0,
    held = { ...arriving };
  flight.cardIds.forEach((id, i) => (held[id] = { delay: lead + i * DRAW_STAGGER, mode: "flip" }));
  arriving = held;
  emit();
  window.setTimeout(
    () => {
      flights = flights.filter((f) => f.id !== flight.id);
      release(flight.cardIds);
    },
    lead + DRAW_FLIGHT + flight.count * DRAW_STAGGER + SETTLE,
  );
}
function release(ids: string[]) {
  const rest = { ...arriving };
  for (const id of ids) delete rest[id];
  arriving = rest;
  emit();
}
/** The kept card leaves the dialog for the hand; its hand slot stays empty until it lands. */
export function announceKeep(keep: Omit<KeepFlight, "id">) {
  const flight = { ...keep, id: `keep-${keep.cardId}` };
  keeps = [...keeps.filter((k) => k.cardId !== keep.cardId), flight];
  arriving = { ...arriving, [keep.cardId]: { delay: 0, mode: "fade" } };
  emit();
  window.setTimeout(() => {
    keeps = keeps.filter((k) => k.id !== flight.id);
    release([keep.cardId]);
  }, 1500);
}
export function clearDraws() {
  if (!flights.length && !keeps.length && !Object.keys(arriving).length) return;
  flights = [];
  keeps = [];
  arriving = {};
  emit();
}
export const useDrawFlights = () =>
  useSyncExternalStore(
    subscribe,
    () => flights,
    () => flights,
  );
export const useKeepFlights = () =>
  useSyncExternalStore(
    subscribe,
    () => keeps,
    () => keeps,
  );
/** Cards that are still on their way, with the delay (ms) before each one turns up. */
export const useArrivingCards = () =>
  useSyncExternalStore(
    subscribe,
    () => arriving,
    () => arriving,
  );

const handSize = (state: GameState, player: PlayerId) => {
  const p = state.players[player] as unknown as { hand?: string[]; handCount?: number };
  return p.hand?.length ?? p.handCount ?? 0;
};
const deckSize = (state: GameState, player: PlayerId) => {
  const p = state.players[player] as unknown as { deck?: string[]; deckCount?: number };
  return p.deck?.length ?? p.deckCount ?? 0;
};

/**
 * The draws a move caused, per player. Not the draw at the start of a turn (it has its own choice) and not the opening hand.
 * The viewer's cards are named by their events; the opponent's are only visible as a count, so a hand that grew
 * while its library shrank by as much (a returned card or a milled one moves only one of the two).
 */
export function drawsOf(
  before: GameState,
  after: GameState,
  events: GameEvent[],
  key: string,
  viewer: PlayerId,
): DrawFlight[] {
  // The turn's own draw (two cards, keep one) is its own step: it starts as the turn changes and ends in the draw phase.
  if (
    before.phase === "draw" ||
    after.phase === "draw" ||
    before.turn !== after.turn ||
    events.some((e) => e.type.startsWith("mulligan."))
  )
    return [];
  const out: DrawFlight[] = [];
  for (const player of ["p1", "p2"] as const) {
    const named = events.filter((e) => e.type === "card.drawn" && e.player === player && e.cardId);
    const counted = Math.max(
      0,
      Math.min(
        deckSize(before, player) - deckSize(after, player),
        handSize(after, player) - handSize(before, player),
      ),
    );
    const count = Math.max(named.length, counted);
    if (!count) continue;
    const cardIds =
      player === viewer
        ? named.map((e) => e.cardId!).filter((id) => after.cards[id]?.zone === "hand")
        : [];
    out.push({ id: `${key}-${player}`, player, cardIds, count: Math.min(count, 6) });
  }
  return out;
}
