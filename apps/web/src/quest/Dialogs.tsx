import { useEffect, useState } from 'react';
import { Check, Heart, Layers, Skull, Sparkles, X } from 'lucide-react';
import { t as msg, useLanguage } from '../../../../packages/ui/src/i18n';
import { ArtCard, CardHoverButton } from '../../../../packages/ui/src/CardPresentation';
import { cardCost } from '../deckTools';
import { CrownIcon } from '../Crowns';
import { SiteIcon } from '../../../../packages/ui/src/siteIcons';
import { factionInfo } from '../../../../packages/content/src';
import { actionsFor, questRules, type Action, type MapNode, type Offer, type Role, type RunState } from '../../../../packages/quest/src';
import { questContent } from './questStore';

export const roleInfo: Record<Role, { name: string; text: string; icon: Parameters<typeof SiteIcon>[0]['site'] }> = {
  city: { name: 'City', icon: 'city', text: 'Smoke, noise and open stalls. Someone here is always selling, and someone always knows something.' },
  market: { name: 'Market', icon: 'market', text: 'A crossroads market. Honest weights, mostly.' },
  shrine: { name: 'Shrine', icon: 'shrine', text: 'A shrine that accepts offerings. What you leave behind, it answers in kind.' },
  ruin: { name: 'Ruin', icon: 'ruin', text: 'Broken columns and older stones. Others have searched here, but not everywhere.' },
  waymark: { name: 'Waymark', icon: 'waymark', text: 'A signpost carved by travellers who walked this road before you.' },
  arena: { name: 'Arena', icon: 'arena', text: 'A walled ring where champions settle disputes for coin. The stakes are real, and so is the prize.' },
  capital: { name: 'Capital', icon: 'capital', text: 'The seat of a faction. The best of what it makes is for sale here, at a price.' },
  landmark: { name: 'Landmark', icon: 'landmark', text: 'A place the old songs still name.' },
  fight: { name: 'The wilds', icon: 'arena', text: 'Something has made its camp here, and it has seen you coming.' },
  refuge: { name: 'Refuge', icon: 'market', text: 'A hidden camp with a fire still warm. Nobody will trouble you here.' },
  cache: { name: 'A hidden cache', icon: 'ruin', text: 'Someone buried a stash here and never came back for it.' },
  trader: { name: 'Roadside trader', icon: 'market', text: 'A cart pulled off the road, and a trader who has not asked your name.' },
  boss: { name: 'The stronghold', icon: 'arena', text: 'The end of the road. Whoever you came to find is waiting inside.' },
};
const actionLabels: Record<Action['type'], string> = {
  fight: 'Fight', rest: 'Rest at the fire', heal: 'Pay for healing', shop: 'Browse the wares', buy: 'Buy', rumor: 'Ask for rumors',
  search: 'Search the place', read: 'Read the waymark', sacrifice: 'Make an offering',
};

/** Location art: faction-specific if there is any, then the generic piece, then a painted placeholder. */
function LocationArt({ role, affiliation }: { role: Role; affiliation: string }) {
  const sources = [`/quest/art/${role}-${affiliation}.webp`, `/quest/art/${role}.webp`];
  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [role, affiliation]);
  const color = factionInfo[affiliation]?.color ?? '#a9c0ad';
  return <div className="quest-art" style={{ ['--tint' as string]: color }}>
    {index < sources.length ? <img src={sources[index]} alt="" onError={() => setIndex(index + 1)}/> : <SiteIcon site={roleInfo[role].icon} size={72}/>}
  </div>;
}

export function Hearts({ life }: { life: number }) {
  useLanguage();
  return <span className="quest-hearts" role="img" aria-label={msg("{v0} of {v1} life", { v0: life, v1: questRules.maxLife })}>
    {Array.from({ length: questRules.maxLife }, (_, index) => <Heart key={index} size={15} className={index < life ? 'full' : ''}/>)}
  </span>;
}

