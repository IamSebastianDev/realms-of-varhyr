import React from 'react';
import {createRoot} from 'react-dom/client';
import {factionInfo} from './packages/content/src';
import {FactionIcon,GenericEnergyIcon} from './packages/renderer/src/FactionIcon';
import {Energy} from './apps/web/src/CardPresentation';
const order=['crownlands','winter-league','bright-marches','mountain-clans','neutral','conclave','ember-fields','horde','black-host'];
createRoot(document.getElementById('root')!).render(<><header><h1>The emblems of Varhyr</h1><p>Etched fantasy marks · tapered linework · shown at energy size</p></header><div className="grid">{order.map(id=><article className="tile" key={id}><FactionIcon faction={id} className="large" style={{color:factionInfo[id].color}}/><div><h2>{factionInfo[id].name}</h2><div className="small"><FactionIcon faction={id}/><Energy pool={{[id]:2}}/></div><div className="caption">MONOCHROME · ENERGY SIZE</div></div></article>)}</div><div className="foot"><span><GenericEnergyIcon/> Generic cost</span><span><GenericEnergyIcon/> Generic energy</span></div></>);
