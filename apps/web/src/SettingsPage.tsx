import { ResetControls } from './ResetControls';
import { useState } from 'react';
import { useAudio } from './AudioExperience';
import { useFullscreen } from './useFullscreen';
import { Eye, GraduationCap, Plus, Unlock } from 'lucide-react';
import { gainDebugCrowns } from './collection';
import { updateCollection } from './collectionStore';
import { cardBacks, isBackUnlocked } from './cardBacks';
import { unlockAllSleeves, useBoughtBacks } from './cardBackStore';
import { achievements } from './goals';
import { completeAllAchievements, useGoals } from './goalsStore';
import { RULES_VERSION } from '../../../packages/core/src';
import { registry } from '../../../packages/content/src';
import { ReplayMatchSession, type MatchSession } from './match/MatchSession';
import { updatePreferences, usePreferences, type Language, type Motion } from '../../../packages/ui/src/preferences';
import { t as msg, useLanguage } from '../../../packages/ui/src/i18n';

/** Small print at the very bottom of both settings views. */
export function VersionLine() {
  useLanguage();
  return <p className="settings-version">{msg('Rules version')} {RULES_VERSION} · {msg('Content version')} {registry.version}</p>;
}

/** Shared by the home screen and the in-match settings overlay, so an online game stays connected. */
export function PreferenceControls({ part }: { part?: 'general' | 'audio' }) {
  useLanguage();
  const g = part !== 'audio', a = part !== 'general';
  const preferences = usePreferences();
  const audio = useAudio();
  const fullscreen = useFullscreen();
  return <>
    {g && <>
    <section className="settings-group" aria-label={msg('Language')}><div><h2>{msg('Language')}</h2><p>{msg('Choose the language for the interface, tutorial and cards.')}</p></div>
      <select aria-label={msg('Language')} value={preferences.language} onChange={event => updatePreferences({ language: event.target.value as Language })}><option value="en">English</option><option value="de">Deutsch</option></select>
    </section>
    <section className="settings-group" aria-label={msg('Animations')}><div><h2>{msg('Animations')}</h2><p>{msg('Reduced motion uses still artwork and skips combat effects.')}</p></div>
      <select aria-label={msg('Animations')} value={preferences.motion} onChange={event => updatePreferences({ motion: event.target.value as Motion })}><option value="system">{msg('Follow system')}</option><option value="full">{msg('Full animations')}</option><option value="reduced">{msg('Reduced motion')}</option></select>
    </section>
    {!fullscreen.installed && <section className="settings-group" aria-label={msg('Fullscreen')}><div><h2>{msg('Fullscreen')}</h2><p>{fullscreen.supported ? msg('Hide the browser bars to give the board the whole screen.') : msg('For fullscreen, add this page to your home screen: Share, then Add to Home Screen.')}{fullscreen.supported && fullscreen.appleTouch && <> {msg('Safari leaves fullscreen when the keyboard opens. Adding the page to your home screen keeps it.')}</>}</p></div>
      {fullscreen.supported && <div className="settings-audio-controls"><button className={`toggle ${fullscreen.active ? 'on' : ''}`} role="switch" aria-checked={fullscreen.active} aria-label={msg('Fullscreen')} onClick={() => void fullscreen.toggle()}><span/></button></div>}
    </section>}
    <section className="settings-group" aria-label={msg('Skip empty response steps')}><div><h2>{msg('Skip empty response steps')}</h2><p>{msg('Automatically pass your response step when you have no spell to cast. Turn off to see every window.')}</p></div>
      <div className="settings-audio-controls"><button className={`toggle ${preferences.skipEmptyWindows ? 'on' : ''}`} role="switch" aria-checked={preferences.skipEmptyWindows} aria-label={msg('Skip empty response steps')} onClick={() => updatePreferences({ skipEmptyWindows: !preferences.skipEmptyWindows })}><span/></button></div>
    </section>
    </>}
    {a && <>
    <section className="settings-group" aria-label={msg('Background music')}><div><h2>{msg('Background music')}</h2><p>{msg('The soundtrack follows you through menus and matches.')}</p></div>
      <div className="settings-audio-controls"><button className={`toggle ${preferences.music ? 'on' : ''}`} role="switch" aria-checked={preferences.music} aria-label={msg('Background music')} onClick={() => updatePreferences({ music: !preferences.music })}><span/></button>
        <label className="settings-volume"><input aria-label={msg('Music volume')} type="range" min="0" max="100" step="1" disabled={!preferences.music} value={Math.round(preferences.musicVolume * 100)} onChange={event => updatePreferences({ musicVolume: Number(event.target.value) / 100 })}/><output>{Math.round(preferences.musicVolume * 100)}%</output></label></div>
    </section>
    <section className="settings-group" aria-label={msg('Ambience')} aria-disabled="true"><div><h2>{msg('Ambience')}</h2><p>{msg('Coming later.')}</p></div>
      <div className="settings-audio-controls"><button className="toggle" role="switch" aria-checked={false} aria-label={msg('Ambience')} disabled><span/></button>
        <label className="settings-volume"><input aria-label={msg('Ambience volume')} type="range" min="0" max="100" step="1" disabled value={Math.round(preferences.ambienceVolume * 100)} readOnly/><output>{Math.round(preferences.ambienceVolume * 100)}%</output></label></div>
    </section>
    <section className="settings-group" aria-label={msg('Sound effects')}><div><h2>{msg('Sound effects')}</h2><p>{msg('Spells, played cards, drafting and booster opening.')}</p></div>
      <div className="settings-audio-controls"><button className={`toggle ${preferences.sound ? 'on' : ''}`} role="switch" aria-checked={preferences.sound} aria-label={msg('Sound effects')} onClick={() => updatePreferences({ sound: !preferences.sound })}><span/></button>
        <label className="settings-volume"><input aria-label={msg('Effects volume')} type="range" min="0" max="100" step="1" disabled={!preferences.sound} value={Math.round(preferences.soundVolume * 100)} onChange={event => updatePreferences({ soundVolume: Number(event.target.value) / 100 })}/><output>{Math.round(preferences.soundVolume * 100)}%</output></label></div>
    </section>
    {audio.blocked && <p className="settings-audio-error" role="status">{msg('Music could not start.')}<button onClick={audio.retry}>{msg('Try again')}</button></p>}
    </>}
  </>;
}
export function SettingsPage({ learn, watch }: { learn: () => void; watch: (session: MatchSession) => void }) {
  useLanguage();
  const goals = useGoals(), boughtBacks = useBoughtBacks();
  const achievementsComplete = achievements.every(def => (goals.claimedTiers[def.id] ?? 0) >= def.tiers.length);
  const sleevesUnlocked = cardBacks.every(back => isBackUnlocked(back, goals, boughtBacks));
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'general' | 'audio' | 'learn' | 'data'>('general');
  const tabs: [typeof tab, string][] = [['general', msg('General')], ['audio', msg('Audio')], ['learn', msg('Learn and watch')], ['data', msg('Data')]];
  return <main className="settings-page">
    <div className="collection-heading"><div><h1>{msg('Settings')}</h1></div><div className="profile-tabs" role="tablist">{tabs.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>)}</div></div>
    {tab === 'general' && <PreferenceControls part="general"/>}
    {tab === 'audio' && <PreferenceControls part="audio"/>}
    {tab === 'learn' && <>
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
    </>}
    {tab === 'data' && <>
    <section className="settings-group" aria-label={msg('Developer')}>
      <div><h2>{msg('Developer')}</h2><p>{msg('Tools for testing the prototype.')}</p></div>
      <div className="settings-debug-actions">
        <button className="outline-button" onClick={() => { updateCollection(gainDebugCrowns); }}><Plus size={16}/>{msg('Gain 1,000 crowns')}</button>
        <button className="outline-button" disabled={sleevesUnlocked} onClick={unlockAllSleeves}><Unlock size={16}/>{msg('Unlock all sleeves')}</button>
        <button className="outline-button" disabled={achievementsComplete} onClick={completeAllAchievements}><Unlock size={16}/>{msg('Complete all achievements')}</button>
      </div>
    </section>
    <ResetControls/>
    </>}
    <VersionLine/>
  </main>;
}
