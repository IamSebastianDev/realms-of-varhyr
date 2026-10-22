import { describe, expect, it, vi } from "vitest";
import {
  beds,
  ambienceAvailable,
  enabledEffects,
  spellEffect,
  effectAliases,
  effectFor,
  effects,
  screenBeds,
  soundOrder,
} from "../src/features/audio/catalog";
import { AudioController, type AudioSettings } from "../src/features/audio/audioController";
import { registry } from "@realms/content";
import { defaultPreferences, parsePreferences } from "@realms/ui/preferences";

describe("sound catalog", () => {
  it("answers every engine event the presentation listens for", () => {
    for (const type of soundOrder) expect(effectFor(type), type).toBeDefined();
    for (const target of Object.values(effectAliases))
      expect(effects[target], target).toBeDefined();
  });
  it("has well-formed effects", () => {
    for (const [name, effect] of Object.entries(effects)) {
      expect(effect.voices.length, name).toBeGreaterThan(0);
      expect(effect.cooldown, name).toBeGreaterThanOrEqual(0);
      for (const voice of effect.voices) {
        expect(voice.length, name).toBeGreaterThan(0);
        expect(voice.gain, name).toBeGreaterThan(0);
      }
    }
  });
  it("only puts beds under screens that exist in the catalog", () => {
    for (const bed of Object.values(screenBeds)) expect(beds[bed]).toBeDefined();
    expect(screenBeds.match).toBeUndefined();
  });
  it("picks a spell sound by the spell, not the faction", () => {
    expect(spellEffect({ id: "strike-the-hammer" })).toBe("spell.lightning");
    expect(spellEffect({ id: "revenge" })).toBe("spell.fire");
    expect(spellEffect({ id: "plague-wind" })).toBe("spell.ice");
    expect(spellEffect({ id: "borrowed-wisdom" })).toBe("spell.water");
  });
  it("gives a spell it does not know a sound by what it does", () => {
    expect(spellEffect({ id: "new-bolt", cast: [{ id: "damage" }] })).toBe("spell.fire");
    expect(spellEffect({ id: "new-mend", cast: [{ id: "heal" }] })).toBe("spell.water");
    expect(spellEffect({ id: "new-oddity", cast: [{ id: "ransack" }] })).toBe("spell.cast");
  });
  it("knows a sound for every spell in the game", () => {
    for (const spell of Object.values(registry.cards).filter((card) => card.type === "spell"))
      expect(spellEffect(spell), spell.id).not.toBe("spell.cast");
  });
  it("plays only what is enabled, and every enabled sound exists", () => {
    for (const name of enabledEffects) expect(effects[name], name).toBeDefined();
    for (const name of ["ui.click", "ui.tab", "card.draw"])
      expect(enabledEffects.has(name as never), name).toBe(false);
    expect(ambienceAvailable).toBe(false);
  });
  it("ignores sounds it does not know", () => {
    expect(effectFor("nothing.here")).toBeUndefined();
  });
});

describe("audio preferences", () => {
  it("gives saved preferences from before ambience existed the defaults", () => {
    const old = parsePreferences({ music: false, musicVolume: 0.2, sound: true, soundVolume: 0.4 });
    expect(old.ambience).toBe(defaultPreferences.ambience);
    expect(old.ambienceVolume).toBe(defaultPreferences.ambienceVolume);
    expect(old.music).toBe(false);
  });
  it("keeps the three channels independent and clamps volumes", () => {
    const next = parsePreferences({
      music: false,
      ambience: true,
      sound: false,
      ambienceVolume: 9,
      musicVolume: -1,
    });
    expect([next.music, next.ambience, next.sound]).toEqual([false, true, false]);
    expect(next.ambienceVolume).toBe(1);
    expect(next.musicVolume).toBe(0);
  });
});

/** A context that records what is connected and played, so the mix can be checked without a sound card. */
function fakeContext() {
  const log = { sources: 0, stopped: 0, oscillators: 0 };
  const param = () => ({
    value: 0,
    setValueAtTime() {},
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
    cancelScheduledValues() {},
  });
  const node = (extra: object = {}) => ({ connect() {}, disconnect() {}, ...extra });
  const source = () => {
    log.sources++;
    return node({
      buffer: null,
      loop: false,
      start() {},
      stop() {
        log.stopped++;
      },
      onended: null as null | (() => void),
    });
  };
  const context = {
    state: "running",
    currentTime: 0,
    sampleRate: 8000,
    destination: node(),
    resume: async () => {},
    suspend: async () => {},
    close: async () => {},
    createGain: () => node({ gain: param() }),
    createBuffer: (_c: number, length: number) => ({
      getChannelData: () => new Float32Array(length),
    }),
    createBufferSource: source,
    createOscillator: () => {
      log.oscillators++;
      return node({
        type: "sine",
        frequency: param(),
        start() {},
        stop() {
          log.stopped++;
        },
        onended: null,
      });
    },
    decodeAudioData: async () => ({ duration: 0.1 }),
    createBiquadFilter: () => node({ type: "lowpass", frequency: param(), Q: param() }),
  };
  return { context: context as unknown as AudioContext, log };
}
const track = () =>
  ({
    loop: false,
    volume: 0,
    src: "",
    paused: true,
    addEventListener() {},
    removeEventListener() {},
    play: async () => {},
    pause() {},
  }) as unknown as HTMLAudioElement;
