import type { Preferences } from "@realms/ui/preferences";
import {
  beds,
  effectFor,
  effects,
  enabledEffects,
  type Bed,
  type BedName,
  type Effect,
  type Voice,
} from "./audio/catalog";
export type AudioSettings = Pick<
  Preferences,
  "music" | "sound" | "musicVolume" | "soundVolume" | "ambience" | "ambienceVolume"
>;
/** Recorded files by name, from assets/sfx and assets/ambience. A name with no file is played from its synthesised stand-in. */
export type SoundFiles = {
  effects?: Record<string, string[]>;
  ambience?: Record<string, string[]>;
};
/** A shuffled playlist and one effect context for the lifetime of the application. No game state lives here. */
export class AudioController {
  private unlocked = false;
  private hidden = false;
  private disposed = false;
  private context?: AudioContext;
  private settings: AudioSettings;
  private current = -1;
  private effectsBus?: GainNode;
  private ambienceBus?: GainNode;
  private samples = new Map<string, AudioBuffer | null>();
  private lastPlayed = new Map<string, number>();
  private wanted: BedName | null = null;
  private bed?: { name: BedName; gain: GainNode; stop: () => void };
  private noise?: AudioBuffer;
  constructor(
    private track: HTMLAudioElement,
    private tracks: string[],
    settings: AudioSettings,
    private contextFactory: () => AudioContext = () => new AudioContext(),
    private reportBlocked: (blocked: boolean) => void = () => {},
    private files: SoundFiles = {},
    private load: (url: string) => Promise<ArrayBuffer> = (url) =>
      fetch(url).then((response) => response.arrayBuffer()),
  ) {
    this.settings = settings;
    track.loop = tracks.length < 2;
    track.volume = settings.musicVolume;
    this.pick();
    track.addEventListener("ended", this.next);
  }
  /** Chooses a random track, never the one that just played. */
  private pick() {
    if (!this.tracks.length) return;
    let index = Math.floor(Math.random() * this.tracks.length);
    if (this.tracks.length > 1 && index === this.current)
      index =
        (index + 1 + Math.floor(Math.random() * (this.tracks.length - 1))) % this.tracks.length;
    this.current = index;
    this.track.src = this.tracks[index];
  }
  private next = () => {
    this.pick();
    if (this.shouldPlay())
      void this.track.play().catch(() => {
        if (this.shouldPlay()) this.reportBlocked(true);
      });
  };
  configure(settings: AudioSettings) {
    this.settings = settings;
    this.levels();
    this.sync();
    this.syncBed();
  }
  setHidden(hidden: boolean) {
    this.hidden = hidden;
    this.sync();
    const ctx = this.context;
    if (ctx && this.unlocked) void (hidden ? ctx.suspend() : ctx.resume()).catch(() => {});
    this.syncBed();
  }
  /** Called directly by the splash button, within the browser's user gesture. */
  unlock() {
    if (this.disposed) return;
    this.unlocked = true;
    try {
      this.context ??= this.contextFactory();
      this.bus(this.context);
      this.preload();
      void this.context.resume().catch(() => {});
    } catch {
      /* Music can still work when Web Audio is unavailable. */
    }
    this.sync();
    this.syncBed();
  }
  private shouldPlay() {
    return (
      this.unlocked &&
      !this.hidden &&
      !this.disposed &&
      this.settings.music &&
      this.settings.musicVolume > 0
    );
  }
  private sync() {
    if (this.disposed) return;
    this.track.volume = this.settings.musicVolume;
    if (!this.shouldPlay()) {
      this.track.pause();
      this.reportBlocked(false);
      return;
    }
    if (!this.track.paused) return;
    void this.track
      .play()
      .then(() => {
        // A tab may hide or be muted before an outstanding play request resolves.
        if (!this.shouldPlay()) this.track.pause();
        else this.reportBlocked(false);
      })
      .catch(() => {
        if (this.shouldPlay()) this.reportBlocked(true);
      });
  }
  playEffect(type: string) {
    const ctx = this.context,
      name = effectFor(type);
    if (
      !name ||
      !enabledEffects.has(name) ||
      !this.unlocked ||
      this.hidden ||
      this.disposed ||
      !this.settings.sound ||
      !this.settings.soundVolume ||
      !ctx ||
      ctx.state !== "running" ||
      !this.effectsBus
    )
      return;
    const effect = effects[name],
      now = ctx.currentTime;
    if (now - (this.lastPlayed.get(name) ?? -1) < effect.cooldown) return;
    this.lastPlayed.set(name, now);
    try {
      const ready = (this.files.effects?.[name] ?? [])
        .map((url) => this.sample(name, url))
        .filter((buffer): buffer is AudioBuffer => !!buffer);
      const sample = ready.length ? ready[Math.floor(Math.random() * ready.length)] : null;
      if (sample) this.playSample(ctx, sample, effect);
      else this.synth(ctx, effect);
    } catch {
      /* Effects never interrupt a match. */
    }
  }
  /** The bed that should play under the current screen, or none. Switching crossfades. */
  setAmbience(name: BedName | null) {
    this.wanted = name;
    this.syncBed();
  }

