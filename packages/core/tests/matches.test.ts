import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileContent } from "@realms/content/compiler";
import { recordedAbilities } from "@realms/testing/recordedMatch";
import { replay } from "../src";

// Saved real matches, each pinned with the card pool it was played on. They must keep replaying exactly,
// so any rules change that alters old games is noticed. If the rules version is bumped on purpose,
// update `rulesVersion` inside match.json once the replay is confirmed identical.
const root = new URL("../../testing/src/matches/", import.meta.url);
const read = (dir: string, file: string) =>
  JSON.parse(readFileSync(new URL(`${dir}/${file}`, root), "utf8"));

describe("saved matches", () => {
  for (const dir of readdirSync(root))
    it(`${dir} replays to the recorded result`, () => {
      const saved = read(dir, "match.json"),
        expected = read(dir, "expected.json");
      const registry = compileContent(read(dir, "cards.json"), recordedAbilities, undefined, [
        "crownlands",
      ]);
      expect(registry.version).toBe(saved.initial.contentVersion);
      const end = replay(saved.initial, saved.commands, registry);
      expect({
        turn: end.turn,
        outcome: end.outcome,
        reason: end.outcomeReason,
        life: [end.players.p1.life, end.players.p2.life],
      }).toEqual(expected);
    });
});
