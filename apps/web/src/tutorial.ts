import type { Command, CommandEnvelope, GameState, PlayerId } from '../../../packages/contracts/src';
import { createMatch } from '../../../packages/core/src';
import { registry, starterDefinitions, defaultDeckId } from '../../../packages/content/src';
import type { SavedSession } from './session';

/**
 * The guided first match. Everything here is deterministic: both libraries are stacked, the opponent follows a written script
 * instead of the bot, and every step names the one move the player may make. Progress is derived from the commands already
 * played, so a reload resumes exactly where the player stopped.
 */
export const tutorialSeed = 90;
/** Remembers whether the player has seen, finished or skipped the tutorial. */
export const tutorialKey = 'varhir-tutorial-v1';
const you: PlayerId = 'p1', rival: PlayerId = 'p2';

export type TutorialStep = {
  id: string;
  title: string;
  text: string;
  /** CSS selectors the coach rings while the step is shown. */
  focus?: (state: GameState) => string[];
  /** Information only: the player presses this button to continue. */
  next?: string;
  /** The single command the player may send. */
  accept?: (command: Command, state: GameState) => boolean;
};

const definitionOf = (state: GameState, id: string | undefined) => (id ? state.cards[id]?.definitionId : undefined);
export const find = (state: GameState, player: PlayerId, definitionId: string, zone: 'hand' | 'board' | 'deck' = 'hand') =>
  Object.values(state.cards).filter(card => card.owner === player && card.definitionId === definitionId && card.zone === zone).map(card => card.id).sort()[0];
const hand = (definitionId: string) => (state: GameState) => { const id = find(state, you, definitionId); return id ? [`#hand-${id}`] : []; };
const slot = (player: PlayerId, index: number) => `[data-battlefield-slot="${player}-${index}"]`;
const button = '.primary-action';
const playsAt = (definitionId: string, index: number) => (command: Command, state: GameState) =>
  command.type === 'play' && definitionOf(state, command.cardId) === definitionId && command.slot === index;
const channels = (definitionId: string) => (command: Command, state: GameState) =>
  command.type === 'energy' && definitionOf(state, command.cardId) === definitionId && command.option === 0;
const is = (type: Command['type']) => (command: Command) => command.type === type;

