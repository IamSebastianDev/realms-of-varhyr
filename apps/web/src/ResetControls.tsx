import { useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { BuilderDialog } from './BuilderDialog';
import { resetStoredGameData } from './resetStorage';
import { t as msg, useLanguage } from '../../../packages/ui/src/i18n';
export function ResetControls() {
  useLanguage();
  const [confirming, setConfirming] = useState(false), [error, setError] = useState('');
  const opener = useRef<HTMLButtonElement>(null);
  function reset() {
    try { resetStoredGameData(); window.location.reload(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Saved data could not be deleted.'); }
  }
  return <>
    <section className="settings-group settings-reset" aria-label={msg('Reset saved data')}>
      <div><h2>{msg('Reset saved data')}</h2><p>{msg('Start fresh on this browser. This deletes your collection, currency, boosters, decks, profile, saved match, tutorial progress and settings.')}</p></div>
      <button ref={opener} className="outline-button reset-button" onClick={() => { setError(''); setConfirming(true); }}><Trash2 size={15}/>{msg('Full reset')}</button>
    </section>
    {confirming && <BuilderDialog title={msg('Reset everything?')} origin={opener.current} close={() => setConfirming(false)}>
      <p>{msg('All saved game data on this browser will be permanently deleted, including online reconnection details. Any current match will end. This cannot be undone.')}</p>
      <p>{msg('The game will restart with default settings, the starter collection and five free boosters.')}</p>
      {error && <p className="builder-dialog-error" role="alert">{msg(error)}</p>}
      <div className="builder-dialog-actions"><button className="outline-button" data-autofocus onClick={() => setConfirming(false)}>{msg('Cancel')}</button><button className="outline-button reset-button" onClick={reset}><Trash2 size={14}/>{msg('Delete all saved data')}</button></div>
    </BuilderDialog>}
  </>;
}
