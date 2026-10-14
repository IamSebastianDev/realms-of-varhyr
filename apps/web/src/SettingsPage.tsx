import { ResetControls } from './ResetControls';
import { useState } from 'react';
import { useAudio } from './AudioExperience';
import { Eye, GraduationCap } from 'lucide-react';
import { RULES_VERSION } from '../../../packages/core/src';
import { registry } from '../../../packages/content/src';
import { ReplayMatchSession, type ExternalMatchSession } from './match/MatchSession';
import { updatePreferences, usePreferences, type Language, type Motion } from '../../../packages/ui/src/preferences';
import { t as msg, useLanguage } from '../../../packages/ui/src/i18n';

/** Small print at the very bottom of both settings views. */
export function VersionLine() {
  useLanguage();
  return <p className="settings-version">{msg('Rules version')} {RULES_VERSION} · {msg('Content version')} {registry.version}</p>;
}

/** Shared by the home screen and the in-match settings overlay, so an online game stays connected. */
export function PreferenceControls() {
  useLanguage();
  const preferences = usePreferences();
  const audio = useAudio();
  return <>
    <section className="settings-group" aria-label={msg('Language')}><div><h2>{msg('Language')}</h2><p>{msg('Choose the language for the interface, tutorial and cards.')}</p></div>
      <select aria-label={msg('Language')} value={preferences.language} onChange={event => updatePreferences({ language: event.target.value as Language })}><option value="en">English</option><option value="de">Deutsch</option></select>
    </section>
    <section className="settings-group" aria-label={msg('Animations')}><div><h2>{msg('Animations')}</h2><p>{msg('Reduced motion uses still artwork and skips combat effects.')}</p></div>
      <select aria-label={msg('Animations')} value={preferences.motion} onChange={event => updatePreferences({ motion: event.target.value as Motion })}><option value="system">{msg('Follow system')}</option><option value="full">{msg('Full animations')}</option><option value="reduced">{msg('Reduced motion')}</option></select>
    </section>
    <section className="settings-group" aria-label={msg('Skip empty response steps')}><div><h2>{msg('Skip empty response steps')}</h2><p>{msg('Automatically pass your response step when you have no spell to cast. Turn off to see every window.')}</p></div>
      <div className="settings-audio-controls"><button className={`toggle ${preferences.skipEmptyWindows ? 'on' : ''}`} role="switch" aria-checked={preferences.skipEmptyWindows} aria-label={msg('Skip empty response steps')} onClick={() => updatePreferences({ skipEmptyWindows: !preferences.skipEmptyWindows })}><span/></button></div>
    </section>
    <section className="settings-group" aria-label={msg('Background music')}><div><h2>{msg('Background music')}</h2><p>{msg('The soundtrack follows you through menus and matches.')}</p></div>
      <div className="settings-audio-controls"><button className={`toggle ${preferences.music ? 'on' : ''}`} role="switch" aria-checked={preferences.music} aria-label={msg('Background music')} onClick={() => updatePreferences({ music: !preferences.music })}><span/></button>
        <label className="settings-volume"><input aria-label={msg('Music volume')} type="range" min="0" max="100" step="1" disabled={!preferences.music} value={Math.round(preferences.musicVolume * 100)} onChange={event => updatePreferences({ musicVolume: Number(event.target.value) / 100 })}/><output>{Math.round(preferences.musicVolume * 100)}%</output></label></div>
    </section>
    <section className="settings-group" aria-label={msg('Interaction sounds')}><div><h2>{msg('Interaction sounds')}</h2><p>{msg('Subtle sounds for cards, energy and combat.')}</p></div>
      <div className="settings-audio-controls"><button className={`toggle ${preferences.sound ? 'on' : ''}`} role="switch" aria-checked={preferences.sound} aria-label={msg('Interaction sounds')} onClick={() => updatePreferences({ sound: !preferences.sound })}><span/></button>
        <label className="settings-volume"><input aria-label={msg('Effects volume')} type="range" min="0" max="100" step="1" disabled={!preferences.sound} value={Math.round(preferences.soundVolume * 100)} onChange={event => updatePreferences({ soundVolume: Number(event.target.value) / 100 })}/><output>{Math.round(preferences.soundVolume * 100)}%</output></label></div>
    </section>
    {audio.blocked && <p className="settings-audio-error" role="status">{msg('Music could not start.')}<button onClick={audio.retry}>{msg('Try again')}</button></p>}
  </>;
}
export function SettingsPage({ learn, watch }: { learn: () => void; watch: (session: ExternalMatchSession) => void }) {
  useLanguage();
  const [error, setError] = useState('');
  return <main className="settings-page">
    <div className="collection-heading"><div><h1>{msg('Settings')}</h1></div></div>
    <PreferenceControls/>
    <section className="settings-group" aria-label={msg('Learning')}>
      <div><h2>{msg('Tutorial')}</h2><p>{msg('A guided first match that walks through energy, creatures, combat and spells.')}</p></div>
      <button className="outline-button" onClick={learn}><GraduationCap size={16}/>{msg('Learn to play')}</button>
    </section>
    <section className="settings-group" aria-label={msg('Replays')}>
      <div><h2>{msg('Replays')}</h2><p>{msg('Open a replay file saved from a finished match. A replay shows only what that player saw.')}</p>{error && <p className="settings-error" role="alert">{msg(error)}</p>}</div>
      <label className="outline-button settings-file"><Eye size={16}/>{msg('Watch a replay')}
        <input type="file" accept=".json,application/json" onChange={async event => {
          const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
          try { setError(''); watch(ReplayMatchSession.fromText(await file.text(), registry)); }
          catch (cause) { setError(cause instanceof Error ? cause.message : 'This replay could not be opened.'); }
        }}/>
      </label>
    </section>
    <ResetControls/>
    <VersionLine/>
  </main>;
}
