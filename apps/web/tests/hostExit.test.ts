import { afterEach, describe, expect, it, vi } from "vitest";
import { decisionPlayer } from "@realms/core";
import { MatchAuthority } from "@realms/multiplayer/authority";
import { registry } from "@realms/content";
import { RtcRoom } from "../src/features/multiplayer/lib/RtcRoom";
import { startMatch } from "../src/features/match/lib/session";

type Internals = {
  authority: MatchAuthority | null;
  connection: { open: boolean; send: (message: unknown) => void } | null;
  closed: boolean;
};
const listeners = new Map<string, Set<(event: unknown) => void>>();
afterEach(() => {
  listeners.clear();
  vi.unstubAllGlobals();
});
function hostRoom() {
  vi.stubGlobal("window", {
    addEventListener: (type: string, fn: (event: unknown) => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener: (type: string, fn: (event: unknown) => void) =>
      listeners.get(type)?.delete(fn),
  });
  const deck = { id: "d", name: "d", cards: [] };
  const room = new (RtcRoom as unknown as new (...args: unknown[]) => RtcRoom)(
    "host",
    "ABCDEFGH",
    "host",
    deck,
  );
  const inner = room as unknown as Internals;
  inner.authority = new MatchAuthority(registry, "m", startMatch(3));
  return { room, inner };
}
const fire = (type: string, event: unknown = {}) => listeners.get(type)?.forEach((fn) => fn(event));

describe("a host leaving an online match", () => {
  it("is asked to confirm while the match is running", () => {
    hostRoom();
    const event = { preventDefault: vi.fn(), returnValue: undefined as unknown };
    fire("beforeunload", event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.returnValue).toBe("");
  });

  it("concedes and tells the guest on the way out", () => {
    const { inner } = hostRoom();
    const sent: unknown[] = [];
    inner.connection = { open: true, send: (message) => sent.push(message) };
    expect(decisionPlayer(inner.authority!.fullState)).toBeDefined();
    fire("pagehide");
    expect(inner.authority!.fullState.outcome).toBe("p2");
    expect(sent.length).toBe(1);
  });

  it("does not ask or concede once the match is over or the room is left", () => {
    const { room, inner } = hostRoom();
    room.leave();
    const event = { preventDefault: vi.fn(), returnValue: undefined as unknown };
    fire("beforeunload", event);
    fire("pagehide");
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(inner.authority!.fullState.outcome).toBeNull();
  });
});
