import type { Preferences } from '../../../packages/ui/src/preferences';
type AudioSettings = Pick<Preferences, 'music' | 'sound' | 'musicVolume' | 'soundVolume'>;
/** One soundtrack and one effect context for the lifetime of the application. No game state lives here. */
export class AudioController {
  private unlocked = false;
  private hidden = false;
  private disposed = false;
  private context?: AudioContext;
  private settings: AudioSettings;
  constructor(private track: HTMLAudioElement, settings: AudioSettings,
    private contextFactory: () => AudioContext = () => new AudioContext(),
    private reportBlocked: (blocked: boolean) => void = () => {}) {
    this.settings = settings;
    track.loop = true;
    track.volume = settings.musicVolume;
  }
  configure(settings: AudioSettings) { this.settings = settings; this.sync(); }
  setHidden(hidden: boolean) { this.hidden = hidden; this.sync(); }
  /** Called directly by the splash button, within the browser's user gesture. */
  unlock() {
    if (this.disposed) return;
    this.unlocked = true;
    try {
      this.context ??= this.contextFactory();
      void this.context.resume().catch(() => {});
    } catch { /* Music can still work when Web Audio is unavailable. */ }
    this.sync();
  }
  private shouldPlay() { return this.unlocked && !this.hidden && !this.disposed && this.settings.music && this.settings.musicVolume > 0; }
  private sync() {
    if (this.disposed) return;
    this.track.volume = this.settings.musicVolume;
    if (!this.shouldPlay()) { this.track.pause(); this.reportBlocked(false); return; }
    if (!this.track.paused) return;
    void this.track.play().then(() => {
      // A tab may hide or be muted before an outstanding play request resolves.
      if (!this.shouldPlay()) this.track.pause();
      else this.reportBlocked(false);
    }).catch(() => { if (this.shouldPlay()) this.reportBlocked(true); });
  }
  playEffect(type: string) {
    const ctx = this.context;
    if (!this.unlocked || this.hidden || this.disposed || !this.settings.sound || !this.settings.soundVolume || !ctx || ctx.state !== 'running') return;
    try {
      const oscillator = ctx.createOscillator(), gain = ctx.createGain();
      oscillator.connect(gain); gain.connect(ctx.destination);
      oscillator.type = 'sine';
      oscillator.frequency.value = type === 'damage.dealt' ? 110 : type === 'energy.generated' ? 620 : 330;
      gain.gain.setValueAtTime(.06 * this.settings.soundVolume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .15);
      oscillator.start(); oscillator.stop(ctx.currentTime + .17);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    } catch { /* Effects never interrupt a match. */ }
  }
  dispose() {
    this.disposed = true; this.track.pause();
    if (this.context) void this.context.close().catch(() => {});
  }
}