  private bus(ctx: AudioContext) {
    if (this.effectsBus) return;
    this.effectsBus = ctx.createGain();
    this.effectsBus.connect(ctx.destination);
    this.ambienceBus = ctx.createGain();
    this.ambienceBus.connect(ctx.destination);
    this.levels();
  }
  /** Recorded effects are small; decode them all as soon as sound is allowed so the first play is not silent. */
  private preload() {
    for (const [name, urls] of Object.entries(this.files.effects ?? {})) {
      const effect = effectFor(name);
      if (effect && enabledEffects.has(effect)) for (const url of urls) this.sample(name, url);
    }
  }
  private levels() {
    if (this.effectsBus)
      this.effectsBus.gain.value = this.settings.sound ? this.settings.soundVolume : 0;
    if (this.ambienceBus)
      this.ambienceBus.gain.value = this.settings.ambience ? this.settings.ambienceVolume : 0;
  }
  /** A recorded file, decoded once. Returns null while it loads or when there is none, so the stand-in plays meanwhile. */
  private sample(key: string, url: string | undefined, then?: () => void): AudioBuffer | null {
    const cacheKey = `${url ?? ""}|${key}`;
    if (!url) return null;
    if (this.samples.has(cacheKey)) return this.samples.get(cacheKey) ?? null;
    this.samples.set(cacheKey, null);
    const ctx = this.context;
    if (ctx)
      void this.load(url)
        .then((data) => ctx.decodeAudioData(data))
        .then((buffer) => {
          this.samples.set(cacheKey, buffer);
          then?.();
        })
        .catch(() => {});
    return null;
  }
  private playSample(ctx: AudioContext, buffer: AudioBuffer, effect: Effect) {
    const source = ctx.createBufferSource(),
      gain = ctx.createGain();
    source.buffer = buffer;
    gain.gain.value = effect.volume;
    source.connect(gain);
    gain.connect(this.effectsBus!);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };
    source.start();
  }
  private noiseBuffer(ctx: AudioContext) {
    if (this.noise) return this.noise;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate),
      data = buffer.getChannelData(0);
    let last = 0;
    for (let at = 0; at < data.length; at++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      data[at] = last * 3.5;
    }
    return (this.noise = buffer);
  }
  private synth(ctx: AudioContext, effect: Effect) {
    const start = ctx.currentTime,
      bus = this.effectsBus!;
    for (const voice of effect.voices)
      this.voice(ctx, voice, start + (voice.at ?? 0), effect.volume, bus);
  }
  private voice(ctx: AudioContext, voice: Voice, start: number, volume: number, out: AudioNode) {
    const gain = ctx.createGain(),
      end = start + voice.length,
      peak = Math.max(0.0002, voice.gain * volume * 0.35);
    let source: AudioScheduledSourceNode;
    if (voice.kind === "tone") {
      const oscillator = ctx.createOscillator();
      oscillator.type = voice.wave ?? "sine";
      oscillator.frequency.setValueAtTime(voice.from ?? 440, start);
      if (voice.to && voice.to !== voice.from)
        oscillator.frequency.exponentialRampToValueAtTime(voice.to, end);
      source = oscillator;
    } else {
      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuffer(ctx);
      noise.loop = true;
      source = noise;
    }
    let chain: AudioNode = source;
    if (voice.filter) {
      const filter = ctx.createBiquadFilter();
      filter.type = voice.filter.type;
      filter.Q.value = voice.filter.q ?? 1;
      filter.frequency.setValueAtTime(voice.filter.freq, start);
      if (voice.filter.to) filter.frequency.exponentialRampToValueAtTime(voice.filter.to, end);
      chain.connect(filter);
      chain = filter;
    }
    chain.connect(gain);
    gain.connect(out);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(
      peak,
      start + Math.min(voice.attack ?? 0.005, voice.length / 2),
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    source.start(start);
    source.stop(end + 0.02);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };
  }

  private shouldAmbience() {
    return (
      this.unlocked &&
      !this.hidden &&
      !this.disposed &&
      this.settings.ambience &&
      this.settings.ambienceVolume > 0
    );
  }
  private syncBed() {
    const ctx = this.context,
      bus = this.ambienceBus;
    if (!ctx || !bus || this.disposed) return;
    const name = this.shouldAmbience() ? this.wanted : null;
    if (this.bed?.name === name) return;
    const old = this.bed;
    this.bed = undefined;
    const fade = 1.6,
      now = ctx.currentTime;
    if (old) {
      old.gain.gain.cancelScheduledValues(now);
      old.gain.gain.setValueAtTime(old.gain.gain.value, now);
      old.gain.gain.linearRampToValueAtTime(0, now + fade);
      window.setTimeout(old.stop, fade * 1000 + 100);
    }
    if (!name) return;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.connect(bus);
    const target = beds[name].gain;
    gain.gain.linearRampToValueAtTime(target, now + fade);
    const url = this.files.ambience?.[name]?.[0];
    const entry = { name, gain, stop: () => {} };
    this.bed = entry;
    const buffer = this.sample(name, url, () => {
      if (this.bed === entry && this.shouldAmbience()) {
        entry.stop();
        this.bed = undefined;
        this.syncBed();
      }
    });
    entry.stop = buffer ? this.recordedBed(ctx, buffer, gain) : this.syntheticBed(ctx, name, gain);
  }
  private recordedBed(ctx: AudioContext, buffer: AudioBuffer, out: AudioNode) {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(out);
    source.start();
    return () => {
      try {
        source.stop();
      } catch {
        /* Already stopped. */
      }
      source.disconnect();
      out.disconnect();
    };
  }
  private syntheticBed(ctx: AudioContext, name: BedName, out: AudioNode) {
    const bed: Bed = beds[name];
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer(ctx);
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = bed.noise.type;
    filter.frequency.value = bed.noise.freq;
    filter.Q.value = bed.noise.q ?? 0.5;
    source.connect(filter);
    filter.connect(out);
    const parts: AudioScheduledSourceNode[] = [source];
    if (bed.noise.sweep && bed.noise.rate) {
      const lfo = ctx.createOscillator(),
        depth = ctx.createGain();
      lfo.frequency.value = bed.noise.rate;
      depth.gain.value = bed.noise.sweep;
      lfo.connect(depth);
      depth.connect(filter.frequency);
      lfo.start();
      parts.push(lfo);
    }
    source.start();
    let timer = 0;
    const pops = bed.pops;
    if (pops) {
      const tick = () => {
        if (ctx.state === "running")
          this.voice(
            ctx,
            {
              kind: "noise",
              length: 0.03 + Math.random() * 0.04,
              gain: pops.gain * (0.4 + Math.random()),
              filter: { type: "bandpass", freq: pops.freq * (0.6 + Math.random() * 0.8), q: 2 },
            },
            ctx.currentTime,
            1,
            out,
          );
        timer = window.setTimeout(tick, pops.every * 1000 * (0.4 + Math.random() * 1.2));
      };
      timer = window.setTimeout(tick, pops.every * 500);
    }
    return () => {
      window.clearTimeout(timer);
      for (const part of parts) {
        try {
          part.stop();
        } catch {
          /* Already stopped. */
        }
        part.disconnect();
      }
      filter.disconnect();
      out.disconnect();
    };
  }
  dispose() {
    this.disposed = true;
    this.bed?.stop();
    this.track.pause();
    this.track.removeEventListener("ended", this.next);
    if (this.context) void this.context.close().catch(() => {});
  }
}
