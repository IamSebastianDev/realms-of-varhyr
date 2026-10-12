import { describe, expect, it } from 'vitest';
import type { Command, GameState, Registry } from '../packages/contracts/src';
import { registry as live } from '../packages/content/src';
import { apply, createMatch, decisionPlayer, projectForPlayer, RULES_VERSION } from '../packages/core/src';
import { botCommand } from '../packages/core/src/bot';
import { MatchAuthority } from '../packages/multiplayer/src/authority';
import { NETWORK_VERSION, parseClientMessage, parseHostMessage, presentationState, type Hello, type MatchAction } from '../packages/multiplayer/src/protocol';

// Fixed mechanics independent of authored decks: ten free producers, three copies each.
const base=Object.values(live.cards).find(card=>card.type==='creature')!;
const cards=Object.fromEntries(Array.from({length:10},(_,i)=>{const id=`unit-${i}`;return [id,{...base,id,deckLimitKey:id,name:id,legendary:false,rarity:'common' as const,abilities:[],cost:{generic:0,factions:{}},stats:{attack:1,defense:3,energyOutputs:[{crownlands:1}]}}];}));
const content:Registry={...live,version:'network-test-content',cards};
const deck={name:'Test deck',cards:Object.keys(cards).flatMap(id=>[id,id,id])};
const authority=(seed=731)=>new MatchAuthority(content,'test-match',[deck,deck],['Host','Guest'],seed);
const action=(id:string,revision:number,command:Command):MatchAction=>({id,revision,intent:{kind:'command',command}});
function initial(seed=731){const state=createMatch(content,[deck.cards,deck.cards],seed,{mulligan:true});state.players.p1.name='Host';state.players.p2.name='Guest';return state;}
function advance(room:MatchAuthority,state:GameState,id:string,command=botCommand(state,content)){
  const seat=decisionPlayer(state),envelope={actor:seat,expectedRevision:state.revision,command,clientActionId:id};
  const next=apply(state,envelope,content);expect(next.error).toBeUndefined();
  const response=room.act(seat,action(id,room.snapshot(seat).view.revision,command));expect(response.error).toBeUndefined();
  return next.state;
}

