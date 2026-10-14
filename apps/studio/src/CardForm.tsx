import { useEffect, useId, useState } from 'react';
import { factionInfo, setDefinitions } from '../../../packages/content/src';
import { abilityLabel, allowedAbilities, energyTypes, newBinding, paramFields, slugify, type Binding, type Draft } from './model';

type Patch = (change: Partial<Draft>) => void;
const label = (id: string) => factionInfo[id]?.name ?? id;

const parseList = (text: string) => text.split(',').map(part => part.trim()).filter(Boolean);
/** Keeps what is being typed, so a comma or space at the end is not swallowed before the next word. */
function Subtypes({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const [text, setText] = useState(value.join(', '));
  // Another card was opened (or the list changed from outside): show its subtypes instead.
  useEffect(() => { if (parseList(text).join('|') !== value.join('|')) setText(value.join(', ')); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return <input value={text} onChange={event => { setText(event.target.value); onChange(parseList(event.target.value)); }} onBlur={() => setText(value.join(', '))}/>;
}

/** Steppers hold buttons, so their field is a plain group: a label around buttons would click the first one. */
function Field({ title, hint, children, group = false }: { title: string; hint?: string; children: React.ReactNode; group?: boolean }) {
  if (group) return <div className="field" role="group" aria-label={title}><span>{title}</span>{children}{hint && <small>{hint}</small>}</div>;
  return <label className="field"><span>{title}</span>{children}{hint && <small>{hint}</small>}</label>;
}
function Num({ value, onChange, min = 0, name }: { value: number; onChange: (n: number) => void; min?: number; name?: string }) {
  const set = (n: number) => onChange(Math.max(min, Math.floor(n) || 0));
  return <span className="stepper"><button type="button" aria-label={`Decrease${name ? ' ' + name : ''}`} disabled={value <= min} onClick={() => set(value - 1)}>−</button>
    <input type="number" aria-label={name} min={min} value={value} onChange={event => set(Number(event.target.value))}/>
    <button type="button" aria-label={`Increase${name ? ' ' + name : ''}`} onClick={() => set(value + 1)}>+</button></span>;
}

function Bindings({ title, draft, slot, list, onChange }: { title: string; draft: Draft; slot: 'field' | 'cast'; list: Binding[]; onChange: (next: Binding[]) => void }) {
  const options = allowedAbilities(draft, slot), id = useId();
  const set = (index: number, binding: Binding) => onChange(list.map((entry, i) => i === index ? binding : entry));
  return <fieldset><legend>{title}</legend>
    {list.map((binding, index) => <div className="binding" key={index}>
      <select aria-label="Ability" value={binding.id} onChange={event => set(index, newBinding(event.target.value))}>
        {[...new Set([binding.id, ...options])].map(option => <option key={option} value={option}>{abilityLabel(option)}</option>)}
      </select>
      {paramFields(binding.id).map(field => <div key={field.key} className="param"><span>{field.key}</span>
        {field.kind === 'choice' ? <select aria-label={field.key} value={String(binding.params[field.key] ?? field.initial)} onChange={event => set(index, { ...binding, params: { ...binding.params, [field.key]: event.target.value } })}>
          {field.options!.map(option => <option key={option} value={option}>{label(option)}</option>)}</select>
        : field.kind === 'number' ? <Num name={field.key} min={field.min ?? 0} value={Number(binding.params[field.key] ?? field.initial)} onChange={n => set(index, { ...binding, params: { ...binding.params, [field.key]: n } })}/>
        : <input aria-label={field.key} value={String(binding.params[field.key] ?? '')} onChange={event => set(index, { ...binding, params: { ...binding.params, [field.key]: event.target.value } })}/>}
      </div>)}
      <button type="button" className="quiet" aria-label={`Remove ${abilityLabel(binding.id)}`} onClick={() => onChange(list.filter((_, i) => i !== index))}>Remove</button>
    </div>)}
    <select id={id} aria-label={`Add to ${title}`} value="" onChange={event => event.target.value && onChange([...list, newBinding(event.target.value)])}>
      <option value="">Add…</option>{options.map(option => <option key={option} value={option}>{abilityLabel(option)}</option>)}
    </select>
  </fieldset>;
}

export function CardForm({ draft, patch, onArt, hasArt, folderLocked }: { draft: Draft; patch: Patch; onArt: (file: File) => void; hasArt: boolean; folderLocked: boolean }) {
  const field = draft.type !== 'spell', picks = Object.keys(factionInfo).filter(id => id !== 'neutral');
  const toggleFaction = (id: string) => patch({ factions: draft.factions.includes(id) ? draft.factions.filter(x => x !== id) : [...draft.factions, id] });
  return <form className="studio-form" onSubmit={event => event.preventDefault()}>
    <fieldset><legend>Identity</legend>
      <div className="row"><Field title="Name (English)"><input value={draft.name} onChange={event => patch({ name: event.target.value, ...(draft.isNew && !folderLocked ? { id: slugify(event.target.value), deckLimitKey: '' } : {}) })}/></Field>
      <Field title="Name (German)"><input value={draft.de.name} onChange={event => patch({ de: { ...draft.de, name: event.target.value } })}/></Field></div>
      <Field title="ID" hint={draft.isNew ? 'Also the folder name. Cannot change after the first save.' : 'Fixed after the first save.'}>
        <input value={draft.id} disabled={!draft.isNew} onChange={event => patch({ id: slugify(event.target.value) })}/></Field>
      <div className="row"><Field title="Type"><select value={draft.type} onChange={event => patch({ type: event.target.value as Draft['type'] })}>
        <option value="creature">Creature</option><option value="spell">Spell</option><option value="holding">Holding</option></select></Field>
      <Field title="Set"><select value={draft.set} onChange={event => patch({ set: event.target.value })}>
        {setDefinitions.map(set => <option key={set.id} value={set.id}>{set.name}</option>)}</select></Field>
      <Field title="Rarity"><select value={draft.rarity} onChange={event => patch({ rarity: event.target.value as Draft['rarity'] })}>
        <option value="common">Common</option><option value="rare">Rare</option><option value="legendary">Legendary</option></select></Field></div>
      <label className="check"><input type="checkbox" checked={draft.legendary} onChange={event => patch({ legendary: event.target.checked })}/> Legendary (one copy per deck)</label>
      <Field title="Subtypes" hint="Separate with commas."><Subtypes value={draft.subtypes} onChange={subtypes => patch({ subtypes })}/></Field>
    </fieldset>

    <fieldset><legend>Factions and cost</legend>
      <div className="chips" role="group" aria-label="Factions">{picks.map(id => <button type="button" key={id} style={{ '--c': factionInfo[id]?.color } as React.CSSProperties} aria-pressed={draft.factions.includes(id)} onClick={() => toggleFaction(id)}>{label(id).replace(/^The /, '')}</button>)}</div>
      <small>No faction means neutral. Pick two or more for a hybrid card.</small>
      <div className="grid">
        <Field group title="Generic"><Num name="Generic cost" value={draft.cost.generic} onChange={generic => patch({ cost: { ...draft.cost, generic } })}/></Field>
        {draft.factions.map(id => <Field group key={id} title={label(id)}><Num name={`${label(id)} cost`} value={draft.cost.factions[id] ?? 0} onChange={n => patch({ cost: { ...draft.cost, factions: { ...draft.cost.factions, [id]: n } } })}/></Field>)}
      </div>
    </fieldset>

    {field && <fieldset><legend>Stats</legend>
      <div className="grid"><Field group title="Attack"><Num name="Attack" value={draft.attack} onChange={attack => patch({ attack })}/></Field>
        <Field group title="Defense"><Num name="Defense" min={1} value={draft.defense} onChange={defense => patch({ defense })}/></Field></div>
      {draft.type === 'creature' && <>
        {draft.outputs.map((pool, index) => <div className="pool" key={index}><strong>Energy {index + 1}</strong>
          {energyTypes.map(id => <div key={id} className="param"><span>{label(id)}</span><Num name={`${label(id)} energy`} value={pool[id] ?? 0} onChange={n => patch({ outputs: draft.outputs.map((p, i) => i === index ? { ...p, [id]: n } : p) })}/></div>)}
          <button type="button" className="quiet" onClick={() => patch({ outputs: draft.outputs.filter((_, i) => i !== index) })}>Remove</button></div>)}
        <button type="button" onClick={() => patch({ outputs: [...draft.outputs, {}] })}>Add energy output</button></>}
    </fieldset>}

    {field && <Bindings title="Abilities" draft={draft} slot="field" list={draft.abilities} onChange={abilities => patch({ abilities })}/>}
    {!field && <>
      <fieldset><legend>When it can be played</legend><div className="chips">{(['play', 'response'] as const).map(time => <button type="button" key={time} aria-pressed={draft.timing.includes(time)}
        onClick={() => patch({ timing: draft.timing.includes(time) ? draft.timing.filter(x => x !== time) : [...draft.timing, time] })}>{time === 'play' ? 'On play' : 'In response'}</button>)}</div></fieldset>
      <Bindings title="Spell effects" draft={draft} slot="cast" list={draft.cast} onChange={cast => patch({ cast })}/>
    </>}

    <fieldset><legend>Text and art</legend>
      <div className="row"><Field title="Lore (English)"><textarea rows={2} value={draft.lore} onChange={event => patch({ lore: event.target.value })}/></Field>
      <Field title="Lore (German)"><textarea rows={2} value={draft.de.lore} onChange={event => patch({ de: { ...draft.de, lore: event.target.value } })}/></Field></div>
      <Field title={hasArt ? 'Replace art' : 'Art'} hint="Any image; it is saved as data.png."><input type="file" accept="image/*" onChange={event => event.target.files?.[0] && onArt(event.target.files[0])}/></Field>
    </fieldset>
  </form>;
}