type DialogProps = {
  run: RunState; node: MapNode; notice: string; error: string;
  act: (action: Action) => void; leave: () => void; openOffer: (offer: Offer) => void; offering: boolean; setOffering: (value: boolean) => void;
};
/** The one dialog every place opens: its picture, a line about it, and what you can do there. */
export function LocationDialog({ run, node, notice, error, act, leave, offering, setOffering }: DialogProps) {
  useLanguage();
  const encounter = run.encounter!, role = encounter.role, info = roleInfo[role];
  const faction = factionInfo[node.affiliation]?.name ?? '';
  const used = (type: string) => encounter.used.includes(type);
  const visited = run.visited.includes(node.id);
  const missing = questRules.maxLife - run.life, canHeal = missing > 0 && run.gold >= questRules.healGoldPerLife;
  const title = node.name || (role === 'boss' ? run.quest.bossName : info.name);
  const actions = actionsFor(role).filter(type => !(type === 'fight' && visited));
  const disabled = (type: Action['type']) => used(type) || (type === 'heal' && !canHeal) || (type === 'rumor' && used('rumor'));
  return <div className="quest-dialog-backdrop" role="presentation">
    <section className="quest-dialog" role="dialog" aria-modal="true" aria-label={title}>
      <LocationArt role={role} affiliation={node.affiliation}/>
      <div className="quest-dialog-body">
        <header><h2>{msg(title)}</h2>{faction && node.affiliation !== 'neutral' && <small>{msg(faction)}</small>}</header>
        <p>{role === 'boss' ? msg("{v0} waits here. Everything you have gathered on this road decides how this ends.", { v0: run.quest.bossName }) : msg(info.text)}</p>
        {notice && <p className="quest-notice" role="status">{notice}</p>}
        {error && <p className="quest-error" role="alert">{error}</p>}
        <div className="quest-actions">
          {actions.map(type => <button key={type} className={type === 'fight' ? 'gold-button' : 'outline-button'} disabled={disabled(type)} onClick={() => type === 'sacrifice' ? setOffering(true) : act({ type } as Action)}>
            {type === 'fight' && <Skull size={15}/>}{type === 'rest' && <Heart size={15}/>}{type === 'heal' && <Heart size={15}/>}{type === 'search' && <Sparkles size={15}/>}{type === 'shop' && <CrownIcon/>}
            {role === 'boss' && type === 'fight' ? msg("Face {v0}", { v0: run.quest.bossName }) : type === 'rest' ? msg("Rest at the fire (+{v0} life)", { v0: questRules.refugeHeal }) : type === 'heal' ? msg("Pay for healing ({v0} crowns per life)", { v0: questRules.healGoldPerLife }) : msg(actionLabels[type])}
            {used(type) && <Check size={14}/>}
          </button>)}
          {visited && role !== 'city' && role !== 'capital' && actionsFor(role).includes('fight') && <p className="quest-notice">{msg("This place has been cleared.")}</p>}
          <button className="outline-button" onClick={leave}>{msg("Leave")}</button>
        </div>
        {offering && <SacrificeList run={run} close={() => setOffering(false)} choose={index => { setOffering(false); act({ type: 'sacrifice', index }); }}/>}
      </div>
    </section>
  </div>;
}

/** Pick a card from the run deck to give up. Duplicates are shown once with a count. */
function SacrificeList({ run, choose, close }: { run: RunState; choose: (index: number) => void; close: () => void }) {
  useLanguage();
  const seen = new Set<string>();
  return <div className="quest-sacrifice" role="group" aria-label={msg("Choose a card to give up")}>
    <h3>{msg("Choose a card to give up")}</h3>
    <ul>{run.deck.map((id, index) => {
      if (seen.has(id)) return null;
      seen.add(id);
      const card = questContent.cards[id]!, count = run.deck.filter(other => other === id).length;
      return <li key={id}><button className="outline-button" onClick={() => choose(index)}>{msg(card.name)}{count > 1 && ` ×${count}`} <small>{msg(card.rarity)}</small></button></li>;
    })}</ul>
    <button className="outline-button" onClick={close}>{msg("Never mind")}</button>
  </div>;
}

