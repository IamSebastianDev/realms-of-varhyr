import type { BattlefieldState, CardInstance, GameEvent, GameState, PlayerId, Registry } from '../../../packages/contracts/src';

export type FactionEffectKind = 'fealty' | 'rally' | 'raid' | 'trade' | 'scorch' | 'sanctuary' | 'accord' | 'soul-harvest' | 'wayfarer';
export type FactionEffectSpot = { player: PlayerId; slot: number } | { player: PlayerId; area: 'pool' | 'hand' };
export type FactionEffect = { id: string; kind: FactionEffectKind; source: FactionEffectSpot; from: FactionEffectSpot; to?: FactionEffectSpot };
export type FactionAura = { id: string; kind: 'fealty' | 'sanctuary' | 'raid'; source: { player: PlayerId; slot: number }; buffs: { id: string; spot: { player: PlayerId; slot: number }; attack: number; defense: number }[] };
const kinds: Record<string, FactionEffectKind> = { fealty:'fealty', 'marches-rally':'rally', raid:'raid', trade:'trade', scorch:'scorch', sanctuary:'sanctuary', accord:'accord', 'soul-harvest':'soul-harvest', wayfarer:'wayfarer' };
const boardSpot = (card?: CardInstance) => card?.zone === 'board' && card.slot !== null ? { player:card.controller,slot:card.slot } : undefined;

/** Read the actual static handlers so visuals cannot invent a buff or mistake an exhausted aura for an inactive one. */
export function factionAuras(view: BattlefieldState, registry: Registry): FactionAura[] {
  const board = (['p1','p2'] as const).flatMap(p => view.players[p].board).filter((id): id is string => !!id);
  const battlefield: BattlefieldState = { cards:Object.fromEntries(board.map(id => [id,view.cards[id]])),players:{p1:{board:view.players.p1.board},p2:{board:view.players.p2.board}} };
  return board.flatMap(id => {
    const source = view.cards[id], spot = boardSpot(source);
    if (!spot) return [];
    return registry.cards[source.definitionId].abilities.flatMap((binding,index): FactionAura[] => {
      const kind = kinds[binding.id];
      if (kind !== 'fealty' && kind !== 'sanctuary' && kind !== 'raid') return [];
      const extension = registry.abilities[binding.id];
      const buffs = board.flatMap(target => {
        const card = view.cards[target], spot = boardSpot(card), modifier = extension.static?.(source,card,binding.params,registry,battlefield);
        return spot && modifier && ((modifier.attack ?? 0) > 0 || (modifier.defense ?? 0) > 0) ? [{id:target,spot,attack:modifier.attack??0,defense:modifier.defense??0}] : [];
      });
      return [{id:`${id}-${index}`,kind,source:spot,buffs}];
    });
  });
}

/** Accepted event attribution only: no message parsing, RNG, commands, or hidden hand/library inspection. */
export function factionBursts(before: Pick<GameState,'cards'>, after: Pick<GameState,'cards'>, events: GameEvent[], registry: Registry, key: string): FactionEffect[] {
  const snapshots = Object.fromEntries(events.filter(e=>e.snapshot&&e.cardId).map(e=>[e.cardId!,e.snapshot!]));
  const spot = (id?: string) => id ? boardSpot(before.cards[id]) ?? boardSpot(after.cards[id]) ?? boardSpot(snapshots[id]) : undefined;
  const attributed = events.flatMap(event => [event,...(event.effects ?? []).map((effect,index)=>({...event,...effect,type:'ability.triggered',seq:event.seq,idSuffix:index+1}))]);
  return attributed.flatMap((event): FactionEffect[] => {
    let ability = event.abilityId;
    if (event.type === 'energy.generated' && event.amount === undefined && event.cardId && events.some(e=>e.type==='creature.exhausted'&&e.cardId===event.cardId) && registry.cards[(after.cards[event.cardId]??before.cards[event.cardId])?.definitionId]?.abilities.some(a=>a.id==='trade')) ability='trade';
    if (!ability || !['ability.activated','ability.triggered','energy.generated'].includes(event.type)) return [];
    const kind = kinds[ability], source = spot(event.cardId);
    if (!kind || !source || kind==='fealty' || kind==='sanctuary' || kind==='raid') return [];
    const target = spot(event.target);
    if (kind==='scorch' && !target) return [];
    const to: FactionEffectSpot | undefined = kind==='accord'||kind==='trade' ? {player:source.player,area:'pool'}
      : kind==='soul-harvest' ? source : kind==='wayfarer' ? {player:(event.target ? after.cards[event.target]?.owner ?? before.cards[event.target]?.owner : undefined) ?? source.player,area:'hand'} : target;
    const from = kind==='soul-harvest' ? target ?? source : kind==='wayfarer' ? target ?? source : source;
    return [{id:`${key}-${event.seq}-${kind}-${'idSuffix' in event ? event.idSuffix : 0}`,kind,source,from,to}];
  });
}
