import { compatibleMatch as compatible, restoreSession as restore, startMatch as start } from '../../apps/web/src/session';
import { registry, starterDecks } from './content';
import type { GameState } from '../../packages/contracts/src';
import type { CustomDeck } from '../../apps/web/src/decks';
import type { SavedSession } from '../../apps/web/src/session';
export type { SavedSession } from '../../apps/web/src/session';
const content = { registry, starters: [
  {id:'verdant',name:'The Verdant Pact',cards:starterDecks.verdant},
  {id:'hollow',name:'The Hollow Court',cards:starterDecks.hollow},
] };
export const startMatch = (seed:number,deck='verdant',skirmish=false,custom?:CustomDeck) => start(seed,deck,skirmish,custom,content);
export const compatibleMatch = (state:GameState) => compatible(state,content);
export const restoreSession = (saved:SavedSession) => restore(saved,content);