/** Pick packs (the draft, spoils, finds, exchanges) and the shop, shown over everything else. */
export function OfferView({ run, reduced, take, skip, buy, close, showDeck }: { run: RunState; reduced: boolean; showDeck?: () => void; take: (id: string) => void; skip: () => void; buy: (index: number) => void; close: () => void }) {
  useLanguage();
  const offer = run.offer!;
  const deckSize = run.deck.length;
  if (offer.kind === 'shop') {
    return <div className="quest-offer" role="dialog" aria-modal="true" aria-label={msg("Shop")}>
      <header><h2>{offer.premium ? msg("The capital's best") : msg("Wares")}</h2><span className="quest-purse"><CrownIcon/><b>{run.gold}</b></span></header>
      <div className="quest-offer-cards">{offer.items.map((item, index) => {
        const card = questContent.cards[item.card]!;
        return <div key={`${item.card}${index}`} className={`quest-offer-card ${item.sold ? 'sold' : ''}`}>
          <ArtCard card={card} reduced={reduced}/>
          <button className="gold-button" disabled={item.sold || run.gold < item.price} onClick={() => buy(index)}>{item.sold ? msg("Sold") : msg("Buy for {v0} crowns", { v0: item.price })}</button>
        </div>;
      })}</div>
      <footer>{showDeck && <button className="outline-button" onClick={showDeck}><Layers size={15}/>{msg("Your deck")}</button>}<button className="outline-button" onClick={close}>{msg("Done")}</button></footer>
    </div>;
  }
  const draft = offer.source === 'draft';
  const left = offer.pick - offer.taken.length;
  return <div className="quest-offer" role="dialog" aria-modal="true" aria-label={msg(offer.title)}>
    <header>
      <h2>{draft ? msg("Draft your deck") : msg(offer.title)}</h2>
      <span>{draft ? msg("Pick {v0} of {v1}. Card {v2} of {v3}.", { v0: 1, v1: offer.size, v2: run.drafted + 1, v3: questRules.draftPicks }) : msg("Pick {v0} of {v1}", { v0: left, v1: offer.size })}</span>
    </header>
    <div className="quest-offer-cards">{offer.cards.map(id => {
      const card = questContent.cards[id]!, taken = offer.taken.includes(id), copies = run.deck.filter(other => other === id).length;
      return <button key={id} className={`quest-offer-card pick ${taken ? 'sold' : ''}`} disabled={taken} onClick={() => take(id)} aria-label={msg("Take {v0}", { v0: card.name })}>
        <ArtCard card={card} reduced={reduced} disabled={taken}/>
        {copies > 0 && <small>{msg("{v0} in deck", { v0: copies })}</small>}
      </button>;
    })}</div>
    <footer><span>{msg("{v0} cards in your deck", { v0: deckSize })}</span>{showDeck && <button className="outline-button" onClick={showDeck}><Layers size={15}/>{msg("Your deck")}</button>}{!draft && <button className="outline-button" onClick={skip}>{offer.taken.length ? msg("Done") : msg("Take nothing")}</button>}</footer>
  </div>;
}

export function DeckView({ run, reduced, close }: { run: RunState; reduced: boolean; close: () => void }) {
  useLanguage();
  const [cards, setCards] = useState(false);
  const counts = new Map<string, number>();
  for (const id of run.deck) counts.set(id, (counts.get(id) ?? 0) + 1);
  const entries = [...counts].map(([id, count]) => ({ card: questContent.cards[id]!, count })).sort((a, b) => cardCost(a.card) - cardCost(b.card) || (a.card.name < b.card.name ? -1 : 1));
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); close(); } }; window.addEventListener('keydown', onKey, true); return () => window.removeEventListener('keydown', onKey, true); }, [close]);
  return <div className="quest-offer quest-deckview" role="dialog" aria-modal="true" aria-label={msg("Your deck")}>
    <header><h2>{msg("Your quest deck")}</h2><span>{msg("{v0} cards", { v0: run.deck.length })}</span>
      <div className="quest-deckview-tabs" role="group" aria-label={msg("View")}><button aria-pressed={!cards} onClick={() => setCards(false)}>{msg("List")}</button><button aria-pressed={cards} onClick={() => setCards(true)}>{msg("Cards")}</button></div>
      <button className="quest-x" aria-label={msg("Close")} onClick={close}><X size={18}/></button></header>
    {cards
      ? <div className="quest-offer-cards deck">{entries.map(({ card, count }) => <div key={card.id} className="quest-offer-card"><ArtCard card={card} reduced={reduced}/>{count > 1 && <small className="count">×{count}</small>}</div>)}</div>
      : <aside className="builder-deck quest-deckview-list"><DeckList run={run}/></aside>}
  </div>;
}

