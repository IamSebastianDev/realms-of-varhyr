import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, Volume2 } from 'lucide-react';
import { BurnEmbers } from './BurnEmbers';
import soundtrack from '../../../assets/audio/ambience.mp3?url';
import { AudioController } from './audioController';
import { getPreferences, subscribePreferences, usePreferences } from '../../../packages/ui/src/preferences';
import { t as msg, useLanguage } from '../../../packages/ui/src/i18n';
const audioContext = createContext({ playEffect: (_type: string) => {}, retry: () => {}, blocked: false });
export const useAudio = () => useContext(audioContext);
export function AudioExperience({ children }: { children: ReactNode }) {
  useLanguage();
  const preferences = usePreferences();
  const track = useRef<HTMLAudioElement>(null), controller = useRef<AudioController | null>(null);
  const [entered, setEntered] = useState(false), [blocked, setBlocked] = useState(false);
  const enterButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const player = new AudioController(track.current!, getPreferences(), undefined, setBlocked);
    controller.current = player;
    const visibility = () => player.setHidden(document.hidden);
    visibility(); document.addEventListener('visibilitychange', visibility);
    const unsubscribe = subscribePreferences(() => player.configure(getPreferences()));
    enterButton.current?.focus();
    return () => { unsubscribe(); document.removeEventListener('visibilitychange', visibility); player.dispose(); controller.current = null; };
  }, []);
  const playEffect = useCallback((type: string) => controller.current?.playEffect(type), []);
  const retry = useCallback(() => controller.current?.unlock(), []);
  function enter() { controller.current?.unlock(); setEntered(true); }
  return <audioContext.Provider value={{ playEffect, retry, blocked }}>
    <audio ref={track} src={soundtrack} preload="none" loop hidden/>
    <div inert={!entered} aria-hidden={!entered || undefined}>{children}</div>
    {!entered && <section className="realm-splash" role="dialog" aria-modal="true" aria-label={msg('Welcome to Realms of Varhyr')}>
      <div className="splash-horizon" aria-hidden="true"/><div className="splash-sigil" aria-hidden="true"><span>V</span></div>
      <div className="splash-content"><p className="splash-kicker">REALMS OF</p><h1>VARHYR</h1>
        <div className="splash-divider" aria-hidden="true">✦</div><p className="splash-story">{msg('Your next story begins here.')}</p>
        <button ref={enterButton} className="gold-button start-play splash-play" data-autofocus="true" onKeyDown={event=>{event.currentTarget.removeAttribute("data-autofocus");}} onClick={enter}><BurnEmbers/><span>{msg('Enter the realm')}</span><ArrowRight size={21}/></button>
        <p className="splash-audio">{(preferences.music || preferences.sound) && <><Volume2 size={13}/>{msg('Enter with sound')}<span>·</span></>}{msg('Music and sound can be adjusted in Settings.')}</p>
      </div>
    </section>}
  </audioContext.Provider>;
}