export const tutorialSteps: TutorialStep[] = [
  { id: 'welcome', title: 'Welcome to Varhyr', next: 'Show me how',
    text: 'You win by taking your opponent from ten life to zero. You lose if you draw your last card. This match is scripted, so every card you need is already on its way. Follow the glowing hints.' },
  { id: 'mulligan', title: 'Your opening hand',
    text: 'Tower of the First Morning and Aldric both cost four energy, and you begin with none. Select both, then press Replace 2 cards.',
    focus: state => [...['tower-of-the-first-morning', 'aldric-runewarden'].map(definition => find(state, you, definition)).filter(Boolean).map(id => `#mull-${id}`), '.mulligan-confirm'],
    accept: (command, state) => command.type === 'mulligan' && command.cardIds.length === 2
      && command.cardIds.every(id => ['tower-of-the-first-morning', 'aldric-runewarden'].includes(definitionOf(state, id) ?? '')) },
  { id: 'energy', title: 'Creatures are your energy', next: 'Got it',
    text: 'There are no land cards. Every creature makes energy, but only by exhausting itself once it is ready. So every game starts with creatures that cost nothing.' },
  { id: 'play-farmer', title: 'Deploy your first creature',
    text: 'Drag Goldfield Farmer onto the center slot. Creatures enter exhausted, so it can’t make energy until your next turn.',
    focus: state => [...hand('goldfield-farmer')(state), slot(you, 2)], accept: playsAt('goldfield-farmer', 2) },
  { id: 'play-recruit', title: 'Fill the Left Wing',
    text: 'Drag Crownlands Recruit onto the slot left of the center. Cards can’t move once placed, and an attacker can only target its own lane or a neighbor, so placement matters.',
    focus: state => [...hand('crown-recruit')(state), slot(you, 1)], accept: playsAt('crown-recruit', 1) },
  { id: 'play-merchant', title: 'Now the Merchant',
    text: 'Merchant of Tris Vale goes to the Right Wing. It will produce two energy when it readies, and it will matter again soon.',
    focus: state => [...hand('merchant-of-tris-vale')(state), slot(you, 3)], accept: playsAt('merchant-of-tris-vale', 3) },
  { id: 'enter-combat', title: 'A turn has three phases',
    text: 'Play, combat, end. Nothing of yours is ready to fight, but you still pass through combat. Click the glowing button, or press Space. Each phase has a brief transition before you can advance again.',
    focus: () => [button], accept: is('end') },
  { id: 'skip-combat', title: 'Skip combat', text: 'No attackers this turn. Press the button again.', focus: () => [button], accept: command => command.type === 'attack' && !command.attackers.length },
  { id: 'end-turn', title: 'End your turn',
    text: 'Ending your turn readies your creatures and clears all damage and energy.', focus: () => [button], accept: is('end') },
  { id: 'draw', title: 'Draw two, keep one',
    text: 'Every turn you draw two cards and keep one. Keep Cleansing Light, a spell you’ll need shortly. Drag the other card to the discard pile, or use its button.',
    focus: () => ['.draw-cards'],
    accept: (command, state) => command.type === 'choose' && state.pending?.kind === 'draw' && definitionOf(state, String(command.option)) === 'cleansing-light' },
  { id: 'channel-farmer', title: 'Channel for energy',
    text: 'Your creatures are ready. Click Goldfield Farmer to channel it: it exhausts and puts one Crownlands energy in your pool.',
    focus: () => [slot(you, 2)], accept: channels('goldfield-farmer') },
  { id: 'channel-merchant', title: 'Channel the Merchant',
    text: 'Now the Merchant. Two energy this time. A creature that channels can’t attack this turn, so choose who works and who fights.',
    focus: () => [slot(you, 3), '.energy-meter:not(.opponent-pool)'], accept: channels('merchant-of-tris-vale') },
  { id: 'play-runeguard', title: 'Spend it',
    text: 'You have three energy. Runeguard costs three: two must be Crownlands, one can be anything. Drag it to the Left Flank.',
    focus: state => [...hand('runeguard')(state), slot(you, 0)], accept: playsAt('runeguard', 0) },
  { id: 'enter-combat-2', title: 'Attack',
    text: 'Your Recruit stayed ready, so it can attack. Enter combat.', focus: () => [button], accept: is('end') },
  { id: 'attack', title: 'Choose a lane',
    text: 'Drag the Recruit onto the empty enemy lane at the far left, then press the button. An attacker may hit its own lane or one beside it.',
    focus: () => [slot(you, 1), slot(rival, 0), button],
    accept: (command, state) => command.type === 'attack' && command.attackers.length === 1 && definitionOf(state, command.attackers[0]) === 'crown-recruit' && command.lanes?.[command.attackers[0]] === 0 },
  { id: 'confirm', title: 'Nothing blocks it',
    text: 'The arrow points at an empty lane, so the attack goes straight to the opponent. If a card stood there, it would block automatically. Confirm combat.',
    focus: () => [button], accept: is('confirm-combat') },
  { id: 'end-turn-2', title: 'Pass the turn', text: 'The opponent is down to nine. End your turn.', focus: () => [button], accept: is('end') },
  { id: 'death', title: 'The last gift',
    text: 'Your Merchant blocked and fell. Its two energy stays in your death pool until this window closes. Drag Cleansing Light onto the wounded Recruit: it deals two damage and heals you for one.',
    focus: state => [...hand('cleansing-light')(state), slot(rival, 3), '.death-pool'],
    accept: (command, state) => command.type === 'play' && definitionOf(state, command.cardId) === 'cleansing-light' && definitionOf(state, command.target) === 'crown-recruit' && state.cards[command.target!]?.owner === rival },
  { id: 'close-death', title: 'Close the window', text: 'Unused death energy fades. Close the window to finish the combat.', focus: () => [button], accept: is('end') },
  { id: 'finish', title: 'You know the basics', next: 'Play on',
    text: 'Creatures make the energy, energy plays the cards, and anything that falls in defense can still pay for a last spell. Play on against the opponent, or head back and build a deck.' },
];

