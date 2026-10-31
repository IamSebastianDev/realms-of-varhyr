/** The player's own arrangement of their hand. It is a display choice only: the match itself never sees it. */

/** `hand` in the player's order: cards they have placed keep their place, new cards join at the end in the order they arrived. */
export function orderedHand(hand: readonly string[], order: readonly string[]): string[] {
  const inHand = new Set(hand),
    known = order.filter((id) => inHand.has(id)),
    placed = new Set(known);
  return [...known, ...hand.filter((id) => !placed.has(id))];
}

/** `ids` with `id` taken out and put back so that `index` cards stand before it. */
export function moveInOrder(ids: readonly string[], id: string, index: number): string[] {
  const rest = ids.filter((other) => other !== id);
  if (rest.length === ids.length) return [...ids];
  const at = Math.max(0, Math.min(index, rest.length));
  return [...rest.slice(0, at), id, ...rest.slice(at)];
}

type Box = { left: number; top: number; width: number; height: number };

/** Where a card dragged at `point` would land in the hand: the number of other cards whose centre lies to its left. Null when the pointer is not over the hand. */
export function handDropIndex(
  point: { x: number; y: number },
  dragged: string,
  ids: readonly string[],
  hand: Box | undefined,
  boxes: Readonly<Record<string, Box | undefined>>,
): number | null {
  if (
    !hand ||
    point.x < hand.left ||
    point.x > hand.left + hand.width ||
    point.y < hand.top ||
    point.y > hand.top + hand.height
  )
    return null;
  return ids.filter((id) => {
    const box = boxes[id];
    return id !== dragged && box && box.left + box.width / 2 < point.x;
  }).length;
}
