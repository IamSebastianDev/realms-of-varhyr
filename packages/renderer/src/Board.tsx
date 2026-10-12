import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Component, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CardArtwork } from './CardArtwork';
import { HolographicFoil } from './HolographicFoil';
import { holographicFragmentShader, holographicVertexShader } from './holographicShader';
import { usePresentation } from './presentation';
import * as THREE from 'three';
import { positionName } from '../../contracts/src';
import type { CardInstance, PlayerId, PlayerView, Registry } from '../../contracts/src';
const positions = (slot: number, own: boolean, attacking=false): [number,number,number] => [(slot-2)*2.03,0.055,(own?1.4:-1.4)+(attacking?(own?-.38:.38):0)];
export type SlotLayout = { player: PlayerId; slot: number; x: number; y: number; width: number; height: number };
function SlotAnchors({ viewer, view, attacks, onLayout }: { viewer: PlayerId; view:PlayerView; attacks:string[]; onLayout: (slots: SlotLayout[]) => void }) {
  const { camera, size } = useThree();
  const previous = useRef('');
  useFrame(() => {
    const signature = `${viewer}:${attacks.join(',')}:${size.width}:${size.height}:${camera.projectionMatrix.elements.join(',')}`;
    if (previous.current === signature) return;
    previous.current = signature;
    camera.updateMatrixWorld();
    const slots: SlotLayout[] = [];
    for (const player of ['p1', 'p2'] as PlayerId[]) for (let slot=0;slot<5;slot++) {
      const [x,y,z] = positions(slot,player===viewer,attacks.includes(view.players[player].board[slot]??''));
      const points = [[-.8,-1.105],[.8,-1.105],[-.8,1.105],[.8,1.105]].map(([dx,dz]) => new THREE.Vector3(x+dx,y+.062,z+dz).project(camera));
      const xs=points.map(p=>(p.x+1)*size.width/2), ys=points.map(p=>(1-p.y)*size.height/2);
      slots.push({player,slot,x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)});
    }
    onLayout(slots);
  });
  return null;
}
function CameraFit() {
  const { camera,size } = useThree();
  useEffect(() => { (camera as THREE.OrthographicCamera).zoom=Math.min(size.width/10.6,size.height/5.1); camera.lookAt(0,0,0); camera.updateProjectionMatrix(); },[camera,size]);
  return null;
}
function useCardTexture(card: CardInstance, registry: Registry, reduced:boolean) {
  const def=registry.cards[card.definitionId];
  const exhausted=useRef(card.exhausted);exhausted.current=card.exhausted;
  const painter=useRef<((time:number)=>void)|null>(null);
  const [texture,setTexture]=useState<THREE.Texture|null>(null);
  useFrame(({clock})=>painter.current?.(clock.elapsedTime));
  useEffect(()=>{
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=720;
    const ctx=canvas.getContext('2d')!,map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
    const img=new Image();let video:HTMLVideoElement|undefined,alive=true,lastTime=-1,lastFrame=-1,lastExhausted:boolean|undefined;
    const render=(art?:HTMLImageElement|HTMLVideoElement)=>{
      if(!alive)return;
      const dim=exhausted.current;
      ctx.fillStyle=dim?'#243029':'#314b38';ctx.fillRect(0,0,512,720);
      if(art){
        const width=art instanceof HTMLVideoElement?art.videoWidth:art.naturalWidth,height=art instanceof HTMLVideoElement?art.videoHeight:art.naturalHeight;
        const scale=Math.max(512/width,670/height),cropWidth=512/scale,cropHeight=670/scale;
        ctx.filter=dim?'brightness(0.55) saturate(0.4)':'none';ctx.drawImage(art,(width-cropWidth)/2,(height-cropHeight)/2,cropWidth,cropHeight,0,0,512,670);ctx.filter='none';
      }
      const fade=ctx.createLinearGradient(0,365,0,690);fade.addColorStop(0,'#08151700');fade.addColorStop(.5,dim?'#1c3027b0':'#2e4836a0');fade.addColorStop(1,dim?'#19291f':'#223e2e');ctx.fillStyle=fade;ctx.fillRect(0,365,512,355);
      ctx.strokeStyle=def.type==='bastion'?(dim?'#796a87':'#ceb3e2'):(dim?'#796e59':'#c2aa77');ctx.lineWidth=5;ctx.strokeRect(9,9,494,702);ctx.strokeStyle='#c6ae784d';ctx.lineWidth=1;ctx.strokeRect(18,18,476,684);
      if(def.legendary){
        ctx.strokeStyle=dim?'#a89468':'#ffe0a0';ctx.lineWidth=7;ctx.strokeRect(7,7,498,706);
        ctx.strokeStyle=dim?'#8b7c59':'#dcc58a';ctx.lineWidth=2;ctx.strokeRect(21,21,470,678);
        // Etched corner brackets distinguish legendary frames without a badge.
        ctx.strokeStyle=dim?'#a89468':'#fff0be';ctx.lineWidth=5;
        for(const [x,y,dx,dy] of [[24,24,1,1],[488,24,-1,1],[24,696,1,-1],[488,696,-1,-1]]){
          ctx.beginPath();ctx.moveTo(x,y+dy*28);ctx.lineTo(x,y);ctx.lineTo(x+dx*28,y);ctx.stroke();
        }
      }
      lastExhausted=dim;map.needsUpdate=true;
    };
    render();setTexture(map);img.onload=()=>render(img);img.src=def.art;
    if(def.animation&&!reduced){
      video=document.createElement('video');video.muted=true;video.loop=true;video.playsInline=true;video.src=def.animation;
      // Failed/unsupported autoplay retains the still artwork.
      void video.play().catch(()=>{});
    }
    painter.current=time=>{
      const dimChanged=lastExhausted!==exhausted.current;
      if(!dimChanged&&time-lastFrame<1/30)return;
      if(video&&video.readyState>=2&&(dimChanged||video.currentTime!==lastTime)){
        render(video);lastTime=video.currentTime;lastFrame=time;
      }else if(dimChanged&&img.complete&&img.naturalWidth)render(img);
    };
    return()=>{alive=false;painter.current=null;img.onload=null;if(video){video.pause();video.removeAttribute('src');video.load();}map.dispose();};
  },[def.art,def.animation,def.legendary,def.type,reduced]);
  return texture;
}
function Frame({ color,opacity=1,width=1.66,height=2.28 }: {color:string;opacity?:number;width?:number;height?:number}) {
  return <group>{[[0,-height/2,width,.013],[0,height/2,width,.013],[-width/2,0,.013,height],[width/2,0,.013,height]].map(([x,z,w,h],i)=><mesh key={i} position={[x,.019,z]} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[w,h]}/><meshBasicMaterial color={color} transparent opacity={opacity}/></mesh>)}</group>;
}
function useHoldToInspect(inspect:()=>void) {
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null),start=useRef<[number,number]>([0,0]),held=useRef(false),callback=useRef(inspect);
  callback.current=inspect;
  const cancel=()=>{if(timer.current!==null){clearTimeout(timer.current);timer.current=null;}};
  useEffect(()=>cancel,[]);
  return {
    onPointerDown:(event:{pointerType:string;clientX:number;clientY:number})=>{cancel();held.current=false;start.current=[event.clientX,event.clientY];if(event.pointerType==='touch')timer.current=setTimeout(()=>{held.current=true;callback.current();},450);},
    onPointerMove:(event:{clientX:number;clientY:number})=>{if(Math.hypot(event.clientX-start.current[0],event.clientY-start.current[1])>8)cancel();},
    onPointerUp:cancel,onPointerCancel:cancel,
    suppressClick:()=>held.current,
  };
}
function LegendaryFoil({pointer,exhausted,reduced}:{pointer:THREE.Vector2;exhausted:boolean;reduced:boolean}) {
  const material=useMemo(()=>new THREE.ShaderMaterial({
    vertexShader:holographicVertexShader,fragmentShader:holographicFragmentShader,
    uniforms:{uTime:{value:0},uPointer:{value:new THREE.Vector2(.5,.5)},uStrength:{value:.85}},
    transparent:true,depthWrite:false,toneMapped:false,
  }),[]);
  useEffect(()=>()=>material.dispose(),[material]);
  useFrame(({clock},delta)=>{
    material.uniforms.uTime.value=reduced?0:clock.elapsedTime;
    const light=material.uniforms.uPointer.value as THREE.Vector2;
    if(reduced)light.set(.5,.5);else light.lerp(pointer,1-Math.exp(-10*delta));
    material.uniforms.uStrength.value=exhausted?.3:.85;
  });
  return <mesh position={[0,.029,0]} rotation={[-Math.PI/2,0,0]} raycast={()=>{}} material={material}>
    <planeGeometry args={[1.54,2.15]}/>
  </mesh>;
}
export type BoardDragStart = (id:string,event:{button:number;isPrimary:boolean;clientX:number;clientY:number;pointerId:number;pointerType:string;currentTarget?:EventTarget|null})=>void;
function Card({ card,view,registry,own,highlight,selected,targeted,attacking,blocking,onSelect,onInspect,onHover,onDragStart,reduced,pulse }: {card:CardInstance;view:PlayerView;registry:Registry;own:boolean;highlight:boolean;selected:boolean;targeted:boolean;attacking:boolean;blocking:boolean;onSelect:(id:string)=>void;onInspect:(id:string)=>void;onHover:(id:string|null)=>void;onDragStart?:BoardDragStart;reduced:boolean;pulse?:string}) {
  const hold=useHoldToInspect(()=>onInspect(card.id));
  const legendary=registry.cards[card.definitionId].legendary;
  const foilPointer=useMemo(()=>new THREE.Vector2(.5,.5),[]);
  const texture=useCardTexture(card,registry,reduced), root=useRef<THREE.Group>(null),group=useRef<THREE.Group>(null),[hovered,setHovered]=useState(false),pos=positions(card.slot!,own);
  useFrame((_state,delta)=>{if(root.current){const z=positions(card.slot!,own,attacking)[2];root.current.position.z=reduced?z:THREE.MathUtils.damp(root.current.position.z,z,12,delta);}if(group.current){const height=hovered ? .26 : .035;group.current.position.y=reduced?height:THREE.MathUtils.damp(group.current.position.y,height,10,delta);}});
  return <group ref={root} position={pos}><group ref={group} onPointerDown={e=>{hold.onPointerDown(e);if(own)onDragStart?.(card.id,e.nativeEvent);}} onPointerMove={e=>{hold.onPointerMove(e);if(e.uv)foilPointer.copy(e.uv);}} onPointerUp={hold.onPointerUp} onPointerCancel={hold.onPointerCancel} onPointerOver={e=>{e.stopPropagation();setHovered(true);onHover(card.id);document.body.style.cursor='pointer';}} onPointerOut={()=>{hold.onPointerCancel();foilPointer.set(.5,.5);setHovered(false);onHover(null);document.body.style.cursor='';}} onContextMenu={e=>{e.nativeEvent.preventDefault();e.stopPropagation();onInspect(card.id);}} onClick={e=>{e.stopPropagation();if(hold.suppressClick())return;if(e.shiftKey)onInspect(card.id);else onSelect(card.id);}}>
    <mesh position={[0,.002,0]} castShadow receiveShadow><boxGeometry args={[1.6,.042,2.21]}/><meshStandardMaterial color={blocking?'#4aaeb5':attacking?'#b78a42':selected?'#8c713f':legendary?'#ae8a48':'#2e3330'} roughness={.7}/></mesh>
    <mesh position={[0,.027,0]} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[1.54,2.15]}/><meshBasicMaterial key={texture?.uuid??'loading'} map={texture} color={texture?'#ffffff':'#1b3333'} toneMapped={false}/></mesh>
    {legendary&&<LegendaryFoil pointer={foilPointer} exhausted={card.exhausted} reduced={reduced}/>}
    {legendary&&<Frame width={1.57} height={2.18} color="#ffe2a2" opacity={card.exhausted?.4:.9}/>}
    <Frame width={1.65} height={2.26} color={pulse==='damage'?'#e9a17e':pulse==='energy'?'#d6ebbd':targeted?'#d58873':blocking?'#9df5fa':attacking?'#ffe0a0':selected?'#efd18b':highlight?'#96ceb3':'#a18a5f'} opacity={highlight||selected||targeted||blocking||attacking||pulse?1:card.exhausted?.28:.50}/>
    {(selected||targeted||attacking||blocking)&&<mesh position={[0,-.018,0]} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[1.79,2.4]}/><meshBasicMaterial color={targeted?'#c87150':blocking?'#6ce5f3':'#f1c15a'} transparent opacity={blocking?.28:.13}/></mesh>}
  </group></group>;
}
function Dust({ reduced }: {reduced:boolean}) {
  const ref=useRef<THREE.Points>(null);
  const vertices=useMemo(()=>Float32Array.from(Array.from({length:55},(_,i)=>[Math.sin(i*73)*6,.2+(i%7)/7,Math.cos(i*39)*3]).flat()),[]);
  useFrame(({clock})=>{if(ref.current&&!reduced)ref.current.position.y=Math.sin(clock.elapsedTime*.3)*.12;});
  return <points ref={ref}><bufferGeometry><bufferAttribute attach="attributes-position" args={[vertices,3]}/></bufferGeometry><pointsMaterial color="#d1bd86" size={.019} transparent opacity={.4}/></points>;
}
function SceneBoard({ view,viewer,registry,selected,attacks,blocks,targets,onSelect,onInspect,onSlot,onHover,onDragStart,onLayout,reduced }: {view:PlayerView;viewer:PlayerId;registry:Registry;selected:string|null;attacks:string[];blocks:{attacker:string;blocker:string}[];targets:string[];onSelect:(id:string)=>void;onInspect:(id:string)=>void;onSlot:(slot:number)=>void;onHover:(id:string|null)=>void;onDragStart?:BoardDragStart;onLayout:(slots:SlotLayout[])=>void;reduced:boolean}) {
  const own:PlayerId=viewer,enemy:PlayerId=viewer==='p1'?'p2':'p1';
  const effect=usePresentation(view.events,reduced);
  return <Canvas orthographic camera={{position:[0,15,4.5],near:.1,far:80,zoom:60}} dpr={[1,1.5]} shadows gl={{antialias:true,alpha:true}} aria-label="Three-dimensional battlefield">
    <CameraFit/><SlotAnchors viewer={viewer} view={view} attacks={attacks} onLayout={onLayout}/><ambientLight intensity={1.2}/><directionalLight position={[-3,8,4]} intensity={2} color="#c8d4bf" castShadow shadow-mapSize={[1024,1024]}/>
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,-.05,0]} receiveShadow><planeGeometry args={[13,7]}/><shadowMaterial transparent opacity={.5}/></mesh>
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,-.035,0]}><ringGeometry args={[2.35,2.36,100]}/><meshBasicMaterial color="#d2b26c" transparent opacity={.065}/></mesh>
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,-.03,0]}><ringGeometry args={[1.86,1.875,100]}/><meshBasicMaterial color="#d2b26c" transparent opacity={.045}/></mesh>
    {[enemy,own].map(side=>view.players[side].board.map((id,slot)=>{
      const isOwn=side===own,pos=positions(slot,isOwn);
      return id?<Card key={id} card={view.cards[id]} view={view} registry={registry} own={isOwn} highlight={view.legal.energy.some(a=>a.cardId===id)||view.legal.activations.some(a=>a.cardId===id)||view.legal.attackers.includes(id)} selected={selected===id} attacking={attacks.includes(id)} blocking={blocks.some(b=>b.blocker===id)} targeted={targets.includes(id)} onSelect={onSelect} onInspect={onInspect} onHover={onHover} onDragStart={onDragStart} reduced={reduced} pulse={effect?.cardId===id||effect?.target===id?effect.kind:undefined}/>:<group key={`slot-${side}-${slot}`} position={pos} onClick={e=>{e.stopPropagation();if(isOwn)onSlot(slot);}}>
        <mesh rotation={[-Math.PI/2,0,0]}><planeGeometry args={[1.68,2.3]}/><meshBasicMaterial color={isOwn&&selected?'#6e8f66':'#06120d'} transparent opacity={isOwn && selected?.startsWith('p') ? .42 : .38}/></mesh><Frame color={isOwn&&selected?'#e2c98c':'#cfae6a'} opacity={isOwn && selected ? .8 : .42}/>
        <mesh rotation={[-Math.PI/2,0,0]} position={[0,.021,0]}><ringGeometry args={[.075,.084,4]}/><meshBasicMaterial color="#cfae6a" transparent opacity={.4}/></mesh>
      </group>;
    }))}
    <Dust reduced={reduced}/>
  </Canvas>;
}

