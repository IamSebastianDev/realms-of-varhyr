import type { Command, CommandEnvelope, GameState, PlayerId } from "@realms/contracts";
import { decisionPlayer } from "@realms/core";
import { MatchAuthority } from "@realms/multiplayer/authority";
import type {
  AttackPreview,
  Forecast,
  MatchAction,
  MatchSnapshot,
} from "@realms/multiplayer/protocol";
import type { MatchRoom, RoomView } from "./MatchSession";

/** The player on the other side of a loopback room. It reads the authority's state like a host-side seat and sends commands
 * through the same `act` call a remote client would. */
export type Opponent = {
  seat: PlayerId;
  /** The command to play now, or null to wait. Receives the authority's full state and command log. */
  play: (state: GameState, log: readonly CommandEnvelope[]) => Command | null;
  /** Milliseconds to wait before playing. */
  delay: (state: GameState) => number;
};

/** A match against someone on this machine: the same authority an online host runs, with the other seat played in-process.
 * With no opponent both seats are people sharing the screen (hot seat). */
export class LoopbackRoom implements MatchRoom {
  private listeners = new Set<() => void>();
  private seat: PlayerId = "p1";
  private hold = false;
  private gated: Command | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private view: RoomView;
  private closed = false;
  private error: string | undefined;
  constructor(
    private authority: MatchAuthority,
    private opponent?: Opponent,
  ) {
    if (opponent) this.seat = opponent.seat === "p1" ? "p2" : "p1";
    this.view = this.build();
    this.schedule();
  }
  private build(): RoomView {
    const seats = { p1: this.authority.snapshot("p1"), p2: this.authority.snapshot("p2") };
    if (this.error) seats[this.seat] = { ...seats[this.seat], error: this.error };
    const thinking =
      !!this.opponent &&
      !this.authority.fullState.outcome &&
      decisionPlayer(this.authority.fullState) === this.opponent.seat;
    return {
      role: "host",
      code: "",
      phase: "playing",
      connected: true,
      busy: false,
      message: "",
      snapshot: seats[this.seat],
      seats,
      log: this.authority.log,
      local: true,
      hotseat: !this.opponent,
      bot: this.opponent ? { thinking, gate: this.gated } : null,
    };
  }
  private publish() {
    this.view = this.build();
    for (const listener of this.listeners) listener();
  }
  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  readonly getSnapshot = () => this.view;

  /** Hot seat: which player's view the screen shows. */
  setSeat(seat: PlayerId) {
    if (this.opponent || seat === this.seat) return;
    this.seat = seat;
    this.publish();
  }
  /** The screen is still showing the last move; the opponent waits until it has finished. */
  setHold(hold: boolean) {
    if (hold === this.hold) return;
    this.hold = hold;
    if (hold) this.clearTimer();
    else this.schedule();
  }
  /** The opponent has stopped before a phase change and waits for the player to carry on. */
  advanceOpponent() {
    const command = this.gated;
    if (!command) return;
    this.gated = null;
    this.playOpponent(command);
  }

  private submit(seat: PlayerId, intent: MatchAction["intent"]) {
    const action: MatchAction = {
      id: crypto.randomUUID(),
      revision: this.authority.snapshot(seat).view.revision,
      intent,
    };
    const result = this.authority.act(seat, action);
    if (seat !== this.opponent?.seat) this.error = result.error;
    this.publish();
    this.schedule();
  }
  private human(actor?: PlayerId): PlayerId {
    return this.opponent ? this.seat : (actor ?? decisionPlayer(this.authority.fullState));
  }
  act(command: Command, actor?: PlayerId) {
    this.submit(this.opponent ? this.seat : (actor ?? decisionPlayer(this.authority.fullState)), {
      kind: "command",
      command,
    });
  }
  undoChannel(cardId: string, seat?: PlayerId) {
    this.submit(this.human(seat), { kind: "undo-channel", cardId });
  }
  forecast(draft: AttackPreview | null): Promise<Forecast> {
    return Promise.resolve(
      draft?.attackers.length ? this.authority.forecast(this.human(), draft) : null,
    );
  }
  reconnect() {}
  leave() {
    this.closed = true;
    this.clearTimer();
    this.listeners.clear();
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
  /** Decide whether the opponent moves now, soon, or waits for the player. */
  private schedule() {
    this.clearTimer();
    const { opponent, authority } = this,
      state = authority.fullState;
    if (
      this.closed ||
      !opponent ||
      state.outcome ||
      this.hold ||
      decisionPlayer(state) !== opponent.seat
    ) {
      if (this.gated !== null) {
        this.gated = null;
        this.publish();
      }
      return;
    }
    const command = opponent.play(state, authority.log);
    if (!command) return;
    // Phase changes wait for the player to press the button, so they see what the opponent did first.
    if (
      command.type === "confirm-combat" ||
      (command.type === "end" && state.combat?.stage !== "response")
    ) {
      if (this.gated === null) {
        this.gated = command;
        this.publish();
      }
      return;
    }
    this.gated = null;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.playOpponent(command);
    }, opponent.delay(state));
  }
  private playOpponent(planned: Command) {
    const { opponent, authority } = this;
    if (
      this.closed ||
      !opponent ||
      authority.fullState.outcome ||
      decisionPlayer(authority.fullState) !== opponent.seat
    )
      return;
    // The script may have moved on while we waited; ask again, and fall back to what was planned.
    this.submit(opponent.seat, {
      kind: "command",
      command: opponent.play(authority.fullState, authority.log) ?? planned,
    });
  }
}

export type { MatchSnapshot };
