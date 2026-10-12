import { describe, expect, it, vi } from 'vitest';
import { AudioController } from '../apps/web/src/audioController';
const settings = { music: true, sound: true, musicVolume: .35, soundVolume: .65 };
function fixture() {
  const media = { paused: true, loop: false, volume: 1, currentTime: 42,
    play: vi.fn(async () => { media.paused = false; }), pause: vi.fn(() => { media.paused = true; }) };
  const oscillator = { connect: vi.fn(), disconnect: vi.fn(), frequency: { value: 0 }, type: '', start: vi.fn(), stop: vi.fn(), onended: null as (() => void) | null };
  const gain = { connect: vi.fn(), disconnect: vi.fn(), gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() } };
  const context = { state: 'running', currentTime: 0, destination: {}, resume: vi.fn(async () => {}), close: vi.fn(async () => {}), createOscillator: vi.fn(() => oscillator), createGain: vi.fn(() => gain) };
  const factory = vi.fn(() => context as unknown as AudioContext), blocked = vi.fn();
  const player = new AudioController(media as unknown as HTMLAudioElement, settings, factory, blocked);
  return { player, media, context, oscillator, gain, factory, blocked };
}
describe('application audio lifecycle', () => {
  it('waits for entry, loops one track and reuses its unlocked effect context', () => {
    const f = fixture(); f.player.configure(settings); f.player.playEffect('card.played');
    expect(f.media.play).not.toHaveBeenCalled(); expect(f.factory).not.toHaveBeenCalled();
    f.player.unlock(); f.player.unlock();
    expect(f.media.loop).toBe(true); expect(f.media.volume).toBe(.35);
    expect(f.media.play).toHaveBeenCalledTimes(1); expect(f.factory).toHaveBeenCalledTimes(1);
    f.player.playEffect('energy.generated');
    expect(f.oscillator.frequency.value).toBe(620);
    expect(f.gain.gain.setValueAtTime).toHaveBeenCalledWith(.06 * .65, 0);
  });
  it('keeps mute choices and resumes the same position with a new music volume', () => {
    const f = fixture(); f.player.configure({ ...settings, music: false }); f.player.unlock();
    expect(f.media.play).not.toHaveBeenCalled();
    f.player.configure({ ...settings, musicVolume: .2 }); expect(f.media.play).toHaveBeenCalledTimes(1);
    f.player.configure({ ...settings, music: false }); expect(f.media.paused).toBe(true);
    f.player.configure({ ...settings, musicVolume: 0 }); expect(f.media.paused).toBe(true);
    expect(f.media.currentTime).toBe(42);
  });
  it('pauses music and effects in a hidden tab and resumes on return', () => {
    const f = fixture(); f.player.unlock(); f.player.setHidden(true); f.player.playEffect('damage.dealt');
    expect(f.media.paused).toBe(true); expect(f.context.createOscillator).not.toHaveBeenCalled();
    f.player.setHidden(false); expect(f.media.play).toHaveBeenCalledTimes(2);
  });
  it('suppresses disabled or zero-volume effects and releases the context on disposal', () => {
    const f = fixture(); f.player.unlock();
    f.player.configure({ ...settings, sound: false }); f.player.playEffect('damage.dealt');
    f.player.configure({ ...settings, soundVolume: 0 }); f.player.playEffect('damage.dealt');
    expect(f.context.createOscillator).not.toHaveBeenCalled();
    f.player.dispose(); f.player.unlock(); f.player.playEffect('card.played');
    expect(f.context.close).toHaveBeenCalledTimes(1); expect(f.media.paused).toBe(true);
  });
  it('does not let a late play promise restart a muted or disposed track', async () => {
    const f = fixture(); let finish!: () => void;
    f.media.play.mockImplementation(() => new Promise<void>(resolve => { finish = () => { f.media.paused = false; resolve(); }; }));
    f.player.unlock(); f.player.dispose(); finish(); await Promise.resolve();
    expect(f.media.paused).toBe(true);
  });
  it('reports browser playback rejection and allows a user to retry', async () => {
    const f = fixture(); f.media.play.mockRejectedValueOnce(Error('Autoplay blocked'));
    f.player.unlock(); await Promise.resolve(); await Promise.resolve();
    expect(f.blocked).toHaveBeenCalledWith(true);
    f.player.unlock(); await Promise.resolve();
    expect(f.blocked).toHaveBeenLastCalledWith(false);
  });
});
