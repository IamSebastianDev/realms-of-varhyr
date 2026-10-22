import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registry } from "@realms/content";
import { draftPresets, winsOf } from "@realms/draft";
import { DraftTableHost, TableClient } from "../src/draftRoom";
import { buildBotDeck } from "@realms/draft";

const preset = draftPresets[0]!;
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

/** A host with its own browser in seat 0. Guests join over in-memory links. */
function room(options: { pickMs?: number; awayMs?: number } = {}) {
  const host = new DraftTableHost(
    { registry, preset, code: "ROOM1234", faction: "bright-marches", ...options },
    "host-token",
  );
  const client = (role: "host" | "guest") => new TableClient(role, "ROOM1234", registry);
  const own = client("host");
  host.connectLocal(own, { token: "host-token", name: "Host" });
  const guest = (name: string, token = name) => {
    const me = client("guest");
    const handler = host.accept({
      send: (message) => me.receive(JSON.parse(JSON.stringify(message))),
      close: () => handler.closed(),
    });
    me.attach((message) => handler.receive(JSON.parse(JSON.stringify(message))));
    me.hello({ token, name });
    return { client: me, drop: () => handler.closed() };
  };
  return { host, own, guest };
}
const pickFirst = (client: TableClient) => {
  const run = client.getSnapshot().run!;
  client.pick(run.draft.held[0]![0]!);
};
const chosen = (client: TableClient) =>
  client.getSnapshot().waiting.includes(client.getSnapshot().run!.table!.names[0]);
/** Everyone takes the first card of their pack, and brings Crownlands to the second half. */
const draftAll = (clients: TableClient[]) => {
  while (clients[0]!.getSnapshot().run!.stage === "draft")
    for (const client of clients) {
      const run = client.getSnapshot().run!;
      if (!chosen(client)) continue;
      if (run.draft.awaiting) client.faction("crownlands");
      else if (run.draft.held[0]!.length) pickFirst(client);
    }
};

