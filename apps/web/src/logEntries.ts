import type { CardInstance, GameEvent, PlayerId } from '../../../packages/contracts/src';

export type LogKind = 'turn' | 'play' | 'spell' | 'attack' | 'block' | 'damage' | 'death' | 'heal' | 'draw' | 'energy' | 'info';
export type LogEntry = { seq: number; kind: LogKind; text: string; player?: PlayerId; names?: string[] };

const kinds: Record<string, LogKind> = {
  'turn.started': 'turn', 'card.played': 'play', 'spell.cast': 'spell', 'ability.activated': 'spell', 'creature.attacked': 'attack',
  'creature.blocked': 'block', 'holding.blocked': 'block', 'damage.dealt': 'damage', 'creature.destroyed': 'death', 'holding.destroyed': 'death',
  'life.restored': 'heal', 'card.returned': 'info', 'card.discarded': 'info', 'card.bottomed': 'info', 'card.drawn': 'draw', 'energy.generated': 'energy',
  'mulligan.replaced': 'info', 'mulligan.kept': 'info', 'game.ended': 'info',
};

/** A readable, chronological match log: bookkeeping events are dropped and repeated energy channels are merged. */
export function battleLog(events: GameEvent[], cards: Record<string, CardInstance>): LogEntry[] {
  const entries: LogEntry[] = [];
  for (const event of events) {
    const kind = kinds[event.type];
    if (!kind) continue;
    const owner = event.player
      ?? (event.type === 'damage.dealt' && (event.target === 'p1' || event.target === 'p2') ? event.target : undefined)
      ?? event.snapshot?.controller ?? (event.cardId ? cards[event.cardId]?.controller : undefined);
    if (kind === 'energy') {
      const name = event.message.replace(/ generates energy\.$/, ''), last = entries[entries.length - 1];
      if (last?.kind === 'energy' && last.player === owner) { last.names!.push(name); last.text = `Channels energy: ${last.names!.join(', ')}`; continue; }
      entries.push({ seq: event.seq, kind, player: owner, names: [name], text: `Channels energy: ${name}` });
      continue;
    }
    const opening = event.type === 'turn.started' && event.message.includes('First draw phase');
    entries.push({ seq: event.seq, kind, player: opening ? 'p1' : owner, text: opening ? 'Turn 1 begins.' : event.message });
  }
  return entries;
}
