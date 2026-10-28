import type {
  Command,
  CommandEnvelope,
  GameState,
  PlayerId,
  PlayerView,
  Registry,
} from "@realms/contracts";
import {
  presentationState,
  type AttackPreview,
  type Forecast,
  type MatchSnapshot,
} from "@realms/multiplayer/protocol";
import type { RoomState } from "../../multiplayer/lib/RtcRoom";
import { onlineReplay, parseReplay, type ReplayFile } from "../lib/replayFile";

export type MatchFrame = { state: GameState; view: PlayerView };
export type MatchConnection = Pick<RoomState, "role" | "code" | "connected" | "busy" | "message">;
/** Every match, on this machine or across the network, is a room that hands out per-seat snapshots. */
export type RoomView = RoomState & {
  /** Every seat this machine may look at. A remote room only knows its own seat. */
  seats?: Partial<Record<PlayerId, MatchSnapshot>>;
  /** The authority's command log, when this machine hosts the match. */
  log?: readonly CommandEnvelope[];
  /** Played on this machine; there is no network connection to show. */
  local?: boolean;
  /** Two people share the screen. */
  hotseat?: boolean;
  /** An in-process opponent: whether it is working out a move, or waiting for the player to carry on. */
  bot?: { thinking: boolean; gate: Command | null } | null;
};
export type MatchRoom = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => RoomView;
  act: (command: Command, actor?: PlayerId) => void;
  undoChannel: (cardId: string, seat?: PlayerId) => void;
  forecast: (draft: AttackPreview | null) => Promise<Forecast>;
  reconnect: () => void;
  leave: () => void;
  setSeat?: (seat: PlayerId) => void;
  setHold?: (hold: boolean) => void;
  advanceOpponent?: () => void;
};
export type SessionSnapshot = {
  initial: GameState;
  state: GameState;
  commands: readonly CommandEnvelope[];
  /** The seat this machine plays; null when two people share it. */
  seat: PlayerId | null;
  hotseat: boolean;
  matchId: string;
  revision: number;
  error?: string;
  historySteps: { who: PlayerId; label: string }[];
  connection: MatchConnection | null;
  forecast: MatchSnapshot["forecast"];
  bot: { thinking: boolean; gate: Command | null } | null;
};

/** MatchApp consumes this reader for every mode. A session only ever sees what a seat is allowed to see. */
export interface MatchSessionReader {
  readonly subscribe: (listener: () => void) => () => void;
  readonly getSnapshot: () => SessionSnapshot;
  frame: (index: number | null, viewer: PlayerId) => MatchFrame;
  undoable: (viewer: PlayerId) => string[];
  leave: () => void;
}
export type MatchSession = LiveMatchSession | ReplayMatchSession;
const clamp = (index: number, length: number) => Math.max(0, Math.min(index, length));
type Step = Partial<Record<PlayerId, MatchSnapshot>>;
const anySeat = (step: Step) => (step.p1 ?? step.p2)!;
const eventSeq = (step: Step) => anySeat(step).view.events.at(-1)?.seq ?? 0;
const recordedSteps = (history: Step[]) =>
  history.slice(1).map((step, index) => ({
    who: anySeat(step).view.active,
    label:
      anySeat(step)
        .view.events.filter((event) => event.seq > eventSeq(history[index]))
        .at(-1)?.message ?? "Update",
  }));