describe("a faction draft room", () => {
  it("seats the host first, lets guests ready up, fills empty seats with bots, and closes the door once it starts", () => {
    const { host, own, guest } = room();
    const one = guest("Ana");
    expect(one.client.getSnapshot().lobby.map((seat) => seat.name)).toEqual(["Host", "Ana", ""]);
    expect(host.canStart).toBe(false); // Ana has not paid and readied up
    one.client.ready(true);
    expect(host.canStart).toBe(true);
    host.start(5, "table-1");
    expect(own.getSnapshot().phase).toBe("table");
    expect(own.getSnapshot().run!.table).toMatchObject({
      seat: 0,
      humans: [true, true, false],
      host: true,
    });
    expect(own.getSnapshot().faction).toBe("bright-marches");
    expect(one.client.getSnapshot().faction).toBe("bright-marches");
    expect(one.client.getSnapshot().run!.table!.names[0]).toBe("Ana");
    const late = guest("Late");
    expect(late.client.getSnapshot().phase).toBe("error");
    // A guest who got the wrong build is turned away at once.
    const stale = new TableClient("guest", "ROOM1234", registry);
    const handler = host.accept({
      send: (message) => stale.receive(message),
      close: () => undefined,
    });
    handler.receive({
      type: "join",
      version: 0,
      rules: "x",
      content: "y",
      token: "z",
      name: "Old",
    });
    expect(stale.getSnapshot().phase).toBe("error");
  });

  it("turns away a join with other rules, and a guest who leaves the lobby frees the seat", () => {
    const { host, guest } = room();
    const one = guest("Ana");
    one.client.leave();
    expect(host.canStart).toBe(true);
    expect(
      guest("Ben")
        .client.getSnapshot()
        .lobby.map((seat) => seat.name),
    ).toEqual(["Host", "Ben", ""]);
  });

  it("runs a whole draft: every pick waits for both people, time-outs pick for the slow, decks and matches follow", () => {
    const { host, own, guest } = room({ pickMs: 10_000 });
    const one = guest("Ana");
    one.client.ready(true);
    host.start(8, "table-2");
    pickFirst(own.getSnapshot().run!.draft.held[0]!.length ? own : own);
    expect(one.client.getSnapshot().run!.draft.step).toBe(0); // Ana has not chosen
    expect(own.getSnapshot().waiting).toEqual(["Ana"]);
    vi.advanceTimersByTime(10_000);
    expect(own.getSnapshot().run!.draft.step).toBe(1); // a bot chose for her
    draftAll([own, one.client]);
    expect(own.getSnapshot().run!.stage).toBe("build");
    expect(own.getSnapshot().run!.draft.picks[0]).toHaveLength(48);
    expect(one.client.getSnapshot().run!.draft.picks[0]).toHaveLength(48);
    // Decks: one person hands theirs in, the other is built for them when time runs out.
    own.deck(buildBotDeck(own.getSnapshot().run!.draft.picks[0]!, registry));
    expect(own.getSnapshot().run!.stage).toBe("build");
    vi.advanceTimersByTime(300_000);
    expect(own.getSnapshot().run!.stage).toBe("matches");
    expect(own.getSnapshot().run!.matches).toHaveLength(4);
    // Against the bot, you play at home and report the result.
    const vsBot = own.getSnapshot().run!.matches.findIndex((match) => !match.table!.human);
    own.report(own.getSnapshot().run!.matches[vsBot]!.table!.index, "won");
    expect(winsOf(own.getSnapshot().run!)).toBe(1);
    expect(
      one.client
        .getSnapshot()
        .run!.matches.every((match) => match.result === null || !match.table!.human),
    ).toBe(true);
    // The match with the other person is live: it starts when both are in, and a concession is the result.
    const live = own.getSnapshot().run!.matches.find((match) => match.table!.human)!.table!.index;
    own.joinMatch(live);
    expect(own.getSnapshot().matches[live]?.snapshot).toBeUndefined();
    one.client.joinMatch(live);
    const mine = own.getSnapshot().matches[live]!.snapshot!,
      hers = one.client.getSnapshot().matches[live]!.snapshot!;
    expect([mine.seat, hers.seat].sort()).toEqual(["p1", "p2"]);
    expect(mine.view.players[mine.seat].deckCount).toBeGreaterThan(0);
    one.client.act(live, { kind: "command", command: { type: "concede" } });
    expect(winsOf(own.getSnapshot().run!)).toBe(2);
    expect(winsOf(one.client.getSnapshot().run!)).toBe(0);
  });

  it("waits for every person to choose a faction between the halves, and chooses for the slow when time runs out", () => {
    const { host, own, guest } = room({ pickMs: 10_000 });
    const one = guest("Ana");
    one.client.ready(true);
    host.start(6, "table-5");
    // Play the first half: both people take the first card of each pack.
    while (!own.getSnapshot().run!.draft.awaiting)
      for (const client of [own, one.client]) if (chosen(client)) pickFirst(client);
    expect(own.getSnapshot().waiting.sort()).toEqual(["Ana", "Host"]);
    expect(own.getSnapshot().run!.draft.held[0]).toEqual([]);
    own.faction("black-host");
    expect(own.getSnapshot().run!.draft.awaiting).toBe(true);
    expect(one.client.getSnapshot().run!.draft.factions).toEqual([null, null, null]); // hidden until she has chosen too
    expect(own.getSnapshot().waiting).toEqual(["Ana"]);
    vi.advanceTimersByTime(10_000);
    const run = own.getSnapshot().run!;
    expect(run.draft.awaiting).toBe(false);
    expect(run.draft.factions[0]).toBe("black-host");
    expect(run.draft.factions[1]).toBeTruthy();
    expect(one.client.getSnapshot().run!.draft.factions[0]).toBe(run.draft.factions[1]); // her own choice, seen from her seat
    expect(own.getSnapshot().deadline).not.toBeNull(); // the second half has its own clock
  });

  it("hands a guest who leaves to a bot, and a guest who is away too long", () => {
    const { host, own, guest } = room({ awayMs: 5_000 });
    const one = guest("Ana"),
      two = guest("Ben");
    one.client.ready(true);
    two.client.ready(true);
    host.start(3, "table-3");
    one.client.leave();
    expect(own.getSnapshot().run!.table!.humans).toEqual([true, false, true]);
    two.drop();
    pickFirst(own);
    expect(own.getSnapshot().waiting).toEqual(["Ben"]); // away, but the seat is still his for now
    vi.advanceTimersByTime(5_000);
    expect(own.getSnapshot().run!.table!.humans).toEqual([true, false, false]);
    expect(own.getSnapshot().run!.draft.step).toBeGreaterThan(0);
  });

  it("tells every seat when the room closes", () => {
    const { host, own, guest } = room();
    const one = guest("Ana");
    one.client.ready(true);
    host.start(2, "table-4");
    expect(one.client.getSnapshot().phase).toBe("table");
    host.close("The host left.");
    expect(one.client.getSnapshot().phase).toBe("closed");
  });
});
