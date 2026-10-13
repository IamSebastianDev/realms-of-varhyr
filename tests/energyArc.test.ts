import { expect, it } from 'vitest';
import { energyArcLayout } from '../apps/web/src/EnergyChoiceArc';

it.each([[320,568],[897,760],[1280,720]])('keeps every energy target visible and separate at %sx%s, including flank cards', (width,height)=>{
  for(const left of [0,width/2-60,width-120])for(const count of [2,8]){
    for(const top of [12,height/2,height-90]){
      const layout=energyArcLayout({left,top,width:120,height:160},count,width,height);
      const half=layout.size/2;
      expect(layout.points).toHaveLength(count);
      for(const point of layout.points){
        expect(point.x-half).toBeGreaterThanOrEqual(11);
        expect(point.x+half).toBeLessThanOrEqual(width-11);
        expect(point.y-half).toBeGreaterThanOrEqual(11);
        expect(point.y+half).toBeLessThanOrEqual(height-11);
      }
      for(let i=0;i<count;i++)for(let j=i+1;j<count;j++){
        expect(Math.hypot(layout.points[i].x-layout.points[j].x,layout.points[i].y-layout.points[j].y)).toBeGreaterThan(layout.size);
      }
    }
  }
});
