import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PhaseAdvanceInput, type PhaseAdvanceContext } from '../apps/web/src/phaseAdvance';
import { apply, createMatch, decisionPlayer } from '../packages/core/src';
import { registry, starterDecks } from './fixtures/content';

const play:PhaseAdvanceContext={phaseKey:'1:p1:play',enabled:true};
function fixture(context=play) {
  const advance=vi.fn(),transitionChanged=vi.fn();
  const input=new PhaseAdvanceInput(advance,transitionChanged,()=>Date.now());input.update(context);
  return {input,advance,transitionChanged};
}
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(0);});
afterEach(()=>vi.useRealTimers());

describe('500 ms phase transitions',()=>{
  it('advances immediately from a single tap and has no delayed or release-triggered action',()=>{
    const f=fixture();f.input.pressSpace();expect(f.advance).toHaveBeenCalledTimes(1);
    f.input.releaseSpace();vi.advanceTimersByTime(1000);expect(f.advance).toHaveBeenCalledTimes(1);
    expect(f.transitionChanged).toHaveBeenLastCalledWith(null);
  });
  it('blocks keyboard and mouse advances until the full 500 ms transition has elapsed',()=>{
    const f=fixture();f.input.pressSpace();f.input.releaseSpace();
    vi.advanceTimersByTime(499);expect(f.input.click()).toBe(false);
    f.input.pressSpace();f.input.releaseSpace();expect(f.advance).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);expect(f.input.click()).toBe(true);expect(f.advance).toHaveBeenCalledTimes(2);
  });
  it('requires releasing Space, even if the transition has ended and the key keeps repeating',()=>{
    const f=fixture();f.input.pressSpace();f.input.update({...play,phaseKey:'attack:declare'});
    for(let n=0;n<5;n++){vi.advanceTimersByTime(1000);f.input.pressSpace();}
    expect(f.advance).toHaveBeenCalledTimes(1);
    expect(f.input.releaseSpace()).toBe(true);expect(f.input.releaseSpace()).toBe(false);
    f.input.pressSpace();expect(f.advance).toHaveBeenCalledTimes(2);
  });
  it('discards presses during a transition instead of queuing them or firing them on keyup',()=>{
    const f=fixture();f.input.click();vi.advanceTimersByTime(100);f.input.pressSpace();
    vi.advanceTimersByTime(1000);expect(f.advance).toHaveBeenCalledTimes(1);
    f.input.pressSpace();f.input.releaseSpace();expect(f.advance).toHaveBeenCalledTimes(1);
    f.input.pressSpace();expect(f.advance).toHaveBeenCalledTimes(2);
  });
  it('gives a newly received phase its full transition without extending it for same-phase updates',()=>{
    const f=fixture();f.input.click();vi.advanceTimersByTime(300);
    f.input.update({...play,phaseKey:'attack:declare'});vi.advanceTimersByTime(300);
    f.input.update({...play,phaseKey:'attack:declare'});expect(f.input.click()).toBe(false);
    vi.advanceTimersByTime(199);expect(f.input.click()).toBe(false);
    vi.advanceTimersByTime(1);expect(f.input.click()).toBe(true);
  });
  it('does not advance while a panel, pending choice or disconnected session disables input',()=>{
    const f=fixture({...play,enabled:false});expect(f.input.pressSpace()).toBe(false);expect(f.input.click()).toBe(false);
    f.input.releaseSpace();f.input.update(play);vi.advanceTimersByTime(1000);expect(f.advance).not.toHaveBeenCalled();
    f.input.pressSpace();expect(f.advance).toHaveBeenCalledTimes(1);
    f.input.update({...play,enabled:false});f.input.releaseSpace();vi.advanceTimersByTime(1000);
    expect(f.input.click()).toBe(false);expect(f.advance).toHaveBeenCalledTimes(1);
  });
  it('suppresses rapid double clicks even when a session publishes the next phase synchronously',()=>{
    let input:PhaseAdvanceInput;let count=0;
    input=new PhaseAdvanceInput(()=>{count++;input.update({...play,phaseKey:String(count)});},()=>{},()=>Date.now());
    input.update(play);expect(input.click()).toBe(true);expect(input.click()).toBe(false);
    vi.advanceTimersByTime(499);expect(input.click()).toBe(false);
    vi.advanceTimersByTime(1);expect(input.click()).toBe(true);expect(count).toBe(2);input.dispose();
  });
  it('clears transition feedback and keyboard state on cleanup without stale timer callbacks',()=>{
    const f=fixture();f.input.pressSpace();vi.advanceTimersByTime(100);f.input.dispose();
    expect(f.input.spaceDown).toBe(false);expect(f.transitionChanged).toHaveBeenLastCalledWith(null);
    f.transitionChanged.mockClear();vi.advanceTimersByTime(1000);expect(f.transitionChanged).not.toHaveBeenCalled();
    expect(f.advance).toHaveBeenCalledTimes(1);
  });
  it('advances the real engine one phase per tap and prevents rapid presses from skipping the turn',()=>{
    let state=createMatch(registry,[starterDecks.verdant,starterDecks.hollow],42),count=0;
    const context=()=>({phaseKey:`${state.turn}:${state.active}:${state.phase}:${state.combat?.stage??''}`,
      enabled:!state.pending&&!state.outcome});
    const input=new PhaseAdvanceInput(()=>{
      const result=apply(state,{actor:decisionPlayer(state),expectedRevision:state.revision,
        command:state.combat?.stage==='declare'?{type:'attack',attackers:[]}:{type:'end'}},registry);
      expect(result.error).toBeUndefined();state=result.state;count++;input.update(context());
    },()=>{},()=>Date.now());input.update(context());
    input.pressSpace();input.releaseSpace();expect(state.combat?.stage).toBe('declare');expect(count).toBe(1);
    for(let n=0;n<4;n++){vi.advanceTimersByTime(100);input.pressSpace();input.releaseSpace();}
    expect(state.combat?.stage).toBe('declare');expect(state.active).toBe('p1');expect(count).toBe(1);
    vi.advanceTimersByTime(100);input.pressSpace();expect(state.phase).toBe('end');expect(count).toBe(2);
    vi.advanceTimersByTime(1000);input.pressSpace();expect(state.active).toBe('p1');input.releaseSpace();
    input.pressSpace();expect(state.active).toBe('p2');expect(count).toBe(3);input.dispose();
  });
});
