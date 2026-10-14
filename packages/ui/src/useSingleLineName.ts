import { useLayoutEffect, useRef } from 'react';

/** Fit the whole name to the available header width, without truncation. */
export function useSingleLineName<T extends HTMLElement>(name:string) {
  const ref=useRef<T>(null);
  useLayoutEffect(()=>{
    const node=ref.current;if(!node)return;
    let alive=true,lastWidth=-1;
    const fit=()=>{
      if(!alive)return;
      node.style.removeProperty('font-size');
      const width=node.clientWidth;
      lastWidth=width;if(!width)return;
      const font=getComputedStyle(node),size=parseFloat(font.fontSize);
      const textWidth=node.scrollWidth;
      if(textWidth>width)node.style.fontSize=`${size*Math.max(0,width-1)/textWidth}px`;
    };
    fit();
    const observer=new ResizeObserver(()=>{if(node.clientWidth!==lastWidth)fit();});
    observer.observe(node);
    // Fonts load after initial layout; refit with the actual card typeface.
    void document.fonts.ready.then(fit);
    document.fonts.addEventListener('loadingdone',fit);
    window.addEventListener('resize',fit);
    return()=>{alive=false;observer.disconnect();document.fonts.removeEventListener('loadingdone',fit);window.removeEventListener('resize',fit);};
  },[name]);
  return ref;
}
