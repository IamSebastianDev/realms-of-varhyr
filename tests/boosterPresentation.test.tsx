import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BoosterOpening } from '../apps/web/src/BoosterOpening';
import { grantBooster, emptyRewards } from '../apps/web/src/boosterRewards';

afterEach(() => vi.unstubAllGlobals());

describe('reduced-motion booster reveal', () => {
  it('immediately exposes all five cards and completion actions', () => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
    const reward = grantBooster(emptyRewards(), ['crown-recruit','runeguard','cleansing-light','dawn-banner','aldric-runewarden']);
    const noop = () => {};
    const html = renderToStaticMarkup(<BoosterOpening pack={{id:'test',cards:reward.cards,saved:true}}
      reduced suspended={false} close={noop} openAnother={noop} inspect={noop} browse={noop}/>);
    expect(html.match(/class="booster-slot revealed /g)).toHaveLength(5);
    expect(html).toContain('Open another');
    expect(html).toContain('View cards');
    expect(html).not.toContain('Breaking the seal');
    expect(html).not.toContain('Reveal all');
    expect(html).toContain('Aldric, the Runewarden');
  });
});
