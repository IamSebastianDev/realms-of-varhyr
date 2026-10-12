import { useState, type CSSProperties } from 'react';
import { Check } from 'lucide-react';
import { Avatar } from './Avatar';
import { avatars, defaultName, maxNameLength, updateProfile, useProfile } from './profile';
import { useCollection } from './collectionStore';
import { totalPacks } from './collection';

export function ProfilePage() {
  const profile = useProfile(), { collection } = useCollection();
  const [name, setName] = useState(profile.name === defaultName ? '' : profile.name);
  const chosen = avatars.find(a => a.id === profile.avatar) ?? avatars[0]!;
  const owned = Object.values(collection.counts).reduce((sum, count) => sum + count, 0);
  const facts: [string, number][] = [['Victories', collection.rewardedMatches.length], ['Cards owned', owned], ['Boosters opened', collection.boostersOpened], ['Boosters waiting', totalPacks(collection)]];
  return <main className="profile-page">
    <div className="collection-heading"><div><h1>Profile</h1></div></div>
    <section className="profile-card" aria-label="Your profile">
      <div className="profile-portrait"><Avatar id={chosen.id} size={132}/></div>
      <div className="profile-fields">
        <label>Name
          <input value={name} maxLength={maxNameLength} placeholder={defaultName} aria-label="Player name" autoComplete="off"
            onChange={event => { setName(event.target.value); updateProfile({ name: event.target.value }); }}
            onBlur={() => setName(profile.name === defaultName ? '' : profile.name)}/>
        </label>
        <small>Shown to your opponent and on your side of the battlefield.</small>
        <dl className="profile-facts">{facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      </div>
    </section>
    <section className="profile-avatars" aria-label="Choose an avatar">
      <h2>Choose your portrait</h2>
      <div className="avatar-picker">
        <div role="radiogroup" aria-label="Avatar">
          {avatars.map(choice => <button key={choice.id} role="radio" aria-checked={choice.id === chosen.id} aria-label={`${choice.name}, ${choice.title}`} title={choice.name} className={choice.id === chosen.id ? 'on' : ''} onClick={() => updateProfile({ avatar: choice.id })}>
            <Avatar id={choice.id} size={84}/>{choice.id === chosen.id && <i><Check size={12}/></i>}
          </button>)}
        </div>
        <article className="avatar-lore" style={{ '--avatar': chosen.accent } as CSSProperties}>
          <h3>{chosen.name}</h3>
          <p className="avatar-title">{chosen.title}</p>
          <p>{chosen.lore}</p>
        </article>
      </div>
    </section>
  </main>;
}
