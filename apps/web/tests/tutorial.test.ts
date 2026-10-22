import { createLocalMatch } from "../src/match/localMatch";
import { describe, expect, it, vi } from "vitest";
import type { Command, CommandEnvelope, GameState } from "@realms/contracts";
import { apply, decisionPlayer, replay } from "@realms/core";
import { registry } from "@realms/content";
import {
  actionCount,
  find,
  opponentCommand,
  opponentMoves,
  opponentNote,
  playerCommands,
  scriptFinished,
  startTutorial,
  stepAfter,
  tutorialSteps,
} from "../src/tutorial";

/** The golden path: one command per action step, built from the live state so the test survives id changes. */
const golden = (state: GameState, step: string): Command => {
  const me = (definition: string, zone: "hand" | "board" = "hand") =>
    find(state, "p1", definition, zone)!;
  switch (step) {
    case "mulligan":
      return {
        type: "mulligan",
        cardIds: [me("tower-of-the-first-morning"), me("alderic-warmaster-of-the-empire")],
      };
    case "play-farmer":
      return { type: "play", cardId: me("goldfield-farmer"), slot: 2 };
    case "play-recruit":
      return { type: "play", cardId: me("crownlands-recruit"), slot: 1 };
    case "play-merchant":
      return { type: "play", cardId: me("merchant-of-tris-vale"), slot: 3 };
    case "enter-combat":
    case "end-turn":
    case "enter-combat-2":
    case "end-turn-2":
    case "close-response":
      return { type: "end" };
    case "skip-combat":
      return { type: "attack", attackers: [] };
    case "draw": {
      const pending = state.pending!;
      return {
        type: "choose",
        choiceId: pending.id,
        option: (pending.options as string[]).find(
          (id) => state.cards[id].definitionId === "cleansing-light",
        )!,
        other: "discard",
      };
    }
    case "channel-farmer":
      return { type: "energy", cardId: me("goldfield-farmer", "board"), option: 0 };
    case "channel-merchant":
      return { type: "energy", cardId: me("merchant-of-tris-vale", "board"), option: 0 };
    case "play-runeguard":
      return { type: "play", cardId: me("runeguard"), slot: 0 };
    case "attack": {
      const recruit = me("crownlands-recruit", "board");
      return { type: "attack", attackers: [recruit], lanes: { [recruit]: 0 } };
    }
    case "confirm":
      return { type: "confirm-combat" };
    case "response":
      return {
        type: "play",
        cardId: me("cleansing-light"),
        target: find(state, "p2", "crownlands-recruit", "board")!,
      };
  }
  throw new Error(`No command for ${step}`);
};

function play() {
  const saved = startTutorial();
  let state = saved.initial;
  const commands: CommandEnvelope[] = [];
  const send = (actor: "p1" | "p2", command: Command) => {
    const result = apply(state, { actor, expectedRevision: state.revision, command }, registry);
    if (result.error) throw new Error(`${actor} ${command.type}: ${result.error}`);
    state = result.state;
    commands.push({ actor, expectedRevision: state.revision - 1, command });
  };
  const opponent = () => {
    while (!state.outcome && decisionPlayer(state) === "p2") {
      const command = opponentCommand(state, opponentMoves(commands));
      if (!command) break;
      send("p2", command);
    }
  };
  const log: string[] = [];
  for (const step of tutorialSteps.filter((step) => step.accept)) {
    opponent();
    expect(decisionPlayer(state), `${step.id} is the player's decision`).toBe("p1");
    const command = golden(state, step.id);
    expect(step.accept!(command, state), `${step.id} accepts its own golden command`).toBe(true);
    send("p1", command);
    log.push(step.id);
  }
  opponent();
  return { saved, state, commands, log };
}

describe("tutorial on the loopback room", () => {
  it("plays the same scripted path through the room the online host uses", () => {
    vi.useFakeTimers();
    try {
      const { session, script } = createLocalMatch(startTutorial());
      const drain = () => {
        for (let i = 0; i < 300; i++) {
          const bot = session.getSnapshot().bot;
          if (!bot?.thinking) return;
          if (bot.gate) session.advanceOpponent();
          else vi.advanceTimersByTime(2000);
        }
        throw new Error("opponent never handed back the turn");
      };
      for (const step of tutorialSteps.filter((step) => step.accept)) {
        drain();
        const state = session.getSnapshot().state;
        expect(
          session.frame(null, "p1").view.legal.actor,
          `${step.id} is the player's decision`,
        ).toBe("p1");
        const command = golden(state, step.id);
        expect(step.accept!(command, state), `${step.id} accepts its own golden command`).toBe(
          true,
        );
        session.act(command);
      }
      drain();
      const { state, commands } = session.getSnapshot();
      expect(state.turn).toBe(5);
      expect(state.players.p2.life).toBe(9);
      expect(state.players.p1.life).toBe(11);
      expect(state.pending?.kind).toBe("draw");
      expect(scriptFinished(opponentMoves(commands))).toBe(true);
      expect(script.active).toBe(true);
      session.leave();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("tutorial", () => {
  it("can be played to the end along its scripted path", () => {
    const { state, commands } = play();
    expect(state.outcome).toBeNull();
    expect(decisionPlayer(state)).toBe("p1");
    expect(state.pending?.kind).toBe("draw");
    expect(state.turn).toBe(5);
    expect(state.players.p2.life).toBe(9);
    expect(state.players.p1.life).toBe(11);
    expect(scriptFinished(opponentMoves(commands))).toBe(true);
    expect(find(state, "p2", "crownlands-recruit", "board")).toBeUndefined();
    expect(replay(startTutorial().initial, commands, registry).revision).toBe(state.revision);
  });
  it("derives its position from the commands already played", () => {
    const { commands } = play();
    expect(playerCommands(commands)).toBe(actionCount());
    expect(stepAfter(0)).toBe(0);
    expect(tutorialSteps[stepAfter(actionCount())].id).toBe("finish");
    expect(tutorialSteps[stepAfter(1)].id).toBe("energy");
  });
  it("is identical on every start", () => {
    expect(JSON.stringify(startTutorial().initial)).toBe(JSON.stringify(startTutorial().initial));
    expect(startTutorial().rewardEligible).toBe(false);
    expect(opponentNote(0).title).toBeTruthy();
  });
});
