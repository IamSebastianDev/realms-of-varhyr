#!/usr/bin/env python3
"""One-off codemod: replace raw hex colours in declaration blocks with design tokens (packages/ui/src/tokens.css)."""
import re,sys,os,glob
OPAQUE={'#000':'var(--black)','#000000':'var(--black)','#fff':'var(--white)','#ffffff':'var(--white)',
'#0b0a09':'var(--bg)','#0c0b09':'var(--surface)','#0c0b0a':'var(--surface)','#0d0c0a':'var(--surface-raised)','#0f0e0c':'var(--surface-raised)','#0e0d0b':'var(--surface-raised)',
'#cfae6a':'var(--bronze)','#f1d59a':'var(--bronze-bright)','#f0e6cc':'var(--bronze-text)','#161514':'var(--bronze-ink)',
'#e3c780':'var(--gilt)','#f2d99a':'var(--gilt-bright)','#f2d183':'var(--gilt-bright)','#f1d89a':'var(--gilt-bright)','#f1d99f':'var(--gilt-bright)',
'#f6e8bd':'var(--gilt-pale)','#fce9b0':'var(--gilt-pale)','#fff0c9':'var(--gilt-white)','#fff4d6':'var(--gilt-white)',
'#9d9b97':'var(--ink-2)','#beb8ab':'var(--ink-3)','#8d8a82':'var(--muted)','#f0b5a6':'var(--danger-text)'}
SHADE={'0b0a09','0c0b09','0c0b0a','0d0c0a','0f0e0c','060606','070605','080706','000000','040404','060605','040303','0a0907','060504','12100e','0b0a08','0a0908','0e0d0b'}
CH={'ffffff':'--white-rgb','cfae6a':'--bronze-rgb','e3c780':'--gilt-rgb','e5d29f':'--edge-rgb'}
TOKEN_PROPS={'--bg','--surface','--surface-raised','--black','--white','--bronze','--bronze-bright','--bronze-text','--bronze-ink','--gilt','--gilt-bright','--gilt-pale','--gilt-white','--ink-2','--ink-3','--muted','--danger-text','--gold','--gold-bright','--serif','--line','--plate-bg','--plate-edge','--plate-bracket','--button-edge','--button-fill'}
SKIP_FILES={'tokens.css'}
HEX=re.compile(r'(?<![\w#&%-])#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![\w-])')
stats={'opaque':0,'alpha':0}
def alpha(a):
    v=round(int(a,16)/255,2)
    s=('%.2f'%v).rstrip('0').rstrip('.')
    return s[1:] if s.startswith('0.') else s
def rep_hex(m):
    h=m.group(1).lower()
    full='#'+h
    if full in OPAQUE: stats['opaque']+=1; return OPAQUE[full]
    if len(h)==8:
        base,a=h[:6],h[6:]
        if base in CH: stats['alpha']+=1; return f'rgb(var({CH[base]}) / {alpha(a)})'
        if base in SHADE: stats['alpha']+=1; return f'rgb(var(--shade-rgb) / {alpha(a)})'
    return m.group(0)
DECL=re.compile(r'((?:^|;)\s*)(--[\w-]+|[\w-]+)(\s*:)([^;]*)',re.S)
def do_block(sel,body):
    if re.search(r':root\s*$',sel.strip()) or 'data-safe-debug' in sel: return body
    def d(m):
        pre,prop,colon,val=m.groups()
        if prop in TOKEN_PROPS: return m.group(0)
        return pre+prop+colon+HEX.sub(rep_hex,val)
    return DECL.sub(d,body)
def process(text):
    out=[];i=0
    # innermost {…} blocks only; selector is the text since the previous '}' or '{' or ';'
    pat=re.compile(r'([^{}]*)\{([^{}]*)\}',re.S)
    last=0;res=[]
    for m in pat.finditer(text):
        res.append(text[last:m.start()])
        sel,body=m.group(1),m.group(2)
        res.append(sel+'{'+do_block(sel,body)+'}')
        last=m.end()
    res.append(text[last:])
    return ''.join(res)
changed=0
for f in sys.argv[1:]:
    if os.path.basename(f) in SKIP_FILES: continue
    s=open(f).read();n=process(s)
    if n!=s: open(f,'w').write(n);changed+=1
print('files changed',changed,stats)
