import type { Command, PlayerId } from "@realms/contracts";
import type { TableClient, TableRoomState } from "@realms/multiplayer/draftRoom";
import type { AttackPreview, Forecast } from "@realms/multiplayer/protocol";
import type { MatchRoom, RoomView } from "../../match/MatchSession";

/**
 * A live match of a draft table, as the match screen sees any online room. The host's browser holds the real match;
 * leaving the screen does not leave the table, so the match can be picked up again from the draft overview.
 */
export class TableMatchRoom implements MatchRoom {
  private cached: { state: TableRoomState; view: RoomView } | null = null;
  constructor(
    private client: TableClient,
    private index: number,
    private reconnectTable: () => void,
  ) {}
  readonly subscribe = (listener: () => void) => this.client.subscribe(listener);
  readonly getSnapshot = (): RoomView => {
    const state = this.client.getSnapshot();
    if (this.cached?.state === state) return this.cached.view;
    const match = state.matches[this.index];
    const view: RoomView = {
      role: state.role,
      code: state.code,
      phase: match?.snapshot ? (state.connected ? "playing" : "disconnected") : "waiting",
      connected: state.connected,
      busy: !!match?.busy,
      message: match?.message || state.message,
      snapshot: match?.snapshot ?? null,
    };
    this.cached = { state, view };
    return view;
  };
  act = (command: Command, _actor?: PlayerId) =>
    this.client.act(this.index, { kind: "command", command });
  undoChannel = (cardId: string) => this.client.act(this.index, { kind: "undo-channel", cardId });
  forecast = (draft: AttackPreview | null): Promise<Forecast> =>
    this.client.forecast(this.index, draft);
  reconnect = () => this.reconnectTable();
  leave = () => this.client.forgetMatch(this.index);
}
