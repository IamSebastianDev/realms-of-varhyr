import { registry, starterDecks, starterDefinitions } from '../packages/content/src';
import { apply, assertInvariants, createMatch, decisionPlayer, validateDeck } from '../packages/core/src';
import { botCommand } from '../packages/core/src/bot';
// Spread seeds across the 32-bit PRNG input instead of testing only tiny values.
function seedFor(sample:number):number {
  let seed=(sample+0x9e3779b9)>>>0;
  seed=Math.imul(seed^(seed>>>16),0x85ebca6b);seed=Math.imul(seed^(seed>>>13),0xc2b2ae35);
  return (seed^(seed>>>16))>>>0;
}
const playable=starterDefinitions.filter(deck=>!validateDeck(deck.cards,registry).length);
if(!playable.length)console.log('No complete starter decks yet. Finish a 30-card starter before auditing the bot.');
const pairs=playable.flatMap(first=>playable.map(second=>({first:first.id,second:second.id,count:first.id===second.id?50:100})));
for(const {first,second,count} of pairs){
  const report={first,second,games:count,p1Wins:0,p2Wins:0,draws:0,unfinished:0,libraryLosses:0,maxTurns:0,totalTurns:0,maxDecisionMs:0,unfinishedSeeds:[] as number[]};
  for(let sample=1;sample<=count;sample++){
    const seed=seedFor(sample);let state=createMatch(registry,[starterDecks[first],starterDecks[second]],seed,{mulligan:true});
    for(let moves=0;moves<600&&!state.outcome;moves++){
      const start=performance.now(),command=botCommand(state,registry);report.maxDecisionMs=Math.max(report.maxDecisionMs,performance.now()-start);
      const result=apply(state,{actor:decisionPlayer(state),expectedRevision:state.revision,command},registry);
      if(result.error)throw Error(`${first}/${second}/${seed}: ${result.error}`);
      state=result.state;assertInvariants(state);
    }
    if(state.outcome==='p1')report.p1Wins++;else if(state.outcome==='p2')report.p2Wins++;else if(state.outcome==='draw')report.draws++;
    else {report.unfinished++;report.unfinishedSeeds.push(seed);}report.totalTurns+=state.turn;report.maxTurns=Math.max(report.maxTurns,state.turn);if(state.outcomeReason==='empty-library')report.libraryLosses++;
  }
  console.log(JSON.stringify({...report,averageTurns:report.totalTurns/count,maxDecisionMs:Math.round(report.maxDecisionMs)}));
}