/** Index of the step that follows the n-th action step (0 means the very start). */
export function stepAfter(actions: number): number {
  if (actions <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < tutorialSteps.length; i++) if (tutorialSteps[i].accept && ++seen === actions) return i + 1;
  return tutorialSteps.length - 1;
}
export const actionCount = () => tutorialSteps.filter(step => step.accept).length;
export const playerCommands = (commands: CommandEnvelope[]) => commands.filter(envelope => envelope.actor === you).length;

/** Opponent coaching, shown while it plays. `from` is the number of opponent commands already made. */
export const opponentNotes: { from: number; title: string; text: string }[] = [
  { from: 0, title: 'Opponent’s opening', text: 'The opponent keeps their hand. Their cards are hidden from you, just as yours are from them.' },
  { from: 1, title: 'Their turn', text: 'They draw two, keep one, and deploy zero-cost creatures of their own. Press the glowing red button to step through each of their phases.' },
  { from: 5, title: 'Their combat', text: 'Their creatures are exhausted, so there is nothing to attack with yet. Continue.' },
  { from: 7, title: 'Their turn ends', text: 'Their creatures ready up now, just like yours did. Continue.' },
  { from: 8, title: 'Their second turn', text: 'The opponent’s creatures are ready. Watch what they do.' },
  { from: 11, title: 'Their attack is set', text: 'Their Recruit aims at your Right Wing. Blocking is automatic: your Merchant defends that lane, and it is only a 1/1. Check the arrows, then resolve combat.' },
  { from: 12, title: 'Their turn ends', text: 'The opponent passes. Continue.' },
];
export const opponentNote = (made: number) => [...opponentNotes].reverse().find(note => note.from <= made) ?? opponentNotes[0];

const mine = (state: GameState, definitionId: string, zone: 'hand' | 'board' = 'hand') => find(state, rival, definitionId, zone)!;
const draw = (state: GameState): Command => ({ type: 'choose', choiceId: state.pending!.id, option: (state.pending!.options as string[])[0], other: 'discard' });
/** The opponent's whole script. Entries are consumed in order; afterwards the regular bot takes over. */
const script: ((state: GameState) => Command)[] = [
  () => ({ type: 'mulligan', cardIds: [] }),
  draw,
  state => ({ type: 'play', cardId: mine(state, 'longvale-cutters'), slot: 1 }),
  state => ({ type: 'play', cardId: mine(state, 'goldfield-farmer'), slot: 2 }),
  state => ({ type: 'play', cardId: mine(state, 'crown-recruit'), slot: 3 }),
  () => ({ type: 'end' }),
  () => ({ type: 'attack', attackers: [] }),
  () => ({ type: 'end' }),
  draw,
  () => ({ type: 'end' }),
  state => { const recruit = mine(state, 'crown-recruit', 'board'); return { type: 'attack', attackers: [recruit], lanes: { [recruit]: 3 } }; },
  () => ({ type: 'confirm-combat' }),
  () => ({ type: 'end' }),
];
export const opponentMoves = (commands: CommandEnvelope[]) => commands.filter(envelope => envelope.actor === rival).length;
export const opponentCommand = (state: GameState, made: number): Command | null => script[made]?.(state) ?? null;
export const scriptFinished = (made: number) => made >= script.length;

export function startTutorial(): SavedSession {
  const starter = starterDefinitions.find(deck => deck.id === defaultDeckId) ?? starterDefinitions[0];
  const initial = createMatch(registry, [starter.cards, starter.cards], tutorialSeed, {
    mulligan: true,
    stack: [
      // Opening hand, then the two cards the mulligan brings in.
      ['goldfield-farmer', 'crown-recruit', 'merchant-of-tris-vale', 'tower-of-the-first-morning', 'aldric-runewarden', 'runeguard', 'dawn-banner'],
      // Opening hand, then the opponent's two draws (cards it cannot afford) and the next turn's pair.
      ['goldfield-farmer', 'longvale-cutters', 'crown-recruit', 'runeguard', 'crown-bulwark', 'tower-of-the-first-morning', 'aldric-runewarden', 'ban-vale-cavalry', 'battlefield-hymn'],
    ],
  });
  initial.players.p1.name = 'You';
  initial.players.p2.name = 'Sparring partner';
  return { initial, commands: [], mode: 'practice', deck: starter.id, skirmish: false, started: true, rewardEligible: false, tutorial: true };
}
