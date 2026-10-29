import type { Command, GameState } from "@realms/contracts";
import { registry } from "@realms/content";
import { searchBotCommand } from "@realms/core/botSearch";

export type BotRequest = { id: number; state: GameState };
export type BotReply = { id: number; command?: Command; error?: string };
self.onmessage = (event: MessageEvent<BotRequest>) => {
  const { id, state } = event.data;
  try {
    const reply: BotReply = { id, command: searchBotCommand(state, registry) };
    self.postMessage(reply);
  } catch (error) {
    const reply: BotReply = {
      id,
      error: error instanceof Error ? error.message : "Bot search failed.",
    };
    self.postMessage(reply);
  }
};
