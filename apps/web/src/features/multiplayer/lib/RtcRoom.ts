import type { DataConnection, Peer, PeerOptions } from "peerjs";
import { getProfile } from "../../profile/stores/profile";
import type { Command } from "@realms/contracts";
import { registry } from "@realms/content";
import { RULES_VERSION } from "@realms/core";
import { MatchAuthority } from "@realms/multiplayer/authority";
import {
  NETWORK_VERSION,
  parseClientMessage,
  parseHostMessage,
  type AttackPreview,
  type Forecast,
  type MatchAction,
  type MatchDeck,
  type MatchSnapshot,
} from "@realms/multiplayer/protocol";

export type RoomState = {
  role: "host" | "guest";
  code: string;
  phase: "connecting" | "waiting" | "playing" | "disconnected" | "error" | "closed";
  connected: boolean;
  busy: boolean;
  message: string;
  snapshot: MatchSnapshot | null;
};
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const newRoomCode = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(8)), (n) => alphabet[n % alphabet.length]).join(
    "",
  );
export const normalizeRoomCode = (value: string) => value.toUpperCase().replace(/[\s-]/g, "");
export const validRoomCode = (value: string) =>
  value.length === 8 && [...value].every((char) => alphabet.includes(char));
const peerId = (code: string) => `varhyr-v${NETWORK_VERSION}-${code}`;