const groups = [{ type: 'creature', name: 'Creatures' }, { type: 'holding', name: 'Holdings' }, { type: 'spell', name: 'Spells' }] as const;

/** The run deck as a read-only list in the deck builder's style, grouped by type. */
export function DeckList({ run }: { run: RunState }) {
  useLanguage();
  const counts = new Map<string, number>();
  for (const id of run.deck) counts.set(id, (counts.get(id) ?? 0) + 1);
  const entries = [...counts].map(([id, count]) => ({ card: questContent.cards[id]!, count })).sort((a, b) => cardCost(a.card) - cardCost(b.card) || (a.card.name < b.card.name ? -1 : 1));
  return <div className="builder-deck-grid" tabIndex={0} aria-label={msg("Cards in deck")}>{groups.map(group => {
    const rows = entries.filter(entry => entry.card.type === group.type);
    if (!rows.length) return null;
    return <section key={group.type} className="dk-group" aria-label={msg(group.name)}><h3>{msg(group.name)}<span>{rows.reduce((sum, row) => sum + row.count, 0)}</span></h3><ul>{rows.map(({ card, count }) =>
      <li key={card.id} className={`dk-row ${card.legendary ? 'is-legendary' : ''}`}>
        <span className="dk-art" aria-hidden style={{ backgroundImage: `url("${card.art}")` }}/>
        <span className="dk-cost" title={msg("Energy cost")}>{cardCost(card)}</span>
        <CardHoverButton card={card} className="dk-name" ariaLabel={msg("Inspect {v0}", { v0: card.name })} onClick={() => {}}>{msg(card.name)}</CardHoverButton>
        <span className="dk-copies"><b>×{count}</b></span>
      </li>)}</ul></section>;
  })}</div>;
}

/** The draft: an actual page, picks on the left and the growing deck on the right. */
export function DraftPage({ run, reduced, take, leave, giveUp }: { run: RunState; reduced: boolean; take: (id: string) => void; leave: () => void; giveUp: () => void }) {
  useLanguage();
  const [confirm, setConfirm] = useState(false);
  const offer = run.offer;
  if (!offer || offer.kind !== 'pick') return null;
  const total = questRules.baseDeck + questRules.draftPicks;
  return <main className="quest-page quest-draft" aria-label={msg("Draft your deck")}>
    <section className="quest-draft-picks">
      <header><h1>{msg("Draft your deck")}</h1><p>{msg("Pick {v0} of {v1}. Card {v2} of {v3}.", { v0: 1, v1: offer.size, v2: run.drafted + 1, v3: questRules.draftPicks })}</p></header>
      <div className="quest-offer-cards">{offer.cards.map(id => {
        const card = questContent.cards[id]!, copies = run.deck.filter(other => other === id).length;
        return <button key={id} className="quest-offer-card pick" onClick={() => take(id)} aria-label={msg("Take {v0}", { v0: card.name })}>
          <ArtCard card={card} reduced={reduced}/>
          <small>{copies > 0 ? msg("{v0} in deck", { v0: copies }) : '\u00a0'}</small>
        </button>;
      })}</div>
      <footer className="quest-draft-exit">{confirm ? <><span>{msg("Give up? The entry fee is lost.")}</span><button className="outline-button danger" onClick={giveUp}>{msg("Give up")}</button><button className="outline-button" onClick={() => setConfirm(false)}>{msg("Keep drafting")}</button></> : <><button className="outline-button" onClick={leave}>{msg("Leave for now")}</button><button className="outline-button" onClick={() => setConfirm(true)}>{msg("Give up")}</button></>}</footer>
    </section>
    <aside className="builder-deck quest-draft-deck" aria-label={msg("Your deck")}>
      <div className="dk-progress incomplete"><span><b>{run.deck.length}</b> / {total} {msg("cards")}</span><i aria-hidden><u style={{ width: `${Math.min(100, run.deck.length / total * 100)}%` }}/></i></div>
      <DeckList run={run}/>
    </aside>
  </main>;
}