const settings = (extra: Partial<AudioSettings> = {}): AudioSettings => ({
  music: true,
  sound: true,
  musicVolume: 0.5,
  soundVolume: 0.5,
  ambience: true,
  ambienceVolume: 0.5,
  ...extra,
});

describe("recorded sounds", () => {
  (globalThis as { window?: unknown }).window = globalThis;
  it("plays a recording instead of the stand-in once it is decoded, and the stand-in until then", async () => {
    const { context, log } = fakeContext();
    const audio = new AudioController(
      track(),
      [],
      settings(),
      () => context,
      () => {},
      { effects: { "card.play": ["a.mp3", "b.mp3"] } },
      async () => new ArrayBuffer(8),
    );
    audio.unlock();
    audio.playEffect("card.played");
    expect(log.oscillators).toBeGreaterThan(0); // not decoded yet
    await new Promise((resolve) => setTimeout(resolve, 0));
    const before = log.oscillators,
      sources = log.sources;
    (context as { currentTime: number }).currentTime += 1;
    audio.playEffect("card.played");
    expect(log.oscillators).toBe(before);
    expect(log.sources).toBe(sources + 1);
  });
  it("falls back to the stand-in when a file cannot be loaded", async () => {
    const { context, log } = fakeContext();
    const audio = new AudioController(
      track(),
      [],
      settings(),
      () => context,
      () => {},
      { effects: { "card.play": ["broken.mp3"] } },
      async () => {
        throw new Error("404");
      },
    );
    audio.unlock();
    await new Promise((resolve) => setTimeout(resolve, 0));
    (context as { currentTime: number }).currentTime += 1;
    audio.playEffect("card.played");
    expect(log.oscillators).toBeGreaterThan(0);
  });
});

describe("audio controller mix", () => {
  (globalThis as { window?: unknown }).window = globalThis;
  it("plays effects only when effects are on, whatever music and ambience do", () => {
    const { context, log } = fakeContext();
    const audio = new AudioController(
      track(),
      [],
      settings({ music: false, ambience: false }),
      () => context,
    );
    audio.unlock();
    audio.playEffect("card.played");
    expect(log.oscillators).toBeGreaterThan(0);
    const off = fakeContext();
    const quiet = new AudioController(track(), [], settings({ sound: false }), () => off.context);
    quiet.unlock();
    quiet.playEffect("card.played");
    expect(off.log.oscillators).toBe(0);
  });
  it("does not repeat a sound inside its cooldown", () => {
    const { context, log } = fakeContext();
    const audio = new AudioController(track(), [], settings(), () => context);
    audio.unlock();
    audio.playEffect("card.play");
    const once = log.oscillators;
    expect(once).toBeGreaterThan(0);
    audio.playEffect("card.play");
    expect(log.oscillators).toBe(once);
  });
  it("starts a bed only while ambience is on, and stops it when it is turned off", () => {
    vi.useFakeTimers();
    const { context, log } = fakeContext();
    const audio = new AudioController(track(), [], settings({ ambience: false }), () => context);
    audio.unlock();
    audio.setAmbience("library");
    expect(log.sources).toBe(0);
    audio.configure(settings({ ambience: true }));
    expect(log.sources).toBe(1);
    audio.configure(settings({ ambience: false }));
    vi.advanceTimersByTime(3000);
    expect(log.stopped).toBeGreaterThan(0);
    vi.useRealTimers();
  });
  it("crossfades to the next screen's bed", () => {
    vi.useFakeTimers();
    const { context, log } = fakeContext();
    const audio = new AudioController(track(), [], settings(), () => context);
    audio.unlock();
    audio.setAmbience("wind");
    audio.setAmbience("market");
    vi.advanceTimersByTime(3000);
    expect(log.sources).toBe(2);
    expect(log.stopped).toBeGreaterThan(0);
    audio.setAmbience(null);
    vi.advanceTimersByTime(3000);
    audio.dispose();
    vi.useRealTimers();
  });
});