type BoardProps = Parameters<typeof SceneBoard>[0];
function FlatSlot({props,side,slot,id}:{props:BoardProps;side:PlayerId;slot:number;id:string|null}) {
  const hold=useHoldToInspect(()=>{if(id)props.onInspect(id);});
  return <button data-player={side} data-slot={slot} className={`flat-slot ${id&&props.registry.cards[props.view.cards[id].definitionId].legendary?'legendary-slot':''} ${side===props.viewer?'own-slot':'enemy-slot'} ${id&&props.attacks.includes(id)?'attacking-slot':''} ${props.selected===id?'active':''} ${id&&props.view.cards[id].exhausted?'exhausted-slot':''}`} onPointerDown={e=>{hold.onPointerDown(e);if(id&&side===props.viewer)props.onDragStart?.(id,e);}} onPointerMove={hold.onPointerMove} onPointerUp={hold.onPointerUp} onPointerCancel={hold.onPointerCancel} onPointerEnter={()=>id&&props.onHover(id)} onPointerLeave={()=>{hold.onPointerCancel();props.onHover(null);}} onContextMenu={e=>{e.preventDefault();if(id)props.onInspect(id);}} onClick={e=>{if(hold.suppressClick())return;if(id){if(e.shiftKey)props.onInspect(id);else props.onSelect(id);}else if(side===props.viewer)props.onSlot(slot);}} aria-label={`${side===props.viewer?'Your':'Opponent'} ${positionName(slot)}${id?`: ${props.registry.cards[props.view.cards[id].definitionId].name}`:''}`}>
    {id?<CardArtwork art={props.registry.cards[props.view.cards[id].definitionId].art} animation={props.registry.cards[props.view.cards[id].definitionId].animation} playing reduced={props.reduced}/>:<span>◇</span>}
    {id&&props.registry.cards[props.view.cards[id].definitionId].legendary&&<HolographicFoil playing reduced={props.reduced} dimmed={props.view.cards[id].exhausted}/>}
  </button>;
}
function FlatBoard(props:BoardProps) {
  const root=useRef<HTMLDivElement>(null);
  useLayoutEffect(()=>{
    const measure=()=>{
      const rect=root.current!.getBoundingClientRect();
      props.onLayout(Array.from(root.current!.querySelectorAll<HTMLElement>('[data-slot]')).map(element=>{
        const box=element.getBoundingClientRect();
        return {player:element.dataset.player as PlayerId,slot:Number(element.dataset.slot),x:box.left-rect.left,y:box.top-rect.top,width:box.width,height:box.height};
      }));
    };
    measure();const observer=new ResizeObserver(measure);observer.observe(root.current!);return()=>observer.disconnect();
  },[props.viewer,props.onLayout,props.attacks.join(',')]);
  return <div ref={root} className="flat-board" aria-label="Battlefield in two-dimensional view">{([props.viewer==='p1'?'p2':'p1',props.viewer] as PlayerId[]).map(side=><div className="flat-row" key={side}>{props.view.players[side].board.map((id,slot)=><FlatSlot key={slot} props={props} side={side} slot={slot} id={id}/>)}</div>)}</div>;
}
class SceneBoundary extends Component<{children:ReactNode;fallback:ReactNode},{failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed?this.props.fallback:this.props.children;}
}
export function Board(props:BoardProps){return <SceneBoundary fallback={<FlatBoard {...props}/>}><SceneBoard {...props}/></SceneBoundary>;}
