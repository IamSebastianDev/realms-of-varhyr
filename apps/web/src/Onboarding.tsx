import { t as msg, useLanguage } from '../../../packages/ui/src/i18n';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ArrowLeft, ArrowRight, Crown } from 'lucide-react';
import { avatarDefinitions, factionInfo, registry } from '../../../packages/content/src';
import { Avatar } from './Avatar';
import { ArtCard } from '../../../packages/ui/src/CardPresentation';
import { createCollection } from './collection';
import { updateCollection } from './collectionStore';
import { markAccount, starterOffers, type StarterOffer } from './onboardingState';
import { maxNameLength, updateProfile } from './profile';
import { usePreferences } from '../../../packages/ui/src/preferences';

type Step = 'starter' | 'name' | 'reveal';
const colorOf = (offer: StarterOffer) => ({ '--ob-color': factionInfo[offer.faction]?.color ?? '#d7b66b' }) as CSSProperties;
const heroOf = (offer: StarterOffer) => avatarDefinitions.find(a => a.id === offer.avatar)!;
const showcase = (offer: StarterOffer) => [...offer.cards].reverse().slice(0, 3);

/** First-run flow: pick a starter deck, name yourself, then watch the deck's cards turn over. */
export function Onboarding({ onDone }: { onDone: () => void }) {
  useLanguage();
  const { reduced } = usePreferences();
  const offers = useMemo(starterOffers, []);
  const [step, setStep] = useState<Step>('starter');
  const [choice, setChoice] = useState(offers[0]?.id ?? '');
  const [name, setName] = useState('');
  const offer = offers.find(o => o.id === choice) ?? offers[0];
  if (!offer) return null;
  const hero = heroOf(offer);
  const trimmed = name.trim();

  function begin() {
    updateProfile({ name: trimmed, avatar: offer.avatar });
    const cards = offer.cards.flatMap(card => Array<string>(card.copies).fill(card.id));
    updateCollection(() => createCollection(registry, cards));
    markAccount();
    setStep('reveal');
  }

  return <div className={`onboarding ${reduced ? 'reduced-motion' : ''}`} style={colorOf(offer)}>
    <div className="ob-backdrop" aria-hidden="true"/>
    {step === 'starter' && <main className="ob-stage ob-starters" aria-labelledby="ob-title">
      <header><small>{msg("Realms of Varhyr")}</small><h1 id="ob-title">{msg("Choose your banner")}</h1>
        <p>{msg("Your starter deck decides which realm you first fight for. You can build with any card you collect later.")}</p></header>
      <div className="ob-offers" role="radiogroup" aria-label={msg("Starter deck")}>
        {offers.map(o => {
          const h = heroOf(o), on = o.id === offer.id;
          return <button key={o.id} role="radio" aria-checked={on} className={`ob-offer ${on ? 'on' : ''}`} style={colorOf(o)} onClick={() => setChoice(o.id)}>
            <span className="ob-offer-portrait"><Avatar id={o.avatar}/></span>
            <span className="ob-offer-body">
              <strong>{msg(factionInfo[o.faction]?.name ?? o.faction)}</strong>
              <em>{msg(o.name)}</em>
              <span className="ob-offer-hero">{msg(h.title)}</span>
              <span className="ob-offer-lore">{msg(h.lore)}</span>
              <span className="ob-offer-fan" aria-hidden="true">{showcase(o).map(card => <span key={card.id}><ArtCard card={registry.cards[card.id]} detail={false} reduced className="ob-fan-card"/></span>)}</span>
              <small>{msg("{v0} cards · {v1} different", { v0: o.total, v1: o.cards.length })}</small>
            </span>
          </button>;
        })}
      </div>
      <footer><button className="gold-button" onClick={() => setStep('name')}>{msg("Continue")}<ArrowRight size={16}/></button></footer>
    </main>}
    {step === 'name' && <main className="ob-stage ob-name" aria-labelledby="ob-title">
      <div className="ob-hero"><span className="ob-hero-portrait"><Avatar id={offer.avatar}/></span></div>
      <header><small>{msg(hero.title)}</small><h1 id="ob-title">{msg("What are you called?")}</h1>
        <p>{msg("Your name is shown to opponents and on your side of the battlefield. {v0} will be your portrait for now.", { v0: msg(hero.name) })}</p></header>
      <form onSubmit={event => { event.preventDefault(); if (trimmed) begin(); }}>
        <input autoFocus value={name} maxLength={maxNameLength} placeholder={msg("Player name")} aria-label={msg("Player name")} autoComplete="off" onChange={event => setName(event.target.value)}/>
        <div className="ob-actions">
          <button type="button" className="outline-button" onClick={() => setStep('starter')}><ArrowLeft size={16}/>{msg("Back")}</button>
          <button type="submit" className="gold-button" disabled={!trimmed}>{msg("Claim your deck")}<ArrowRight size={16}/></button>
        </div>
      </form>
    </main>}
    {step === 'reveal' && <Reveal offer={offer} name={trimmed} reduced={reduced} done={onDone}/>}
  </div>;
}

