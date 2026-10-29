import { afterEach, describe, expect, it, vi } from "vitest";
import { BrowserBot } from "../src/features/match/lib/browserBot";
import { botCommand } from "@realms/core/bot";
import { registry } from "@realms/testing/content";
import { startMatch } from "./support/session";

class TestWorker {
  static instances: TestWorker[] = [];
  onmessage?: (event: { data: unknown }) => void;
  onerror?: () => void;
  onmessageerror?: () => void;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() {
    TestWorker.instances.push(this);
  }
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  TestWorker.instances = [];
});
describe("practice opponent worker", () => {
  it("reuses the result for the same immutable state and releases the worker on leave", async () => {
    vi.stubGlobal("Worker", TestWorker);
    const bot = new BrowserBot(registry),
      state = startMatch(71);
    const result = bot.choose(state);
    expect(bot.choose(state)).toBe(result);
    const worker = TestWorker.instances[0];
    expect(worker.postMessage).toHaveBeenCalledOnce();
    const request = worker.postMessage.mock.calls[0][0];
    const command = botCommand(state, registry);
    worker.onmessage!({ data: { id: request.id, command } });
    expect(await result).toEqual(command);
    expect(await bot.choose(state)).toEqual(command);
    bot.dispose();
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
  it("falls back to the existing bot on worker startup failure", async () => {
    vi.stubGlobal(
      "Worker",
      class {
        constructor() {
          throw new Error("unavailable");
        }
      },
    );
    const state = startMatch(72),
      bot = new BrowserBot(registry);
    expect(await bot.choose(state)).toEqual(botCommand(state, registry));
    bot.dispose();
  });
  it("recovers from a worker crash without leaving a pending turn", async () => {
    vi.stubGlobal("Worker", TestWorker);
    const state = startMatch(73),
      bot = new BrowserBot(registry);
    const result = bot.choose(state);
    TestWorker.instances[0].onerror!();
    expect(await result).toEqual(botCommand(state, registry));
    expect(bot.choose(state)).toEqual(botCommand(state, registry));
  });
  it("cancels a worker that fails to reply", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("Worker", TestWorker);
    const state = startMatch(74),
      bot = new BrowserBot(registry);
    const result = bot.choose(state);
    await vi.advanceTimersByTimeAsync(15000);
    expect(await result).toEqual(botCommand(state, registry));
    expect(TestWorker.instances[0].terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
