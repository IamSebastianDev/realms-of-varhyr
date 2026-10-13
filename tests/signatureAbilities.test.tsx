import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { registry, starterDefinitions, compileContent, factionDefinitions } from '../packages/content/src';
import { apply, assertInvariants, createMatch, effectiveStats, legalActions, projectForPlayer, replay } from '../packages/core/src';
import type { BattlefieldState, Command, GameState, PlayerId } from '../packages/contracts/src';
import { botCommand } from '../packages/core/src/bot';
import { NETWORK_VERSION, parseClientMessage, parseHostMessage } from '../packages/multiplayer/src/protocol';
import { CardFacts } from '../apps/web/src/CardPresentation';

const deck = starterDefinitions.find(d => d.id === 'crown')!.cards;
function setup() { return createMatch(registry, [deck, deck], 731); }
function place(state: GameState, definitionId: string, side: PlayerId = 'p1', slot?: number) {
  const p = state.players[side], id = p.deck.pop()!;
  Object.assign(state.cards[id], { definitionId, zone: slot === undefined ? 'hand' : 'board', slot: slot ?? null, exhausted: false });
  if (slot === undefined) p.hand.push(id); else p.board[slot] = id;
  return id;
}
function step(state: GameState, command: Command) {
  const result = apply(state, { actor: state.active, expectedRevision: state.revision, command }, registry);
  expect(result.error).toBeUndefined(); assertInvariants(result.state); return result.state;
}