function Reveal({ offer, name, reduced, done }: { offer: StarterOffer; name: string; reduced: boolean; done: () => void }) {
  const total = offer.cards.length;
  const [revealed, setRevealed] = useState(reduced ? total : 0);
  const [skip, setSkip] = useState(false);
  const doneRef = useRef<HTMLButtonElement>(null);
  const complete = revealed === total;
  useEffect(() => {
    if (skip || reduced) { setRevealed(total); return; }
    const timers: number[] = [];
    let at = 900;
    offer.cards.forEach((card, index) => {
      timers.push(window.setTimeout(() => setRevealed(index + 1), at));
      // Rare and legendary cards earn a longer beat before the next card.
      at += registry.cards[card.id].rarity === 'legendary' ? 1100 : registry.cards[card.id].rarity === 'rare' ? 480 : 260;
    });
    return () => timers.forEach(window.clearTimeout);
  }, [offer, reduced, skip, total]);
  useEffect(() => { if (complete) doneRef.current?.focus(); }, [complete]);
  const legendaryLanded = offer.cards.some((card, index) => index < revealed && registry.cards[card.id].rarity === 'legendary');

  return <main className={`ob-stage ob-reveal ${legendaryLanded ? 'legend-landed' : ''}`} aria-labelledby="ob-title">
    <header><small>{msg(offer.name)}</small><h1 id="ob-title">{complete ? msg("Your deck is ready, {v0}", { v0: name }) : msg("Unsealing your deck…")}</h1>
      <p role="status" aria-live="polite">{complete ? msg("{v0} cards joined your collection. Five boosters are waiting in your inventory.", { v0: offer.total }) : msg("{v0} / {v1} different cards", { v0: revealed, v1: total })}</p></header>
    <div className="booster-grid ob-grid">
      {offer.cards.map((entry, index) => {
        const card = registry.cards[entry.id], visible = index < revealed;
        return <div className={`booster-slot ob-slot ${visible ? 'revealed' : ''} rarity-${card.rarity}`} key={entry.id}>
          <div className="booster-flip">
            <div className="booster-card-back" aria-hidden="true"><Crown size={28}/><span>V</span></div>
            <div className="booster-card-front" aria-hidden={!visible} inert={!visible}><ArtCard card={card} reduced={reduced} className="booster-card"/></div>
          </div>
          <div className={`booster-card-caption ${visible ? '' : 'unrevealed'}`} aria-hidden={!visible}>
            <span>{card.rarity}</span><small>{msg("× {v0} in your deck", { v0: entry.copies })}</small>
          </div>
        </div>;
      })}
    </div>
    <footer>
      {complete ? <button ref={doneRef} className="gold-button" onClick={done}>{msg("Enter the realm")}<ArrowRight size={16}/></button>
        : <button className="outline-button" onClick={() => setSkip(true)}>{msg("Reveal all")}</button>}
    </footer>
  </main>;
}
