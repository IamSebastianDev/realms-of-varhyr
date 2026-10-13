import type { Command, GameState, PlayerId, Pool, Registry } from '../../contracts/src';
import { energyProductionOptions } from './production';
import { apply, autoPayment, blockerFor, combatDamage, decisionPlayer, effectiveStats, legalActions, other, previewDamage } from './index';

type EnergyPlan = { pool: Pool; commands: Command[]; penalty: number };
const add = (a: Pool, b: Pool): Pool => {
  const pool = {...a};
  for (const key of Object.keys(b) as (keyof Pool)[]) pool[key] = (pool[key] ?? 0) + (b[key] ?? 0);
  return pool;
};
function creatureValue(state: GameState, id: string, registry: Registry): number {
  const def = registry.cards[state.cards[id].definitionId], stats = effectiveStats(state,id,registry);
  const outputs=energyProductionOptions(def,registry);
  return stats.attack * (def.type==='bastion' ? 1 : 2) + (stats.defense - state.cards[id].damage * .7) * .65 + Math.max(...(outputs.length ? outputs : [{}]).map(p => Object.values(p).reduce((a,b) => a+b,0))) * .6
    + def.abilities.reduce((n,a) => n + (a.id === 'armor' ? Number(a.params.amount) : ['collector','deathbound'].includes(a.id) ? 1 : 0),0);
}
function colorsOnBoard(state: GameState, actor: PlayerId, registry: Registry, removed: string[] = []): Set<string> {
  return new Set(state.players[actor].board.flatMap(id => id && !removed.includes(id)
    ? registry.cards[state.cards[id].definitionId].stats!.energyOutputs.flatMap(pool => Object.keys(pool).filter(color => color !== 'neutral')) : []));
}
function positionValue(state: GameState, actor: PlayerId, registry: Registry): number {
  if (state.outcome) return state.outcome === actor ? 10000 : state.outcome === 'draw' ? 0 : -10000;
  const value = (p: PlayerId) => state.players[p].life * 1.8 + state.players[p].hand.length * .6 + colorsOnBoard(state,p,registry).size * 4
    + state.players[p].board.reduce((n,id) => n + (id ? creatureValue(state,id,registry) : 0),0);
  return value(actor) - value(other(actor));
}
function tryCommand(state: GameState, command: Command, registry: Registry): GameState | null {
  const result = apply(state,{actor:decisionPlayer(state),expectedRevision:state.revision,command},registry);
  return result.error ? null : result.state;
}
// At most five producers: enumerate output combinations, never permutations. This
// uses only public board information and our own hand, not the opponent's hand.
function energyPlans(state: GameState, registry: Registry): EnergyPlan[] {
  const actor = decisionPlayer(state), death = state.phase !== 'play';
  let plans: EnergyPlan[] = [{pool:death ? state.players[actor].deathEnergy : state.players[actor].energy,commands:[],penalty:0}];
  const legal=legalActions(state,registry),producers=new Map<string,{command:Command;output:Pool}[]>();
  for(const source of legal.energy)producers.set(source.cardId,source.options.map((output,option)=>({output,command:{type:'energy',cardId:source.cardId,option}})));
  for(const action of legal.activations)if(action.energyOptions){
    const options=action.energyOptions.map(output=>({output,command:{type:'activate' as const,cardId:action.cardId,ability:action.ability,target:Object.keys(output)[0]}}));
    producers.set(action.cardId,[...(producers.get(action.cardId)??[]),...options]);
  }
  // Group by source so a plan never channels and activates the same creature.
  for (const [cardId,options] of producers) {
    const previous=plans;plans=[...previous];
    for(const plan of previous)for(const {command,output} of options)plans.push({
      pool:add(plan.pool,output),commands:[...plan.commands,command],
      penalty:plan.penalty+effectiveStats(state,cardId,registry).attack*.9+.15,
    });
  }
  return plans.sort((a,b) => a.penalty-b.penalty || a.commands.length-b.commands.length);
}
function playOptions(state: GameState, id: string, registry: Registry): Command[] {
  const card = legalActions(state,registry).playable.find(c => c.cardId === id);
  if (!card) return [];
  const commands: Command[] = [];
  const field=registry.cards[state.cards[id].definitionId].type!=='spell';
  for (const consume of card.consumes.length ? card.consumes : [undefined]) {
    const slots=field?[...new Set([...card.slots,...(consume?[state.cards[consume].slot!]:[])])]:[undefined];
    // Prefer central space on equal scores, but evaluate every legal deployment.
    slots.sort((a,b)=>[2,1,3,0,4].indexOf(a!)-[2,1,3,0,4].indexOf(b!));
    for (const target of card.requiresTarget ? card.targets : [undefined])for(const slot of slots)commands.push({
      type:'play',cardId:id,consume,target,slot,
    });
  }
  return commands;
}
function planPlay(state: GameState, registry: Registry): Command {
  const actor = decisionPlayer(state), p = state.players[actor], plans = energyPlans(state,registry), baseline = positionValue(state,actor,registry);
  let best: {score:number;command:Command} = {score:.05,command:{type:'end'}};
  // Reuse engine-validated states for plans shared by different cards.
  const funded = new Map<EnergyPlan,GameState | null>();
  const fund = (plan: EnergyPlan) => {
    if (funded.has(plan)) return funded.get(plan)!;
    let next: GameState | null = state;
    for (const command of plan.commands) { next = tryCommand(next,command,registry); if (!next) break; }
    funded.set(plan,next);return next;
  };
  const consider = (after: GameState, command: Command, plan: EnergyPlan) => {
    const def = command.type === 'play' ? registry.cards[state.cards[command.cardId].definitionId] : undefined;
    // A cheap cantrip cycles a card rather than adding one. A small fixed incentive
    // avoids inspecting unrevealed library contents and stops near deck exhaustion.
    const cycle = !after.outcome && p.deck.length > 4 && def?.cast?.some(a=>a.id==='draw' && a.params.amount===1) ? .2 : 0;
    const score = positionValue(after,actor,registry) - baseline - plan.penalty + cycle;
    if (score > best.score) best = {score,command:plan.commands[0] ?? command};
  };
  for (const action of legalActions(state,registry).activations) {
    for (const target of action.requiresTarget ? action.targets : [undefined]) for (const slot of action.slots ?? [undefined]) {
      const command:Command={type:'activate',cardId:action.cardId,ability:action.ability,target,slot};
      const after=tryCommand(state,command,registry);
      const penalty=registry.cards[state.cards[action.cardId].definitionId].type==='creature' ? effectiveStats(state,action.cardId,registry).attack*.9 : 0;
      if(after)consider(after,command,{pool:p.energy,commands:[],penalty});
    }
  }
  const seen = new Set<string>();
  const candidates = p.hand.filter(id => {const def = state.cards[id].definitionId;if(seen.has(def))return false;seen.add(def);return true;});
  for (const id of candidates) {
    const def = registry.cards[state.cards[id].definitionId];
    if (def.cast?.some(a => a.id === 'channel-neutral')) {
      // Conversion is worth a card only if it enables a useful follow-up now.
      // Do not score spare energy as value: it expires at the phase boundary.
      if (state.phase !== 'play') continue;
      for (const plan of plans) {
        if (!autoPayment(plan.pool,def.cost)) continue;
        const ready = fund(plan); if (!ready) continue;
        for (const ritual of playOptions(ready,id,registry)) {
          const converted = tryCommand(ready,ritual,registry); if (!converted || converted.outcome) continue;
          for (const nextId of candidates) {
            if (nextId === id || registry.cards[state.cards[nextId].definitionId].cast?.some(a=>a.id==='channel-neutral')) continue;
            for (const followup of playOptions(converted,nextId,registry)) {
              const after = tryCommand(converted,followup,registry); if (after) consider(after,ritual,plan);
            }
          }
        }
      }
      continue;
    }
    if (def.cast?.some(a => a.id === 'return')) {
      // Bounce only when the same turn can complete a material upgrade. Returning
      // and replaying the same creature would otherwise form an endless loop.
      if (state.phase !== 'play' || p.board.includes(null)) continue;
      for (const upgrade of candidates) {
        const nextDef = registry.cards[state.cards[upgrade].definitionId];
        if (nextDef.type === 'spell' || nextDef.abilities.some(a => a.id === 'consume')) continue;
        if (!p.board.some(victim => victim && creatureValue(state,upgrade,registry) > creatureValue(state,victim,registry) + 2)) continue;
        const combined = {generic:def.cost.generic + nextDef.cost.generic,factions:add(def.cost.factions,nextDef.cost.factions)};
        const plan = plans.find(plan => autoPayment(plan.pool,combined));
        if (!plan) continue;
        const ready = fund(plan);if (!ready) continue;
        for (const bounce of playOptions(ready,id,registry)) {
          if (bounce.type !== 'play' || !bounce.target || creatureValue(state,upgrade,registry) <= creatureValue(state,bounce.target,registry) + 2) continue;
          const returned = tryCommand(ready,bounce,registry);if (!returned) continue;
          for (const deploy of playOptions(returned,upgrade,registry)) {
            const after = tryCommand(returned,deploy,registry);if (after) consider(after,bounce,plan);
          }
        }
      }
      continue;
    }
    if (def.type !== 'spell' && !p.board.includes(null) && !def.abilities.some(a => a.id === 'consume')) continue;
    if (def.type === 'spell' && !def.timing?.includes(state.phase === 'play' ? 'play' : 'death')) continue;
    const plan = plans.find(plan => autoPayment(plan.pool,def.cost));
    if (!plan) continue; // No speculative partial payments for unreachable costs.
    // Keep the last slot available when an existing hand upgrade can be paid
    // next readiness cycle. Filling it with a weaker free body locks the board.
    if (def.type !== 'spell' && p.board.filter(Boolean).length === 4 && !def.abilities.some(a => a.id === 'consume')) {
      const nextCycle = {...state,cards:Object.fromEntries(Object.entries(state.cards).map(([cid,c]) => [cid,c.controller === actor ? {...c,exhausted:false} : c]))};
      const future = energyPlans(nextCycle,registry);
      if (p.hand.some(cid => {
        const alternative = registry.cards[state.cards[cid].definitionId];
        return alternative.type !== 'spell' && creatureValue(state,cid,registry) > creatureValue(state,id,registry) + 2
          && future.some(f => autoPayment(f.pool,alternative.cost));
      })) continue;
    }
    const ready = fund(plan);if (!ready) continue;
    for (const command of playOptions(ready,id,registry)) {
      const after = tryCommand(ready,command,registry);if (after) consider(after,command,plan);
    }
  }
  return best.command;
}
/** Choose attackers and lanes. Defenders block automatically, so each option is scored by its known outcome. */
function chooseAttacks(state: GameState, registry: Registry): Command {
  const actor=decisionPlayer(state),enemy=other(actor),legal=legalActions(state,registry);
  const attackers=legal.attackers.filter(id=>effectiveStats(state,id,registry).attack>0);
  const lethal=state.players[enemy].life;
  type Option={lane:number;life:number;score:number};
  const options=new Map<string,Option[]>();
  for(const attacker of attackers){
    const own=state.cards[attacker].slot!,list:Option[]=[];
    // Own lane first so equal outcomes keep the straight-ahead attack.
    for(const lane of [...legal.lanes[attacker]].sort((a,b)=>Math.abs(a-own)-Math.abs(b-own))){
      const blocker=blockerFor(state,attacker,lane,registry);
      if(!blocker){list.push({lane,life:effectiveStats(state,attacker,registry).attack,score:effectiveStats(state,attacker,registry).attack*4});continue;}
      const damage=new Map<string,number>();
      for(const hit of combatDamage(state,attacker,[{attacker,blocker}],registry))damage.set(hit.target,previewDamage(state,hit.target,hit.amount,registry));
      const blockerDies=(damage.get(blocker)??0)+state.cards[blocker].damage>=effectiveStats(state,blocker,registry).defense;
      const attackerDies=(damage.get(attacker)??0)+state.cards[attacker].damage>=effectiveStats(state,attacker,registry).defense;
      list.push({lane,life:0,score:(blockerDies?creatureValue(state,blocker,registry)*.85:0)-(attackerDies?creatureValue(state,attacker,registry)*.9:0)});
    }
    options.set(attacker,list);
  }
  let bestScore=0,best:{id:string;lane:number}[]=[];
  const visit=(index:number,used:number,score:number,life:number,chosen:{id:string;lane:number}[])=>{
    if(index===attackers.length){
      const total=score+(life>=lethal?1000:0);
      if(total>bestScore){bestScore=total;best=[...chosen];}return;
    }
    visit(index+1,used,score,life,chosen); // Sit this attacker out.
    for(const option of options.get(attackers[index])!)if(!(used&(1<<option.lane)))
      visit(index+1,used|(1<<option.lane),score+option.score,life+option.life,[...chosen,{id:attackers[index],lane:option.lane}]);
  };
  visit(0,0,0,0,[]);
  return {type:'attack',attackers:best.map(a=>a.id),lanes:Object.fromEntries(best.map(a=>[a.id,a.lane]))};
}
/** Return up to `max` of the most expensive cards (total cost 4+), but always keep a cheap play so the opening is not empty. */
function chooseMulligan(state: GameState, registry: Registry, hand: string[], max: number): string[] {
  const cost=(id:string)=>{const c=registry.cards[state.cards[id].definitionId].cost;return c.generic+Object.values(c.factions).reduce((a,b)=>a+b,0);};
  const cheap=hand.filter(id=>cost(id)<=1).length;
  return [...hand].filter(id=>cost(id)>=4).sort((a,b)=>cost(b)-cost(a)||(a<b?-1:1)).slice(0,cheap?max:Math.max(max,0));
}
// A bounded, deterministic heuristic opponent issuing the same commands as a
// human. It plans complete payments and evaluates casts with the actual engine.
export function botCommand(state: GameState, registry: Registry): Command {
  const actor = decisionPlayer(state), p = state.players[actor], legal = legalActions(state,registry);
  if (state.pending) {
    const choice = state.pending;
    if (choice.kind === 'mulligan') return {type:'mulligan',cardIds:chooseMulligan(state,registry,choice.options,choice.max)};
    if (choice.kind === 'death-energy') {
      const option = choice.options.findIndex(output => p.hand.some(id => {
        const def = registry.cards[state.cards[id].definitionId];
        return def.type === 'spell' && def.timing?.includes('death') && autoPayment(add(p.deathEnergy,output),def.cost);
      }));
      return {type:'choose',choiceId:choice.id,option:Math.max(0,option)};
    }
    const plans = energyPlans({...state,pending:null},registry);
    const score = (id:string) => {
      const def = registry.cards[state.cards[id].definitionId], free = def.cost.generic + Object.values(def.cost.factions).reduce((a,b) => a+b,0) === 0;
      if (def.type !== 'spell') {
        const fits = p.board.includes(null) || def.abilities.some(a => a.id === 'consume');
        return (fits ? 1 : .15) * creatureValue(state,id,registry) + (free && p.board.filter(Boolean).length < 3 ? 8 : 0)
          + (fits && plans.some(plan => autoPayment(plan.pool,def.cost)) ? 3 : 0);
      }
      return def.cast?.some(a => a.id === 'return') ? p.board.includes(null) ? 1 : 5 : 6;
    };
    // Keep the best card. A promising second card goes under the library for later; a weak one is discarded.
    const ranked = [...choice.options].sort((a,b) => score(b)-score(a));
    return {type:'choose',choiceId:choice.id,option:ranked[0],other:ranked[1] && score(ranked[1]) >= 5 ? 'bottom' : 'discard'};
  }
  if (state.phase === 'play' || state.combat?.stage === 'death') return planPlay(state,registry);
  if (state.combat?.stage === 'declare') return chooseAttacks(state,registry);
  if (state.combat?.stage === 'review') return {type:'confirm-combat'};
  return {type:'end'};
}
