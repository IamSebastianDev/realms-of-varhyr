import type { CardDefinition, LegalActions, PlayerId, PlayerView, Registry } from '../../../packages/contracts/src';

export type PlayDraft = { cardId: string; slot?: number; consume?: string; target?: string };
export type DropZone = { player: PlayerId; slot?: number };
export type DropPlay = PlayDraft & { target?: string };

/** A field card's permanent position is chosen before its deployment target. */
export function nextPlayStage(card: CardDefinition, legal: LegalActions['playable'][number], draft: PlayDraft, placement = false): 'consume' | 'position' | 'target' | 'none' {
  if(legal.consumes.length&&!draft.consume)return 'consume';
  if(card.type!=='spell'&&draft.slot===undefined)return 'position';
  if(legal.requiresTarget&&!draft.target)return 'target';
  // A spell that places a card (Raise) picks its card from the pile first, then the position.
  return placement&&draft.slot===undefined?'position':'none';
}

// UI gestures use the engine's projected legal actions; they never invent legality.
export function resolveDrop(view: PlayerView, viewer: PlayerId, registry: Registry, cardId: string, zone: DropZone | null): DropPlay | null {
  const card = view.cards[cardId], legal = view.legal.playable.find(a => a.cardId === cardId);
  if (!zone || !card || card.zone !== 'hand' || !legal) return null;
  const definition = registry.cards[card.definitionId];
  const occupant = zone.slot === undefined ? zone.player : view.players[zone.player].board[zone.slot];
  if (definition.type === 'spell') {
    if (definition.cast?.some(b => registry.abilities[b.id].placement)) {
      if (zone.player !== viewer) return null;
      if (zone.slot === undefined) return { cardId };
      return !occupant && legal.slots.includes(zone.slot) ? { cardId, slot: zone.slot } : null;
    }
    if (legal.requiresTarget) return occupant && legal.targets.includes(occupant) ? { cardId, target: occupant } : null;
    return zone.player === viewer ? { cardId } : null;
  }
  if (zone.player !== viewer || zone.slot === undefined) return null;
  if (legal.consumes.length) {
    // Dropping onto a friendly creature explicitly pays Consume and reuses its slot.
    return occupant && legal.consumes.includes(occupant) ? { cardId, slot: zone.slot, consume: occupant } : null;
  }
  return !occupant && legal.slots.includes(zone.slot) ? { cardId, slot: zone.slot } : null;
}

/** Dragging a ready attacker onto an enemy-row position targets that lane, if the engine lists it and no other attacker has it. */
export function resolveLaneDrop(view: PlayerView, viewer: PlayerId, cardId: string, zone: DropZone | null, attackers: string[], lanes: Record<string, number>): number | null {
  const reachable = view.legal.lanes[cardId];
  if (!zone || zone.slot === undefined || zone.player === viewer || !reachable?.includes(zone.slot)) return null;
  return attackers.some(id => id !== cardId && lanes[id] === zone.slot) ? null : zone.slot;
}