/** Room-code signaling via PeerJS Cloud. All game packets use the reliable WebRTC data channel. */
export class RtcRoom {
  private peer: Peer | null = null;
  private connection: DataConnection | null = null;
  private authority: MatchAuthority | null = null;
  private guestToken: string | null = null;
  private token: string = crypto.randomUUID();
  private pending: MatchAction | null = null;
  private listeners = new Set<() => void>();
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private previews = new Map<string, (forecast: Forecast) => void>();
  private closed = false;
  private state: RoomState;
  private constructor(
    role: "host" | "guest",
    code: string,
    private name: string,
    private deck: MatchDeck,
    private back?: string,
  ) {
    this.state = {
      role,
      code,
      phase: "connecting",
      connected: false,
      busy: false,
      message: "Connecting to the room service…",
      snapshot: null,
    };
    if (role === "guest")
      try {
        // Keep the seat identity in this tab so a guest reload can rejoin the same host match.
        const key = `varhyr-room-seat-${code}`;
        this.token = sessionStorage.getItem(key) || this.token;
        sessionStorage.setItem(key, this.token);
      } catch {
        /* Reconnect within this page still works without storage. */
      }
  }
  static async host(name: string, deck: MatchDeck, back?: string) {
    const room = new RtcRoom("host", newRoomCode(), name, structuredClone(deck), back);
    await room.initialize();
    return room;
  }
  static async join(code: string, name: string, deck: MatchDeck, back?: string) {
    const normalized = normalizeRoomCode(code);
    if (!validRoomCode(normalized)) throw new Error("Enter the eight-character room code.");
    const room = new RtcRoom("guest", normalized, name, structuredClone(deck), back);
    await room.initialize();
    return room;
  }
  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  readonly getSnapshot = () => this.state;
  private publish(patch: Partial<RoomState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
  private later(callback: () => void, delay: number) {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      if (!this.closed) callback();
    }, delay);
    this.timers.add(timer);
    return timer;
  }
  private clearTimer(timer: ReturnType<typeof setTimeout>) {
    clearTimeout(timer);
    this.timers.delete(timer);
  }
  private async initialize() {
    const { Peer: PeerClass } = await import("peerjs");
    const options: PeerOptions = { debug: 0 };
    // Optional production/self-hosted signaling and TURN configuration. No credentials in source.
    if (import.meta.env.VITE_PEER_HOST)
      Object.assign(options, {
        host: import.meta.env.VITE_PEER_HOST,
        port: Number(import.meta.env.VITE_PEER_PORT) || 443,
        path: import.meta.env.VITE_PEER_PATH || "/",
        secure: import.meta.env.VITE_PEER_SECURE !== "false",
      });
    if (import.meta.env.VITE_RTC_ICE_SERVERS)
      options.config = { iceServers: JSON.parse(import.meta.env.VITE_RTC_ICE_SERVERS) };
    this.peer =
      this.state.role === "host"
        ? new PeerClass(peerId(this.state.code), options)
        : new PeerClass(options);
    const registration = this.later(() => {
      if (!this.peer?.open)
        this.publish({
          phase: "error",
          message: "The room service is not responding. Try again in a moment.",
        });
    }, 18000);
    this.peer.on("open", () => {
      this.clearTimer(registration);
      if (this.closed) return;
      if (this.state.role === "host")
        this.publish({
          phase: this.authority ? "disconnected" : "waiting",
          message: this.authority
            ? "Waiting for your opponent to reconnect."
            : "Room ready. Share the code with your opponent.",
        });
      else this.connectGuest();
    });
    this.peer.on("connection", (connection) => {
      if (this.state.role !== "host" || this.closed) {
        connection.close();
        return;
      }
      this.attachHost(connection);
    });
    this.peer.on("disconnected", () => {
      if (this.closed) return;
      if (!this.state.connected)
        this.publish({
          phase: "disconnected",
          message: "Room service disconnected. Reconnect to continue.",
        });
      this.later(() => {
        if (this.peer && !this.peer.destroyed && this.peer.disconnected) this.peer.reconnect();
      }, 1500);
    });
    this.peer.on("error", (error) => {
      if (this.closed) return;
      const message =
        error.type === "peer-unavailable"
          ? "Room not found. Check the code and keep the host’s tab open."
          : error.type === "unavailable-id"
            ? "This room code is already in use. Go back and host a new room."
            : error.type === "browser-incompatible"
              ? "This browser does not support WebRTC data connections."
              : error.type === "webrtc"
                ? "The browsers could not connect. Try another network or configure a TURN relay."
                : "Connection interrupted. Try reconnecting.";
      if (!this.state.connected) this.publish({ phase: "error", message, busy: false });
    });
  }
  private watchLink(connection: DataConnection, authenticated: () => boolean) {
    const pc = connection.peerConnection;
    // Background tabs throttle timers; silence is not evidence of a broken data channel.
    pc?.addEventListener("connectionstatechange", () => {
      if (this.closed || connection !== this.connection || !authenticated()) return;
      if (["disconnected", "failed", "closed"].includes(pc.connectionState)) {
        this.disconnect();
        return;
      }
      if (pc.connectionState === "connected") {
        if (this.state.role === "host" && this.authority) {
          this.publish({
            phase: "playing",
            connected: true,
            message: "Connected",
            snapshot: this.authority.snapshot("p1"),
          });
          this.safeSend(connection, this.authority.snapshot("p2"));
        } else this.sendHello(connection);
      }
    });
  }
  private sendHello(connection: DataConnection) {
    this.safeSend(connection, {
      type: "hello",
      version: NETWORK_VERSION,
      rules: RULES_VERSION,
      content: registry.version,
      token: this.token,
      name: this.name,
      avatar: getProfile().avatar,
      cardBack: this.back,
      deck: this.deck,
    });
  }
  private safeSend(connection: DataConnection, message: unknown) {
    if (!connection.open) return false;
    try {
      connection.send(message);
      return true;
    } catch {
      if (connection === this.connection) this.disconnect();
      return false;
    }
  }
  private wire(input: unknown) {
    if (JSON.stringify(input).length > 1_000_000)
      throw new Error("Multiplayer message is too large.");
    return input;
  }
  private attachHost(connection: DataConnection) {
    let authenticated = false;
    const deadline = this.later(() => {
      if (!authenticated) connection.close();
    }, 15000);
    connection.on("open", () => this.watchLink(connection, () => authenticated));
    connection.on("data", (input) => {
      try {
        const message = parseClientMessage(this.wire(input));
        if (message.type === "hello") {
          MatchAuthority.validateHello(message, registry);
          if (this.guestToken && message.token !== this.guestToken)
            throw new Error("This room already belongs to another opponent.");
          if (!this.authority) {
            this.guestToken = message.token;
            this.authority = new MatchAuthority(
              registry,
              crypto.randomUUID(),
              [this.deck, message.deck],
              [this.name, message.name],
              crypto.getRandomValues(new Uint32Array(1))[0],
              [getProfile().avatar, message.avatar],
              [this.back, message.cardBack],
            );
          }
          authenticated = true;
          this.clearTimer(deadline);
          const previous = this.connection;
          this.connection = connection;
          if (previous && previous !== connection) previous.close();
          this.publish({
            phase: "playing",
            connected: true,
            busy: false,
            message: "Connected",
            snapshot: this.authority.snapshot("p1"),
          });
          this.safeSend(connection, this.authority.snapshot("p2"));
        } else if (authenticated && connection === this.connection && this.authority) {
          if (message.type === "action") {
            const result = this.authority.act("p2", message.action);
            this.safeSend(connection, result);
            this.publish({ snapshot: this.authority.snapshot("p1") });
          } else if (message.type === "preview")
            this.safeSend(connection, {
              type: "preview",
              id: message.id,
              forecast: this.authority.forecast("p2", message.draft),
            });
        } else throw new Error("Join the room before sending moves.");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid multiplayer message.";
        if (authenticated && this.authority) {
          const ack =
            input &&
            typeof input === "object" &&
            (input as { action?: { id?: unknown } }).action?.id;
          this.safeSend(
            connection,
            this.authority.snapshot("p2", typeof ack === "string" ? ack : undefined, message),
          );
        } else {
          this.safeSend(connection, { type: "reject", message });
          this.later(() => connection.close(), 200);
        }
      }
    });
    connection.on("close", () => {
      this.clearTimer(deadline);
      if (this.connection === connection) this.disconnect();
    });
    connection.on("error", () => {
      if (this.connection === connection) this.disconnect();
    });
  }
  private connectGuest() {
    if (!this.peer || this.closed) return;
    this.publish({
      phase: "connecting",
      connected: false,
      message: "Connecting to your opponent…",
    });
    const old = this.connection;
    this.connection = null;
    old?.close();
    // PeerJS's JSON serializer rejects frames >=16.3 KB. Binary mode chunks growing views/event logs.
    const connection = this.peer.connect(peerId(this.state.code), {
      reliable: true,
      serialization: "binary",
      label: "varhyr-match",
    });
    this.connection = connection;
    let authenticated = false;
    const deadline = this.later(() => {
      if (!this.state.connected) {
        connection.close();
        this.publish({
          phase: "error",
          message: "Could not reach the host. Check the code, network, and host tab.",
        });
      }
    }, 20000);
    connection.on("open", () => {
      this.watchLink(connection, () => authenticated);
      this.sendHello(connection);
    });
    connection.on("data", (input) => {
      if (connection !== this.connection) return;
      try {
        const message = parseHostMessage(this.wire(input));
        if (message.type === "reject") {
          this.publish({ phase: "error", connected: false, busy: false, message: message.message });
          this.clearTimer(deadline);
          return;
        }
        if (message.type === "ping") {
          this.safeSend(connection, { type: "pong" });
          return;
        }
        if (message.type === "preview") {
          const resolve = this.previews.get(message.id);
          this.previews.delete(message.id);
          resolve?.(message.forecast);
          return;
        }
        if (
          message.seat !== "p2" ||
          message.view.rulesVersion !== RULES_VERSION ||
          message.view.contentVersion !== registry.version ||
          Object.values(message.view.cards).some((card) => !registry.cards[card.definitionId])
        )
          throw new Error("Host rules or card content differs. Update both browsers.");
        if (this.state.snapshot && message.matchId !== this.state.snapshot.matchId)
          throw new Error("The host started a different match. Join a new room.");
        this.clearTimer(deadline);
        authenticated = true;
        const reconnecting = !this.state.connected;
        if (message.ack === this.pending?.id) this.pending = null;
        this.publish({
          phase: "playing",
          connected: true,
          busy: !!this.pending,
          message: "Connected",
          snapshot: message,
        });
        if (reconnecting && this.pending)
          this.safeSend(connection, { type: "action", action: this.pending });
      } catch (error) {
        this.publish({
          phase: "error",
          connected: false,
          busy: false,
          message: error instanceof Error ? error.message : "Invalid host message.",
        });
        connection.close();
      }
    });
    connection.on("close", () => {
      this.clearTimer(deadline);
      if (connection === this.connection && this.state.phase !== "error") this.disconnect();
    });
    connection.on("error", () => {
      if (connection === this.connection) this.disconnect();
    });
  }
  private disconnect() {
    if (!this.closed)
      this.publish({
        phase: "disconnected",
        connected: false,
        busy: !!this.pending,
        message:
          this.state.role === "host"
            ? "Opponent disconnected. The match is paused until they reconnect."
            : "Connection lost. Reconnect to restore the current board.",
      });
  }
  act(command: Command) {
    return this.perform({ kind: "command", command });
  }
  undoChannel(cardId: string) {
    return this.perform({ kind: "undo-channel", cardId });
  }
  /** What the next combat would do for the attackers being drafted. The host holds the real state, so a guest asks it. */
  forecast(draft: AttackPreview | null): Promise<Forecast> {
    if (!draft?.attackers.length || !this.state.connected) return Promise.resolve(null);
    if (this.state.role === "host")
      return Promise.resolve(this.authority?.forecast("p1", draft) ?? null);
    const connection = this.connection;
    if (!connection) return Promise.resolve(null);
    return new Promise((resolve) => {
      const id = crypto.randomUUID(),
        timer = setTimeout(() => {
          this.previews.delete(id);
          resolve(null);
        }, 4000);
      this.previews.set(id, (forecast) => {
        clearTimeout(timer);
        resolve(forecast);
      });
      if (!this.safeSend(connection, { type: "preview", id, draft })) {
        clearTimeout(timer);
        this.previews.delete(id);
        resolve(null);
      }
    });
  }
  private perform(intent: MatchAction["intent"]) {
    if (!this.state.connected || this.state.busy || !this.state.snapshot)
      throw new Error("Wait for the connection or the previous move.");
    const action: MatchAction = {
      id: crypto.randomUUID(),
      revision: this.state.snapshot.view.revision,
      intent,
    };
    if (this.state.role === "host") {
      const result = this.authority!.act("p1", action);
      this.publish({ snapshot: result });
      this.safeSend(this.connection!, this.authority!.snapshot("p2"));
    } else {
      this.pending = action;
      this.publish({ busy: true });
      if (!this.safeSend(this.connection!, { type: "action", action })) this.disconnect();
    }
  }
  reconnect() {
    if (this.closed) return;
    if (this.peer?.disconnected) {
      this.publish({ phase: "connecting", message: "Reconnecting to the room service…" });
      this.peer.reconnect();
    } else if (this.state.role === "guest") this.connectGuest();
    else
      this.publish({
        phase: "disconnected",
        message: "Ask your opponent to press Reconnect. Keep this tab open.",
      });
  }
  leave() {
    this.closed = true;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    this.peer?.destroy();
    this.connection = null;
    this.publish({ phase: "closed", connected: false, busy: false, message: "Room closed." });
  }
}
