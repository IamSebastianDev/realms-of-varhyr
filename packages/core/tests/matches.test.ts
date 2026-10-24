import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileContent } from "@realms/content/compiler";
import { recordedAbilities } from "@realms/testing/recordedMatch";
import { replay, RULES_VERSION } from "../src";

// Saved real matches: each is replayed command by command and must end the way it did when it was played.
// This guards behaviour (a rules change that alters old games shows up here), not version strings or card text:
// the recording is re-stamped with the current rules and content versions, so renames, rewording and version bumps
// cannot break it. If a rules change alters the outcome on purpose, re-record the match or update expected.json.
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
      const initial = {
        ...saved.initial,
        rulesVersion: RULES_VERSION,
        contentVersion: registry.version,
      };
      const end = replay(initial, saved.commands, registry);
      expect({
        turn: end.turn,
        outcome: end.outcome,
        reason: end.outcomeReason,
        life: [end.players.p1.life, end.players.p2.life],
      }).toEqual(expected);
    });
});
