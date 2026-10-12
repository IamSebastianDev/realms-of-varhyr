import type { CommandEnvelope, GameState, PlayerId, PlayerView, Registry } from '../../../packages/contracts/src';
import { apply, projectForPlayer, RULES_VERSION } from '../../../packages/core/src';
import { NETWORK_VERSION, parseHostMessage, type MatchSnapshot } from '../../../packages/multiplayer/src/protocol';

/**
 * A replay is what one seat saw, step by step: the same views the game gives that seat while playing.
 * It holds your own hand and everything public, and never the opponent's hand, library, or the shuffle seed.
 */
export const REPLAY_KIND = 'varhyr-replay';
export type ReplayFile = { kind: typeof REPLAY_KIND; version: 1; rules: string; content: string; matchId: string; seat: PlayerId; recordedAt: string; steps: MatchSnapshot[] };

// Legal actions are for playing, not for watching; they carry nothing a replay needs.
const watchable = (view: PlayerView): PlayerView => ({ ...structuredClone(view), legal: { actor: view.legal.actor, playable: [], energy: [], activations: [], attackers: [], lanes: {}, canEnd: false } });
const stepOf = (view: PlayerView, seat: PlayerId, matchId: string): MatchSnapshot => ({ type: 'snapshot', version: NETWORK_VERSION, matchId, seat, view: watchable(view), undoable: [], forecast: null });
const wrap = (steps: MatchSnapshot[], seat: PlayerId, matchId: string): ReplayFile => ({ kind: REPLAY_KIND, version: 1, rules: RULES_VERSION, content: steps[0].view.contentVersion, matchId, seat, recordedAt: new Date().toISOString(), steps });

/** A match played on this device: view it from one seat after every accepted command. */
export function localReplay(initial: GameState, commands: CommandEnvelope[], seat: PlayerId, registry: Registry, matchId: string): ReplayFile {
  let state = structuredClone(initial);
  const steps = [stepOf(projectForPlayer(state, seat, registry), seat, matchId)];
  for (const envelope of commands) {
    const result = apply(state, envelope, registry);
    if (result.error) throw new Error(result.error);
    state = result.state;
    steps.push(stepOf(projectForPlayer(state, seat, registry), seat, matchId));
  }
  return wrap(steps, seat, matchId);
}

/** An online match: the snapshots this seat received are already everything it was allowed to see. */
export function onlineReplay(history: MatchSnapshot[], seat: PlayerId): ReplayFile {
  return wrap(history.map(snapshot => stepOf(snapshot.view, seat, snapshot.matchId)), seat, history[0].matchId);
}

export function parseReplay(text: string, registry: Registry): ReplayFile {
  let data: Partial<ReplayFile>;
  try { data = JSON.parse(text); } catch { throw new Error('This file is not a replay.'); }
  if (!data || data.kind !== REPLAY_KIND || data.version !== 1 || !Array.isArray(data.steps) || !data.steps.length || data.steps.length > 5000 || (data.seat !== 'p1' && data.seat !== 'p2')) throw new Error('This file is not a Realms of Varhyr replay.');
  if (data.rules !== RULES_VERSION || data.content !== registry.version) throw new Error('This replay was recorded with a different version of the game.');
  const seat = data.seat;
  const steps = data.steps.map(step => {
    const message = parseHostMessage(step);
    if (message.type !== 'snapshot' || message.seat !== seat) throw new Error('This replay is damaged.');
    return message;
  });
  return { kind: REPLAY_KIND, version: 1, rules: data.rules, content: data.content, matchId: String(data.matchId ?? 'replay'), seat, recordedAt: String(data.recordedAt ?? ''), steps };
}
