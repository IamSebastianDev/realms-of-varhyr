import { useEffect, useState } from 'react';
import { phaseAdvanceTiming } from './phaseAdvance';

/** Functional timing feedback keeps working with reduced motion, without rerendering the battlefield. */
export function PhaseTransitionProgress({ startedAt }: { startedAt: number }) {
  const [progress,setProgress]=useState(0);
  useEffect(()=>{
    let frame=0;
    const tick=()=>{
      const next=Math.min(1,Math.max(0,(performance.now()-startedAt)/phaseAdvanceTiming.transitionMs));
      setProgress(next);
      if(next<1)frame=requestAnimationFrame(tick);
    };
    tick();
    return()=>cancelAnimationFrame(frame);
  },[startedAt]);
  return <span className="phase-transition-track" aria-hidden="true"><span style={{transform:`scaleX(${progress})`}}/></span>;
}
