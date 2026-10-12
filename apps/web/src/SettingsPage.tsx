import { useState } from 'react';
import { Eye, GraduationCap } from 'lucide-react';
import { registry } from '../../../packages/content/src';
import { ReplayRoom } from './multiplayer/ReplayRoom';
import type { RtcRoom } from './multiplayer/RtcRoom';

export function SettingsPage({ learn, watch }: { learn: () => void; watch: (room: RtcRoom) => void }) {
  const [error, setError] = useState('');
  return <main className="settings-page">
    <div className="collection-heading"><div><h1>Settings</h1></div></div>
    <section className="settings-group" aria-label="Learning">
      <div><h2>Tutorial</h2><p>A guided first match that walks through energy, creatures, combat and spells.</p></div>
      <button className="outline-button" onClick={learn}><GraduationCap size={16}/>Learn to play</button>
    </section>
    <section className="settings-group" aria-label="Replays">
      <div><h2>Replays</h2><p>Open a replay file saved from a finished match. A replay shows only what that player saw.</p>{error && <p className="settings-error" role="alert">{error}</p>}</div>
      <label className="outline-button settings-file"><Eye size={16}/>Watch a replay
        <input type="file" accept=".json,application/json" onChange={async event => {
          const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
          try { setError(''); watch(ReplayRoom.fromText(await file.text(), registry) as unknown as RtcRoom); }
          catch (cause) { setError(cause instanceof Error ? cause.message : 'This replay could not be opened.'); }
        }}/>
      </label>
    </section>
  </main>;
}