/** A running match: on this machine (a loopback room) or against someone else (a WebRTC room). Both behave the same. */
export class LiveMatchSession implements MatchSessionReader {
  readonly kind = "live";
  /** The deck you brought to an online room; the match itself only shows the cards you have seen. */
  played?: { id: string; name: string; cards: string[] };
  private listeners = new Set<() => void>();
  private history: Step[] = [];
  private snapshot: SessionSnapshot;
  private unsubscribe: () => void;
  constructor(private room: MatchRoom) {
    const view = room.getSnapshot(),
      first = view.snapshot;
    if (!first) throw new Error("Join a match before creating an online session.");
    this.history = [LiveMatchSession.step(view)];
    const initial = presentationState(first);
    this.snapshot = {
      initial,
      state: initial,
      commands: view.log ?? [],
      seat: view.hotseat ? null : first.seat,
      hotseat: !!view.hotseat,
      matchId: first.matchId,
      revision: first.view.revision,
      historySteps: [],
      connection: view.local ? null : view,
      forecast: first.forecast,
      error: first.error,
      bot: view.bot ?? null,
    };
    this.unsubscribe = room.subscribe(() => this.receive());
  }
  /** Played on this machine rather than over a connection. */
  get local() {
    return !!this.room.getSnapshot().local;
  }
  private static step(view: RoomView): Step {
    return view.seats ?? (view.snapshot ? { [view.snapshot.seat]: view.snapshot } : {});
  }
  private receive() {
    const view = this.room.getSnapshot(),
      next = view.snapshot;
    if (next) {
      const step = LiveMatchSession.step(view),
        last = this.history.at(-1)!;
      // Retries refresh a frame. Channel undo drops the branch of history that was undone.
      this.history =
        anySeat(last).view.revision === next.view.revision
          ? [...this.history.slice(0, -1), step]
          : [...this.history.filter((frame) => eventSeq(frame) < eventSeq(step)), step];
      this.snapshot = {
        ...this.snapshot,
        state: presentationState(next),
        commands: view.log ?? [],
        seat: view.hotseat ? null : next.seat,
        revision: next.view.revision,
        historySteps: recordedSteps(this.history),
        forecast: next.forecast,
        error: next.error,
        connection: view.local ? null : view,
        bot: view.bot ?? null,
      };
    } else this.snapshot = { ...this.snapshot, connection: view.local ? null : view };
    for (const listener of this.listeners) listener();
  }
  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  readonly getSnapshot = () => this.snapshot;
  frame(index: number | null, viewer: PlayerId): MatchFrame {
    const step =
      this.history[
        index === null ? this.history.length - 1 : clamp(index, this.history.length - 1)
      ];
    const snapshot = step[viewer] ?? anySeat(step);
    return { state: presentationState(snapshot), view: snapshot.view };
  }
  undoable(viewer: PlayerId) {
    const step = this.history.at(-1)!;
    return (step[viewer] ?? anySeat(step)).undoable;
  }
  act(command: Command, actor?: PlayerId) {
    this.room.act(command, actor);
  }
  undoChannel(cardId: string, viewer?: PlayerId) {
    this.room.undoChannel(cardId, viewer);
  }
  /** What the next combat would do for the attackers being chosen; answered by whoever holds the real state. */
  forecast(draft: AttackPreview | null) {
    return this.room.forecast(draft);
  }
  setSeat(seat: PlayerId) {
    this.room.setSeat?.(seat);
  }
  setHold(hold: boolean) {
    this.room.setHold?.(hold);
  }
  advanceOpponent() {
    this.room.advanceOpponent?.();
  }
  reconnect() {
    this.room.reconnect();
  }
  exportReplay(viewer: PlayerId, _matchId: string) {
    return onlineReplay(
      this.history.map((step) => step[viewer] ?? anySeat(step)),
      step0(this.history, viewer),
    );
  }
  leave() {
    this.unsubscribe();
    this.room.leave();
    this.listeners.clear();
  }
}
const step0 = (history: Step[], viewer: PlayerId): PlayerId =>
  (history[0][viewer] ?? anySeat(history[0])).seat;

/** A recording has no connection or command methods, and cannot earn rewards. */
export class ReplayMatchSession implements MatchSessionReader {
  readonly kind = "replay";
  private snapshot: SessionSnapshot;
  constructor(private file: ReplayFile) {
    const first = file.steps[0],
      last = file.steps.at(-1)!;
    this.snapshot = {
      initial: presentationState(first),
      state: presentationState(last),
      commands: [],
      seat: file.seat,
      hotseat: false,
      matchId: file.matchId,
      revision: last.view.revision,
      historySteps: recordedSteps(file.steps.map((step) => ({ [step.seat]: step }))),
      connection: null,
      forecast: null,
      bot: null,
    };
  }
  static fromText(text: string, registry: Registry) {
    return new ReplayMatchSession(parseReplay(text, registry));
  }
  readonly subscribe = (_listener: () => void) => () => {};
  readonly getSnapshot = () => this.snapshot;
  frame(index: number | null, _viewer: PlayerId): MatchFrame {
    const snapshot =
      this.file.steps[
        index === null ? this.file.steps.length - 1 : clamp(index, this.file.steps.length - 1)
      ];
    return { state: presentationState(snapshot), view: snapshot.view };
  }
  undoable(_viewer: PlayerId) {
    return [];
  }
  leave() {}
}
