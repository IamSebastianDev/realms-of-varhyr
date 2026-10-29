import type { Command, GameState, Registry } from "@realms/contracts";
import { observationBotCommand } from "@realms/core/botSearchWorld";
import type { BotReply, BotRequest } from "./bot.worker";

/** One worker per local match. Cache by immutable state so animation holds and
 * the final pre-submit check don't repeat the same search. */
export class BrowserBot {
  private worker: Worker | null = null;
  private disabled = false;
  private sequence = 0;
  private pending = new Map<
    number,
    {
      resolve: (command: Command) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private cache = new WeakMap<GameState, Promise<Command>>();
  constructor(private registry: Registry) {}

  choose(state: GameState): Command | Promise<Command> {
    if (this.disabled || typeof Worker === "undefined")
      return observationBotCommand(state, this.registry);
    const cached = this.cache.get(state);
    if (cached) return cached;
    const result = new Promise<Command>((resolve, reject) => {
      if (!this.worker) {
        this.worker = new Worker(new URL("./bot.worker.ts", import.meta.url), { type: "module" });
        this.worker.onmessage = (event: MessageEvent<BotReply>) => {
          const { id, command, error } = event.data;
          const waiting = this.pending.get(id);
          if (!waiting) return;
          clearTimeout(waiting.timer);
          this.pending.delete(id);
          if (command) waiting.resolve(command);
          else waiting.reject(new Error(error ?? "Bot returned no move."));
        };
        this.worker.onerror = () => this.fail(new Error("Bot worker stopped."));
        this.worker.onmessageerror = () =>
          this.fail(new Error("Bot worker returned unreadable data."));
      }
      const id = ++this.sequence;
      const timer = setTimeout(() => this.fail(new Error("Bot search timed out.")), 15000);
      this.pending.set(id, { resolve, reject, timer });
      const request: BotRequest = { id, state };
      this.worker.postMessage(request);
    }).catch(() => {
      this.fail(new Error("Using the heuristic fallback for this match."));
      return observationBotCommand(state, this.registry);
    });
    this.cache.set(state, result);
    return result;
  }
  private fail(error: Error) {
    this.disabled = true;
    this.worker?.terminate();
    this.worker = null;
    for (const waiting of this.pending.values()) {
      clearTimeout(waiting.timer);
      waiting.reject(error);
    }
    this.pending.clear();
  }
  dispose() {
    this.fail(new Error("Match closed."));
  }
}
