import * as editor from '../../apps/web/src/decks';
import { registry } from './content';
import type { Registry } from '../../packages/contracts/src';
export type { CustomDeck } from '../../apps/web/src/decks';
export const copyCount = (cards:string[],id:string,r:Registry=registry) => editor.copyCount(cards,id,r);
export const addDeckCard = (cards:string[],id:string,r:Registry=registry) => editor.addDeckCard(cards,id,r);
export const removeDeckCard = editor.removeDeckCard;
export const parseDeck = (value:unknown,allowBlankName=false) => editor.parseDeck(value,allowBlankName,registry);
export const parseDecks = (raw:string|null) => editor.parseDecks(raw,registry);