describe('WebRTC match authority and protocol',()=>{
  it('sends only each player’s projection, with no deck identities, shuffle seed or RNG',()=>{
    const room=authority(),full=initial();
    for(const seat of ['p1','p2'] as const){
      const snapshot=room.snapshot(seat),serialized=JSON.stringify(snapshot);
      expect(snapshot.view).toEqual(projectForPlayer(full,seat,content));
      expect(parseHostMessage(JSON.parse(serialized))).toEqual(snapshot);
      const enemy=seat==='p1'?'p2':'p1';
      for(const id of [...full.players.p1.deck,...full.players.p2.deck,...full.players[enemy].hand])expect(serialized).not.toContain(`"${id}"`);
      expect(snapshot.view.cards).toEqual(Object.fromEntries(full.players[seat].hand.map(id=>[id,full.cards[id]])));
      expect(serialized).not.toContain('"seed"');expect(serialized).not.toContain('"rng"');
      expect(snapshot.view.pending?.player).toBe(seat==='p1'?'p1':undefined);
      const presentation=presentationState(snapshot);
      expect(presentation.players[enemy].hand).toEqual([]);
      expect(presentation.players[seat].deck).toHaveLength(25);
      expect(presentation.rng).toBe(0);expect(presentation.seed).toBe(0);
    }
  });
  it('binds actors to their connection, rejects stale revisions and leaves the board unchanged',()=>{
    const room=authority(),before=room.snapshot('p1');
    const rejected=room.act('p2',action('impersonated',0,{type:'mulligan',cardIds:[]}));
    expect(rejected.error).toContain('decision');expect(room.snapshot('p1')).toEqual(before);
    room.act('p1',action('keep-host',0,{type:'mulligan',cardIds:[]}));
    const current=room.snapshot('p2');
    expect(room.act('p2',action('stale',0,{type:'mulligan',cardIds:[]})).error).toContain('advanced');
    expect(room.snapshot('p2')).toEqual(current);
  });
  it('deduplicates retries across reconnects and rejects reusing an action ID for a different move',()=>{
    const room=authority(),keep=action('keep',0,{type:'mulligan',cardIds:[]});
    expect(room.act('p1',keep).view.revision).toBe(1);
    expect(room.act('p1',keep).view.revision).toBe(1);
    room.act('p2',action('guest-keep',1,{type:'mulligan',cardIds:[]}));
    const retried=room.act('p1',keep);
    expect(retried.ack).toBe('keep');expect(retried.view.revision).toBe(2);
    expect(room.act('p1',action('keep',2,{type:'end'})).error).toContain('different move');
    expect(room.snapshot('p1').view.revision).toBe(2);
  });
  it('supports channel undo with a monotonically increasing wire revision',()=>{
    const room=authority();let state=initial();
    for(let i=0;i<80;i++){
      if(decisionPlayer(state)==='p1'&&room.snapshot('p1').view.legal.energy.length)break;
      state=advance(room,state,`setup-${i}`);
    }
    const before=room.snapshot('p1'),id=before.view.legal.energy[0].cardId;
    const generated=room.act('p1',action('channel',before.view.revision,{type:'energy',cardId:id,option:0}));
    expect(generated.error).toBeUndefined();expect(generated.undoable).toContain(id);
    const undone=room.act('p1',{id:'undo',revision:generated.view.revision,intent:{kind:'undo-channel',cardId:id}});
    expect(undone.error).toBeUndefined();expect(undone.view.revision).toBe(before.view.revision+2);
    expect(undone.view.cards[id].exhausted).toBe(false);
    expect(undone.view.players.p1.energy).toEqual(before.view.players.p1.energy);
    expect(room.act('p1',action('old-revision',before.view.revision,{type:'end'})).error).toContain('advanced');
  });
  it('rejects incompatible rules, content and invalid deck compositions before creating a match',()=>{
    const hello:Hello={type:'hello',version:NETWORK_VERSION,rules:RULES_VERSION,content:content.version,token:'guest-token',name:'Guest',deck};
    expect(()=>MatchAuthority.validateHello(hello,content)).not.toThrow();
    for(const update of [{version:0},{rules:'old'},{content:'other'}])expect(()=>MatchAuthority.validateHello({...hello,...update},content)).toThrow('same game build');
    expect(()=>MatchAuthority.validateHello({...hello,deck:{...deck,cards:['missing']}},content)).toThrow('Unknown card');
    expect(()=>MatchAuthority.validateHello({...hello,deck:{...deck,cards:Array(30).fill('unit-0')}},content)).toThrow('Too many');
  });
  it('validates wire payloads and strips client-supplied actor fields',()=>{
    const parsed=parseClientMessage({type:'action',actor:'p1',action:{...action('go',0,{type:'end'}),actor:'p1'}});
    expect(parsed).toEqual({type:'action',action:action('go',0,{type:'end'})});
    for(const command of [{type:'block'},{type:'play',cardId:123},{type:'energy',cardId:'x',option:-1}])expect(()=>parseClientMessage({type:'action',action:{id:'bad',revision:0,intent:{kind:'command',command}}})).toThrow();
    expect(()=>parseClientMessage({type:'action',action:{...action('x',0,{type:'end'}),revision:-1}})).toThrow();
    const snapshot=authority().snapshot('p1');
    expect(()=>parseHostMessage({...snapshot,view:{...snapshot.view,players:{...snapshot.view.players,p1:{...snapshot.view.players.p1,deckCount:Infinity}}}})).toThrow();
    expect(()=>parseHostMessage({...snapshot,version:0})).toThrow();
  });
  it('finishes three complete matches through serialized commands and projections',()=>{
    for(const seed of [1,2,3]){
      const room=authority(seed);let state=initial(seed),moves=0;
      while(!state.outcome&&moves<1200){
        const seat=decisionPlayer(state),command=botCommand(state,content);
        const parsed=parseClientMessage(JSON.parse(JSON.stringify({type:'action',action:action(`move-${moves}`,room.snapshot(seat).view.revision,command)})));
        if(parsed.type!=='action')throw new Error('Expected action');
        const result=room.act(seat,parsed.action);expect(result.error).toBeUndefined();
        const engine=apply(state,{actor:seat,expectedRevision:state.revision,command},content);expect(engine.error).toBeUndefined();state=engine.state;
        for(const player of ['p1','p2'] as const){
          const snapshot=parseHostMessage(JSON.parse(JSON.stringify(room.snapshot(player))));
          if(snapshot.type!=='snapshot')throw new Error('Expected snapshot');
          expect(snapshot.view).toEqual(projectForPlayer(state,player,content));
        }
        moves++;
      }
      expect(state.outcome).not.toBeNull();expect(moves).toBeLessThan(1200);
      expect(room.snapshot('p1').view.outcome).toBe(room.snapshot('p2').view.outcome);
    }
  });
});
