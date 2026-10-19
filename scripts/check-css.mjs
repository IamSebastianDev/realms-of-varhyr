// Ratchet: raw hex colours, bare z-index layers and !important may only go down, never up.
// Update scripts/css-baseline.json after a clean-up with: node scripts/check-css.mjs --update
import fs from 'fs'; import path from 'path';
const roots=['apps','packages'];
const files=[];
(function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){if(e.name==='node_modules')continue;const p=path.join(d,e.name);e.isDirectory()?walk(p):p.endsWith('.css')&&files.push(p);}})('.' );
const keep=files.filter(f=>roots.some(r=>f.replace(/^\.\//,'').startsWith(r+'/')));
const count=(s,re)=>(s.match(re)||[]).length;
const now={};
for(const f of keep){
  if(f.endsWith('tokens.css'))continue;
  const s=fs.readFileSync(f,'utf8');
  now[f.replace(/^\.\//,'')]={hex:count(s,/(?<![\w&%-])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6})(?![\w-])/g),important:count(s,/!important/g),zfixed:count(s,/z-index:\s*(?:[2-9]\d|\d{3,})\b/g),vh:count(s,/\b100d?vh\b/g)};
}
process.chdir(new URL('..',import.meta.url).pathname);
const bp='scripts/css-baseline.json';
if(process.argv.includes('--update')){fs.writeFileSync(bp,JSON.stringify(now,null,1));console.log('baseline written');process.exit(0);}
const base=JSON.parse(fs.readFileSync(bp,'utf8'));let bad=0;
for(const [f,c] of Object.entries(now)){const b=base[f]??{hex:0,important:0,zfixed:0,vh:0};
  for(const k of Object.keys(c))if(c[k]>b[k]){bad++;console.log(`${f}: ${k} ${b[k]} -> ${c[k]} (use a token from packages/ui/src/tokens.css)`);}}
if(bad){console.log(`\n${bad} regression(s).`);process.exit(1);}console.log('css tokens ok');
