import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BoosterOpening } from '../apps/web/src/BoosterOpening';
import { boosterPacks } from '../packages/content/src/boosters';
import { grantBooster, emptyRewards } from '../apps/web/src/boosterRewards';

afterEach(() => vi.unstubAllGlobals());

describe('reduced-motion booster reveal', () => {
  it('immediately exposes all five cards and completion actions', () => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
    const reward = grantBooster(emptyRewards(), ['crown-recruit','runeguard','cleansing-light','dawn-banner','aldric-runewarden']);
    const noop = () => {};
    const html = renderToStaticMarkup(<BoosterOpening pack={{id:'test',cards:reward.cards,saved:true,pack:boosterPacks[0]}}
      reduced suspended={false} close={noop} openAnother={noop} inspect={noop} browse={noop}/>);
    expect(html.match(/class="booster-slot revealed /g)).toHaveLength(5);
    expect(html).toContain('Open another');
    expect(html).toContain('View cards');
    expect(html).not.toContain('Breaking the seal');
    expect(html).not.toContain('Reveal all');
    expect(html).toContain('Aldric, the Runewarden');
  });
  it('shows dust conversion and prevents opening another absent pack', () => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
    const noop = () => {};
    const html = renderToStaticMarkup(<BoosterOpening pack={{ id: 'dusted', saved: true, pack: boosterPacks[0], cards: Array.from({length:5},()=>({id:'crown-recruit',isNew:false,copies:3,dust:10})) }}
      reduced suspended={false} close={noop} openAnother={noop} canOpenAnother={false} inspect={noop} browse={noop}/>);
    expect(html).toContain('0 cards added to your collection · 50 dust');
    expect(html.match(/Extra copy reclaimed/g)).toHaveLength(5);
    expect(html).toContain('aria-label="50 dust"');
    expect(html).toContain('class="gold-button" disabled=""');
  });
});
