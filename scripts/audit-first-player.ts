import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { compileContent, defaultDeckId, registry as authored, starterDefinitions } from '../packages/content/src';
import { apply, assertInvariants, createMatch, decisionPlayer, other, replay, validateDeck } from '../packages/core/src';
import { botCommand } from '../packages/core/src/bot';
import type { CommandEnvelope, PlayerId, Registry } from '../packages/contracts/src';

// Seat reversal preserves both shuffled libraries and opening hands. Only the
// initial active player changes; whoever starts still skips the first draw.
const args=process.argv.slice(2);
const option=(name:string,fallback:string)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
const pairs=Number(option('--pairs','500'));
const variant=option('--variant','baseline');
const output=option('--out',`docs/first-player-${variant}.json`);
if(!Number.isInteger(pairs)||pairs<2)throw Error('--pairs must be an integer of at least 2.');
const deck=starterDefinitions.find(d=>d.id===option('--deck',defaultDeckId));
if(!deck)throw Error('Unknown starter deck.');
const errors=validateDeck(deck.cards,authored);if(errors.length)throw Error(errors.join(' '));

// Experimental variants stay in memory: authored assets and decks are untouched.
function variantRegistry():Registry {
  if(variant==='baseline')return authored;
  const cards=structuredClone(Object.values(authored.cards));
  if(variant==='sturdier-producers') {
    for(const card of cards)if(card.type==='creature'&&card.cost.generic===0&&Object.values(card.cost.factions).every(n=>n===0))card.stats!.defense++;
  } else if(variant==='less-banner-attack') {
    for(const card of cards)card.abilities=card.abilities.flatMap(binding=>{
      if(binding.id!=='war-banner')return [binding];
      const amount=Number(binding.params.amount)-1;
      return amount>0?[{...binding,params:{...binding.params,amount}}]:[];
    });
  } else if(variant==='more-producer-energy') {
    for(const card of cards)if(card.type==='creature'&&card.cost.generic===0&&Object.values(card.cost.factions).every(n=>n===0))
      for(const pool of card.stats!.energyOutputs)for(const color of Object.keys(pool))if(pool[color]>0)pool[color]++;
  } else throw Error(`Unknown variant ${variant}`);
  return compileContent(cards);
}
const registry=variantRegistry();
function seedFor(sample:number) {
  let seed=(sample+0x9e3779b9)>>>0;
  seed=Math.imul(seed^(seed>>>16),0x85ebca6b);seed=Math.imul(seed^(seed>>>13),0xc2b2ae35);
  return (seed^(seed>>>16))>>>0;
}
const free=(id:string)=>{const card=registry.cards[id];return card.type==='creature'&&card.cost.generic===0&&Object.values(card.cost.factions).every(n=>n===0);};
const cardPlays:Record<string,{plays:number;inWinningGames:number}>={};
const cardCasts:Record<string,number>={};
let producerDeaths=0,producerDeathsBeforeChannel=0,channelActions=0,energyGenerated=0,firstDamageWins=0,firstDamageGames=0;
function run(seed:number,first:PlayerId) {
  const initial=createMatch(registry,[deck!.cards,deck!.cards],seed);
  initial.active=first;
  initial.events.find(event=>event.type==='turn.started')!.message=`${initial.players[first].name} begins. First draw phase is skipped.`;
  assertInvariants(initial);
  const openingFree=Object.fromEntries((['p1','p2'] as const).map(p=>[p,initial.players[p].hand.filter(id=>free(initial.cards[id].definitionId)).length])) as Record<PlayerId,number>;
  let state=initial,firstDamage:PlayerId|undefined;
  const commands:CommandEnvelope[]=[],channeled=new Set<string>(),played:{player:PlayerId;definitionId:string}[]=[];
  const deployed=new Set<string>();
  let firstCavalry:PlayerId|undefined;
  for(let move=0;move<1600&&!state.outcome;move++) {
    const actor=decisionPlayer(state),command=botCommand(state,registry);
    const envelope={actor,expectedRevision:state.revision,command};
    const result=apply(state,envelope,registry);
    if(result.error)throw Error(`${variant}, seed ${seed}, first ${first}, move ${move}: ${result.error}`);
    if(command.type==='energy') {
      channeled.add(command.cardId);channelActions++;
      energyGenerated+=Object.values(registry.cards[state.cards[command.cardId].definitionId].stats!.energyOutputs[command.option]).reduce((sum,n)=>sum+n,0);
    }
    if(command.type==='play') {
      const definitionId=state.cards[command.cardId].definitionId;
      played.push({player:actor,definitionId});
      if(registry.cards[definitionId].type==='creature')deployed.add(command.cardId);
      if(definitionId==='ban-vale-cavalry'&&!firstCavalry)firstCavalry=actor;
      if(registry.cards[definitionId].type==='spell')cardCasts[definitionId]=(cardCasts[definitionId]??0)+1;
    }
    for(const event of result.events) {
      if(!firstDamage&&event.type==='damage.dealt'&&(event.target==='p1'||event.target==='p2')&&(event.amount??0)>0)firstDamage=other(event.target);
      if(event.type==='creature.destroyed'&&event.cardId&&deployed.has(event.cardId)) {
        producerDeaths++;
        if(!channeled.has(event.cardId))producerDeathsBeforeChannel++;
      }
    }
    state=result.state;commands.push(envelope);assertInvariants(state);
  }
  if(!state.outcome)throw Error(`Unfinished seed ${seed}, first ${first}`);
  // Verify both seat orders for regular samples against the unchanged engine.
  if(seedFor(0)===seed||seedFor(1)===seed||seed%25===0)
    if(JSON.stringify(replay(initial,commands,registry))!==JSON.stringify(state))throw Error(`Replay diverged: ${seed}/${first}`);
  for(const play of played) {
    const counts=cardPlays[play.definitionId]??={plays:0,inWinningGames:0};
    counts.plays++;if(play.player===state.outcome)counts.inWinningGames++;
  }
  if(firstDamage){firstDamageGames++;if(firstDamage===state.outcome)firstDamageWins++;}
  return {seed,first,winner:state.outcome,reason:state.outcomeReason,turns:state.turn,moves:commands.length,openingFree,
    firstDamage,firstCavalry,firstLife:state.players[first].life,secondLife:state.players[other(first)].life};
}
const started=performance.now();
const games:ReturnType<typeof run>[]=[];
for(let sample=0;sample<pairs;sample++) {
  const seed=seedFor(sample);games.push(run(seed,'p1'),run(seed,'p2'));
  if((sample+1)%25===0)console.log(`${variant}: ${sample+1}/${pairs} pairs (${Math.round((performance.now()-started)/1000)}s)`);
}
const firstWins=games.filter(g=>g.winner===g.first).length,secondWins=games.filter(g=>g.winner===other(g.first)).length;
const pairScores=Array.from({length:pairs},(_,i)=>games.slice(i*2,i*2+2).reduce((sum,g)=>sum+(g.winner==='draw'?.5:g.winner===g.first?1:0),0)/2);
const mean=pairScores.reduce((sum,n)=>sum+n,0)/pairs;
const variance=pairScores.reduce((sum,n)=>sum+(n-mean)**2,0)/(pairs-1);
const margin=1.96*Math.sqrt(variance/pairs);
const quantile=(values:number[],fraction:number)=>[...values].sort((a,b)=>a-b)[Math.floor((values.length-1)*fraction)];
const average=(values:number[])=>values.reduce((sum,n)=>sum+n,0)/values.length;
function subgroup(group:typeof games) {return {games:group.length,firstWins:group.filter(g=>g.winner===g.first).length,secondWins:group.filter(g=>g.winner===other(g.first)).length};}
const summary={variant,deck:deck.name,deckSize:deck.cards.length,pairs,games:games.length,firstWins,secondWins,draws:games.length-firstWins-secondWins,
  firstWinPercent:firstWins/games.length*100,paired95PercentInterval:[Math.max(0,mean-margin)*100,Math.min(1,mean+margin)*100],
  pairsFirstWinsBoth:pairScores.filter(n=>n===1).length,pairsSecondWinsBoth:pairScores.filter(n=>n===0).length,
  pairsSplit:pairScores.filter(n=>n===.5).length,
  lifeEndings:games.filter(g=>g.reason==='life').length,libraryEndings:games.filter(g=>g.reason==='empty-library').length,
  averageTurns:average(games.map(g=>g.turns)),medianTurns:quantile(games.map(g=>g.turns),.5),p10Turns:quantile(games.map(g=>g.turns),.1),p90Turns:quantile(games.map(g=>g.turns),.9),
  endingByTurn6:games.filter(g=>g.turns<=6).length,endingByTurn10:games.filter(g=>g.turns<=10).length,
  bothOpenFree:subgroup(games.filter(g=>g.openingFree.p1>0&&g.openingFree.p2>0)),
  neitherOpensFree:subgroup(games.filter(g=>g.openingFree.p1===0&&g.openingFree.p2===0)),
  onlyFirstOpensFree:subgroup(games.filter(g=>g.openingFree[g.first]>0&&g.openingFree[other(g.first)]===0)),
  onlySecondOpensFree:subgroup(games.filter(g=>g.openingFree[g.first]===0&&g.openingFree[other(g.first)]>0)),
  firstDamageGames,firstDamageWins,firstDamageWinPercent:firstDamageWins/firstDamageGames*100,
  firstCavalryGames:games.filter(g=>g.firstCavalry).length,firstCavalryWins:games.filter(g=>g.firstCavalry===g.winner).length,
  channelActions,energyGenerated,producerDeaths,producerDeathsBeforeChannel,cardPlays,cardCasts,elapsedSeconds:(performance.now()-started)/1000};
await mkdir(dirname(output),{recursive:true});
await writeFile(output,JSON.stringify({summary,method:'Same seeded mirror, both initial active-player orders; 95% interval clustered by paired seed. Turns are individual player turns, not full rounds.',contentVersion:registry.version,rulesVersion:createMatch(registry,[deck.cards,deck.cards],1).rulesVersion,deck,cards:Object.values(registry.cards),games},null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