describe('faction signature authoring', () => {
  it.each(factionDefinitions)('$name reserves its keyword for its own cards, including cards shared with another faction', faction => {
    const id = faction.signatureAbility!, ability = registry.abilities[id];
    const params = {};
    const other = faction.id === 'crownlands' ? 'winter-league' : 'crownlands';
    const card = { ...registry.cards['crown-recruit'], factions: [faction.id], abilities: [{ id, params }] };
    expect(() => compileContent([card])).not.toThrow();
    expect(() => compileContent([{ ...card, factions: [other] }])).toThrow(`Ability ${id} belongs to ${faction.id}`);
    if (faction.id !== 'neutral') expect(() => compileContent([{ ...card, factions: [faction.id, other] }])).not.toThrow();
  });
  it('gives continuous abilities only the public battlefield, excluding hands and libraries', () => {
    const state = setup(), unit = place(state, 'crown-recruit', 'p1', 2);
    let seen: BattlefieldState | undefined;
    const content = { ...registry, cards: { ...registry.cards, 'crown-recruit': { ...registry.cards['crown-recruit'], abilities: [{id:'context-test',params:{}}] } },
      abilities: { ...registry.abilities, 'context-test': {id:'context-test',version:1,name:'Context test',description:'Test only.',validate:()=>{},
        static: (_source: unknown, _target: unknown, _params: unknown, _registry: unknown, battlefield?: BattlefieldState) => { seen = battlefield; return {}; } } } };
    effectiveStats(state, unit, content);
    expect(Object.keys(seen!.cards)).toEqual([unit]);
    expect(Object.keys(seen!.players.p1)).toEqual(['board']);
    expect(Object.keys(seen!)).toEqual(['cards','players']);
  });
  it('registers nine faction-exclusive keywords and renders their ordinary rules without signature labels', () => {
    expect(new Set(factionDefinitions.map(f => f.signatureAbility)).size).toBe(9);
    for (const faction of factionDefinitions) {
      const ability = registry.abilities[faction.signatureAbility!];
      expect(ability.translations?.de?.description).toBeTruthy();
      expect(ability.faction).toBe(faction.id);
      const leader = Object.values(registry.cards).find(card => card.subtypes.includes('leader') &&
        (faction.id === 'neutral' ? !card.factions.length : card.factions.includes(faction.id)))!;
      expect(leader.abilities.some(binding => binding.id === faction.signatureAbility)).toBe(true);
      const html = renderToStaticMarkup(<CardFacts card={leader}/>);
      expect(html).not.toContain('Faction signature');
      expect(html).not.toContain('signature-ability');
      expect(leader.abilities.find(binding => binding.id === ability.id)?.params).toEqual({});
      expect(ability.name).not.toMatch(/\d|\{/);
      expect(ability.translations!.de!.name).not.toMatch(/\d|\{/);
      expect(ability.description).not.toContain('{amount}');
      expect(ability.translations!.de!.description).not.toContain('{amount}');
      expect(html).toContain(`<dt>${ability.name}</dt>`);
    }
  });
  it.each(['fealty','accord','marches-rally','trade','sanctuary','scorch','raid','soul-harvest','wayfarer'])('rejects malformed %s bindings before a match can start', id => {
    const card = { ...registry.cards['crown-recruit'], factions: [registry.abilities[id].faction!] };
    expect(() => compileContent([{ ...card, abilities: [{ id, params: {} }] }])).not.toThrow();
    for (const params of [{amount:0}, {amount:1}, {amount:2}, {typo:true}, null, 1, "unexpected"])
      expect(() => compileContent([{...card,abilities:[{id,params}]}])).toThrow();
  });
});

describe('Crownlands Fealty', () => {
  it.each(['p1', 'p2'] as const)('buffs every friendly creature including self, regardless of cost or distance, for %s', side => {
    const state = setup(), enemy = side === 'p1' ? 'p2' : 'p1';
    const leader = place(state, 'aldric-runewarden', side, 2);
    state.cards[leader].exhausted = true;
    const ally = place(state, 'morie-grandmistress', side, 1);
    const distant = place(state, 'crown-recruit', side, 4), opposing = place(state, 'crown-recruit', enemy, 1);
    const bastion = place(state, 'crown-bastion', side, 3), hand = place(state, 'crown-recruit', side);
    expect(effectiveStats(state, ally, registry)).toEqual({ attack: 3, defense: 7 }); // Fealty plus the bastion's banner.
    expect(effectiveStats(state, distant, registry)).toEqual({ attack: 3, defense: 3 });
    expect(effectiveStats(state, opposing, registry)).toEqual({ attack: 1, defense: 2 });
    expect(effectiveStats(state, leader, registry)).toEqual({ attack: 5, defense: 6 });
    expect(effectiveStats(state, bastion, registry)).toEqual({ attack: 1, defense: 4 });
    // Remove the unrelated banner to isolate Fealty's hand exclusion and disappearance.
    state.players[side].board[3] = null; state.cards[bastion].zone = 'discard'; state.players[side].discard.push(bastion); state.cards[bastion].slot = null;
    expect(effectiveStats(state, hand, registry)).toEqual({attack:1,defense:2});
    expect(effectiveStats(projectForPlayer(state, side, registry), ally, registry)).toEqual(effectiveStats(state, ally, registry));
    state.players[side].board[2] = null; state.cards[leader].zone = 'discard'; state.players[side].discard.push(leader); state.cards[leader].slot = null;
    expect(effectiveStats(state, distant, registry)).toEqual({attack:1,defense:2});
  });
  it('buffs a more expensive creature and multiple sources stack', () => {
    const expensive = { ...registry.cards['crown-recruit'], id:'high-rank-test', deckLimitKey:'high-rank-test', cost:{generic:3,factions:{crownlands:2}} };
    const content = compileContent([...Object.values(registry.cards), expensive]);
    const state = setup(); place(state, 'aldric-runewarden', 'p1', 0); place(state, 'aldric-runewarden', 'p1', 1);
    const unit = place(state, expensive.id, 'p1', 4);
    expect(effectiveStats(state, unit, content)).toEqual({attack:3,defense:4});
  });
});

describe('League of Winter Accord', () => {
  function passTurn(state: GameState) {
    let next = state;
    next = step(next, { type:'end' });
    next = step(next, { type:'attack', attackers:[] });
    next = step(next, { type:'end' });
    if (next.pending?.kind === 'draw') next = step(next, {type:'choose',choiceId:next.pending.id,option:next.pending.options[0],other:'bottom'});
    return next;
  }
  it.each(['p1','p2'] as const)('gains Winter energy once per turn for %s, even while exhausted, and replays deterministically', side => {
    const state = setup(); state.active = side;
    const enemy = side === 'p1' ? 'p2' : 'p1', morie = place(state,'morie-grandmistress',side,2);
    state.cards[morie].exhausted = true;
    const first = place(state,'cleansing-light',side), second = place(state,'cleansing-light',side);
    state.players[side].energy = {crownlands:2,neutral:2};
    const envelope = {actor:side,expectedRevision:state.revision,command:{type:'play' as const,cardId:first,target:enemy}};
    const cast = step(state,envelope.command);
    expect(cast.players[side].energy['winter-league']).toBe(1);
    expect(cast.cards[morie].exhausted).toBe(true);
    expect(replay(state,[envelope],registry)).toEqual(cast);
    const twice = step(cast,{type:'play',cardId:second,target:enemy});
    expect(twice.players[side].energy['winter-league']).toBe(1);
    expect(twice.events.filter(event => event.type === 'energy.generated' && event.cardId === morie)).toHaveLength(1);
    const anotherTurn = passTurn(passTurn(twice));
    expect(anotherTurn.active).toBe(side); expect(anotherTurn.phase).toBe('play');
    const spell = place(anotherTurn,'cleansing-light',side); anotherTurn.players[side].energy={crownlands:1,neutral:1};
    expect(step(anotherTurn,{type:'play',cardId:spell,target:enemy}).players[side].energy['winter-league']).toBe(1);
  });
  it('counts spells cast before Morie enters and does not refund another spell on her arrival', () => {
    const state = setup(), first = place(state,'cleansing-light'), morie = place(state,'morie-grandmistress'), second = place(state,'cleansing-light');
    state.players.p1.energy={crownlands:2,neutral:4,'winter-league':2};
    const cast = step(state,{type:'play',cardId:first,target:'p2'});
    const deployed = step(cast,{type:'play',cardId:morie,slot:2});
    expect(deployed.players.p1.energy['winter-league']).toBe(0);
    const next = step(deployed,{type:'play',cardId:second,target:'p2'});
    expect(next.players.p1.energy['winter-league']).toBe(0);
  });
  it('ignores enemy casts and defender death-window spells', () => {
    const state = setup(); place(state,'morie-grandmistress','p1',2);
    const enemySpell = place(state,'cleansing-light','p2'); state.active='p2'; state.players.p2.energy={crownlands:1,neutral:1};
    const enemyCast = step(state,{type:'play',cardId:enemySpell,target:'p1'});
    expect(enemyCast.players.p1.energy).toEqual({});
    const deathSpell = {...registry.cards['cleansing-light'],id:'death-accord-test',deckLimitKey:'death-accord-test',timing:['death' as const]};
    const content = compileContent([...Object.values(registry.cards),deathSpell]);
    const death = createMatch(content,[deck,deck],731);
    place(death,'morie-grandmistress','p2',2); const spell = place(death,deathSpell.id,'p2');
    death.phase='attack'; death.combat={stage:'death',attackers:[],lanes:{},blocks:[],dead:[]}; death.players.p2.deathEnergy={crownlands:1,neutral:1};
    const result = apply(death,{actor:'p2',expectedRevision:death.revision,command:{type:'play',cardId:spell,target:'p1'}},content);
    expect(result.error).toBeUndefined();
    expect(result.state.players.p2.energy).toEqual({});
    expect(result.state.players.p2.deathEnergy['winter-league']).toBeUndefined();
  });
});

describe('Bright Marches Rally', () => {
  it.each(['p1','p2'] as const)('deploys any-cost creatures or bastions from %s hand without energy and replays exactly', side => {
    for (const definitionId of ['morie-grandmistress','crown-bastion']) {
      const state = setup(); state.active = side;
      const bosci = place(state,'bosci-lord-of-seacliffe',side,2), target = place(state,definitionId,side);
      const spell = place(state,'cleansing-light',side), enemy = place(state,'crown-recruit',side === 'p1' ? 'p2' : 'p1');
      const action = legalActions(state,registry).activations.find(a => a.cardId === bosci)!;
      expect(action.targets).toContain(target); expect(action.targets).not.toContain(spell); expect(action.targets).not.toContain(enemy);
      expect(action.slots).toEqual([0,1,3,4]);
      const command:Command = {type:'activate',cardId:bosci,ability:action.ability,target,slot:4};
      const envelope = {actor:side,expectedRevision:state.revision,command};
      const next = step(state,command);
      expect(next.players[side].energy).toEqual({}); expect(next.players[side].board[4]).toBe(target);
      expect(next.players[side].hand).not.toContain(target); expect(next.cards[target]).toMatchObject({zone:'board',slot:4,exhausted:true});
      expect(next.cards[bosci].exhausted).toBe(true);
      expect(next.events.filter(e => e.type === 'card.played' && e.cardId === target)).toHaveLength(1);
      expect(replay(state,[envelope],registry)).toEqual(next);
      expect(legalActions(next,registry).activations.some(a => a.cardId === bosci)).toBe(false);
      expect(projectForPlayer(state,side === 'p1' ? 'p2' : 'p1',registry).legal.activations).toEqual([]);
    }
  });
  it('rejects occupied or missing positions, spells, enemy cards and exhausted sources without changing state', () => {
    const state = setup(), bosci = place(state,'bosci-lord-of-seacliffe','p1',2), target = place(state,'morie-grandmistress');
    const spell = place(state,'cleansing-light'), enemy = place(state,'crown-recruit','p2');
    for (const args of [{target,slot:2},{target,slot:5},{target},{target:spell,slot:0},{target:enemy,slot:0}]) {
      const before = structuredClone(state);
      const result = apply(state,{actor:'p1',expectedRevision:state.revision,command:{type:'activate',cardId:bosci,ability:0,...args}},registry);
      expect(result.error).toBeTruthy(); expect(result.state).toEqual(before); expect(state).toEqual(before);
    }
    state.cards[bosci].exhausted = true;
    expect(legalActions(state,registry).activations.some(a=>a.cardId===bosci)).toBe(false);
    state.cards[bosci].exhausted = false; state.phase = 'attack';state.combat={stage:'declare',attackers:[],lanes:{},blocks:[],dead:[]};
    expect(legalActions(state,registry).activations).toEqual([]);
  });
  it('is unavailable with a full board or no field cards in hand', () => {
    const state = setup(), bosci = place(state,'bosci-lord-of-seacliffe','p1',2);
    for(const id of [...state.players.p1.hand]) {state.players.p1.hand=state.players.p1.hand.filter(x=>x!==id);state.players.p1.deck.push(id);state.cards[id].zone='deck';}
    place(state,'cleansing-light');
    expect(legalActions(state,registry).activations.some(a=>a.cardId===bosci)).toBe(false);
    place(state,'crown-recruit');
    for(const slot of [0,1,3,4])place(state,'crown-recruit','p1',slot);
    expect(legalActions(state,registry).activations.some(a=>a.cardId===bosci)).toBe(false);
  });
  it('fires deployment abilities and carries position choices through the online protocol', () => {
    const state = setup(), bosci = place(state,'bosci-lord-of-seacliffe','p1',2), hekata = place(state,'hekata-lady-of-the-fields');
    const enemy = place(state,'crown-recruit','p2',4);
    const command:Command={type:'activate',cardId:bosci,ability:0,target:hekata,slot:4};
    const parsed = parseClientMessage({type:'action',action:{id:'rally',revision:state.revision,intent:{kind:'command',command}}});
    expect(parsed.type==='action'&&parsed.action.intent.kind==='command'&&parsed.action.intent.command).toEqual(command);
    const snapshot = {type:'snapshot',version:NETWORK_VERSION,matchId:'rally-test',seat:'p1',view:projectForPlayer(state,'p1',registry),undoable:[],forecast:null};
    const decoded = parseHostMessage(JSON.parse(JSON.stringify(snapshot)));
    expect(decoded.type==='snapshot'&&decoded.view.legal.activations.find(a=>a.cardId===bosci)?.slots).toEqual([0,1,3,4]);
    const next = step(state,command);
    expect(next.cards[enemy].zone).toBe('discard');
  });
  it('lets the bot evaluate free deployment positions', () => {
    const state = setup();
    // Remove the opening hand so no other play competes with the test.
    for(const id of [...state.players.p1.hand]) {state.players.p1.deck.push(id);state.cards[id].zone='deck';}state.players.p1.hand=[];
    const bosci = place(state,'bosci-lord-of-seacliffe','p1',2), target = place(state,'morie-grandmistress');
    const command = botCommand(state,registry);
    expect(command).toMatchObject({type:'activate',cardId:bosci,ability:0,target});
    if(command.type!=='activate')throw new Error('Expected Rally');
    expect(command.slot).not.toBe(2);expect(step(state,command).cards[target].zone).toBe('board');
  });
});

describe('Mountain Clans Trade', () => {
  it('channels printed Clan energy plus neutral energy once, leaves other producers alone and replays exactly', () => {
    const state = setup(), dwell = place(state, 'dwell-mountain-merchant', 'p1', 2), recruit = place(state, 'crown-recruit', 'p1', 1);
    const envelope = {actor:'p1' as const,expectedRevision:state.revision,command:{type:'energy' as const,cardId:dwell,option:0}};
    const next = step(state, envelope.command);
    expect(next.players.p1.energy).toEqual({'mountain-clans':2,neutral:1});
    expect(next.events.filter(e => e.type === 'energy.generated' && e.cardId === dwell)).toHaveLength(1);
    expect(replay(state,[envelope],registry)).toEqual(next);
    expect(step(next,{type:'energy',cardId:recruit,option:0}).players.p1.energy).toEqual({'mountain-clans':2,neutral:1,crownlands:1});
  });
  it('does not add neutral energy when a defending Trader dies in combat', () => {
    const state = setup(), dwell = place(state, 'dwell-mountain-merchant', 'p2', 2), attacker = place(state, 'brut-chief-of-the-harpies', 'p1', 2);
    state.cards[dwell].damage = 5;
    state.phase = 'attack'; state.combat = {stage:'declare',attackers:[],lanes:{},blocks:[],dead:[]};
    const declared = step(state,{type:'attack',attackers:[attacker]});
    const resolved = step(declared,{type:'confirm-combat'});
    expect(resolved.cards[dwell].zone).toBe('discard');
    expect(resolved.players.p2.deathEnergy).toEqual({'mountain-clans':2});
  });
});

describe('Conclave Sanctuary', () => {
  it('continuously protects adjacent creatures, grants elves a second point and excludes bastions', () => {
    const elf = {...registry.cards['crown-recruit'],id:'elf-test',deckLimitKey:'elf-test',subtypes:['elf','scout']};
    const content = compileContent([...Object.values(registry.cards),elf]);
    const state = setup(), queen = place(state,'ilyria-queen-of-the-elves','p1',2), ally = place(state,'crown-recruit','p1',1), neighbor = place(state,elf.id,'p1',3);
    const distant = place(state,'crown-recruit','p1',4), enemy = place(state,elf.id,'p2',1);
    expect(effectiveStats(state,ally,content).defense).toBe(3);
    expect(effectiveStats(state,neighbor,content).defense).toBe(4);
    expect(effectiveStats(state,distant,content).defense).toBe(2);
    expect(effectiveStats(state,enemy,content).defense).toBe(2);
    expect(effectiveStats(state,queen,content).defense).toBe(4);
    expect(effectiveStats(projectForPlayer(state,'p1',content),ally,content)).toEqual(effectiveStats(state,ally,content));
    state.cards[queen].exhausted = true;
    expect(effectiveStats(state,ally,content).defense).toBe(3);
    expect(effectiveStats(state,neighbor,content).defense).toBe(4);
    state.cards[neighbor].definitionId='crown-bastion';
    expect(effectiveStats(state,neighbor,content).defense).toBe(4);
    state.players.p1.board[2]=null;state.cards[queen].zone='discard';state.cards[queen].slot=null;state.players.p1.discard.push(queen);
    expect(effectiveStats(state,ally,content).defense).toBe(2);
  });
});

describe('Ember Fields Scorch', () => {
  it.each(['crown-recruit','crown-bastion','aldric-runewarden'])('burns only the deployed opposite position, respecting Armor on %s', targetDef => {
    const state = setup(), target = place(state,targetDef,'p2',4), other = place(state,'crown-recruit','p2',2), hekata = place(state,'hekata-lady-of-the-fields');
    state.players.p1.energy = {'ember-fields':2,neutral:2};
    const next = step(state,{type:'play',cardId:hekata,slot:4});
    if (targetDef === 'crown-recruit') expect(next.cards[target].zone).toBe('discard');
    else expect(next.cards[target].damage).toBe(targetDef === 'aldric-runewarden' ? 2 : 3);
    expect(next.events.find(e => e.type === 'damage.dealt' && e.target === target)?.amount).toBe(targetDef === 'aldric-runewarden' ? 2 : 3);
    expect(next.cards[other].damage).toBe(0); expect(next.players.p2.life).toBe(10);
    const unrelated = place(next,'crown-recruit');
    expect(step(next,{type:'play',cardId:unrelated,slot:0}).cards[target].damage).toBe(next.cards[target].damage);
  });
  it('does not redirect an empty deployment lane to a creature or the enemy player', () => {
    const state = setup(), other = place(state,'crown-recruit','p2',2), hekata = place(state,'hekata-lady-of-the-fields');
    state.players.p1.energy = {'ember-fields':2,neutral:2};
    const next = step(state,{type:'play',cardId:hekata,slot:4});
    expect(next.cards[other].damage).toBe(0); expect(next.players.p2.life).toBe(10);
  });
});

describe('Horde Raid', () => {
  it('stacks once per adjacent friendly creature, excluding bastions, distant slots and enemies', () => {
    const state = setup(), brut = place(state,'brut-chief-of-the-harpies','p1',2);
    const bastion = place(state,'tower-of-the-first-morning','p1',1);
    place(state,'crown-recruit','p1',4); place(state,'crown-recruit','p2',3);
    expect(effectiveStats(state,brut,registry).attack).toBe(4);
    state.cards[bastion].definitionId = 'crown-recruit';
    expect(effectiveStats(state,brut,registry).attack).toBe(5);
    place(state,'crown-recruit','p1',3);
    expect(effectiveStats(state,brut,registry).attack).toBe(6);
    expect(effectiveStats(projectForPlayer(state,'p2',registry),brut,registry)).toEqual(effectiveStats(state,brut,registry));
    state.cards[bastion].exhausted = true;
    expect(effectiveStats(state,brut,registry).attack).toBe(6);
  });
});

describe('Neutral Wayfarer', () => {
  it('returns a damaged friendly producer, clears its slot and damage, and exhausts the Wanderer without refunding energy', () => {
    const state = setup(), wanderer = place(state,'the-lonely-wanderer','p1',2), ally = place(state,'crown-recruit','p1',1), enemy = place(state,'crown-recruit','p2',1);
    const bastion = place(state,'crown-bastion','p1',3); state.cards[ally].damage = 1;
    const activation = legalActions(state,registry).activations.find(a => a.cardId === wanderer)!;
    expect(activation.targets).toContain(ally); expect(activation.targets).not.toContain(enemy); expect(activation.targets).not.toContain(bastion);
    const next = step(state,{type:'activate',cardId:wanderer,ability:0,target:ally});
    expect(next.cards[ally].zone).toBe('hand'); expect(next.cards[ally].damage).toBe(0); expect(next.players.p1.board[1]).toBeNull();
    expect(next.cards[wanderer].exhausted).toBe(true); expect(next.players.p1.energy).toEqual({});
    expect(legalActions(next,registry).activations.some(a => a.cardId === wanderer)).toBe(false);
  });
  it('allows returning itself but repaying its cost is required, and excludes combat activation', () => {
    const state = setup(), wanderer = place(state,'the-lonely-wanderer','p1',2);
    const returned = step(state,{type:'activate',cardId:wanderer,ability:0,target:wanderer});
    expect(returned.cards[wanderer].zone).toBe('hand');
    expect(apply(returned,{actor:'p1',expectedRevision:returned.revision,command:{type:'play',cardId:wanderer,slot:2}},registry).error).toBeTruthy();
    returned.players.p1.energy = {neutral:3};
    const played = step(returned,{type:'play',cardId:wanderer,slot:2});
    expect(played.cards[wanderer].exhausted).toBe(true); expect(played.players.p1.energy.neutral).toBe(0);
    const combat = step(state,{type:'end'}); expect(legalActions(combat,registry).activations).toEqual([]);
  });
});
