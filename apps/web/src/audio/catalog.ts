/**
 * Every sound the client can make, by name. Game code only ever says "play card.play" or "ambience: library"; what that sounds like
 * is decided here. A real recording replaces a synthesised stand-in just by existing: drop `card.play.mp3` into assets/sfx or
 * `library.mp3` into assets/ambience and it is used. Nothing else changes.
 */
export type Voice = {
  kind: 'tone' | 'noise';
  wave?: OscillatorType;
  /** Start and end frequency in Hz; the pitch glides between them. */
  from?: number; to?: number;
  /** Seconds after the effect starts. */
  at?: number; length: number; gain: number; attack?: number;
  filter?: { type: BiquadFilterType; freq: number; to?: number; q?: number };
};
export type EffectName =
  | 'ui.click' | 'ui.tab' | 'ui.open' | 'ui.close' | 'ui.error'
  | 'card.flip' | 'card.play' | 'card.draw' | 'card.discard' | 'spell.cast' | 'spell.fire' | 'spell.ice' | 'spell.water' | 'spell.lightning' | 'energy.gain'
  | 'combat.attack' | 'combat.hit' | 'creature.die' | 'life.heal'
  | 'draft.pick' | 'pack.open' | 'pack.burst' | 'pack.rare' | 'reward.coins';
export type Effect = { voices: Voice[]; /** Minimum seconds between two plays, so a burst of events does not machine-gun. */ cooldown: number; volume: number };

const tone = (from: number, to: number, length: number, gain: number, extra: Partial<Voice> = {}): Voice => ({ kind: 'tone', wave: 'sine', from, to, length, gain, ...extra });
const hiss = (length: number, gain: number, filter: Voice['filter'], extra: Partial<Voice> = {}): Voice => ({ kind: 'noise', length, gain, filter, ...extra });

export const effects: Record<EffectName, Effect> = {
  'ui.click': { cooldown: .03, volume: .5, voices: [tone(1400, 900, .05, .5, { wave: 'triangle' }), hiss(.03, .15, { type: 'highpass', freq: 3000 })] },
  'ui.tab': { cooldown: .05, volume: .5, voices: [tone(520, 640, .08, .4, { wave: 'triangle' })] },
  'ui.open': { cooldown: .08, volume: .55, voices: [tone(300, 520, .16, .4, { wave: 'triangle' }), hiss(.14, .12, { type: 'bandpass', freq: 1800, to: 3200, q: .8 })] },
  'ui.close': { cooldown: .08, volume: .5, voices: [tone(520, 280, .14, .4, { wave: 'triangle' })] },
  'ui.error': { cooldown: .2, volume: .55, voices: [tone(180, 150, .18, .5, { wave: 'square', filter: { type: 'lowpass', freq: 700 } })] },
  'card.flip': { cooldown: .05, volume: .6, voices: [hiss(.09, .5, { type: 'bandpass', freq: 2400, to: 900, q: 1.2 }), tone(240, 160, .05, .25, { wave: 'triangle' })] },
  'card.play': { cooldown: .08, volume: .7, voices: [hiss(.06, .5, { type: 'lowpass', freq: 1600 }), tone(150, 90, .14, .6)] },
  'card.draw': { cooldown: .06, volume: .5, voices: [hiss(.12, .4, { type: 'bandpass', freq: 3000, to: 1200, q: .9 })] },
  'card.discard': { cooldown: .06, volume: .45, voices: [hiss(.18, .35, { type: 'bandpass', freq: 1400, to: 500, q: .8 })] },
  'spell.cast': { cooldown: .1, volume: .6, voices: [tone(400, 1200, .5, .3, { wave: 'sine', attack: .08 }), tone(600, 1800, .5, .15, { wave: 'triangle', attack: .1 }), hiss(.45, .15, { type: 'highpass', freq: 4000 }, { attack: .1 })] },
  'spell.fire': { cooldown: .1, volume: .6, voices: [tone(400, 1200, .5, .3, { wave: 'sine', attack: .08 }), tone(600, 1800, .5, .15, { wave: 'triangle', attack: .1 }), hiss(.45, .15, { type: 'highpass', freq: 4000 }, { attack: .1 })] },
  'spell.ice': { cooldown: .1, volume: .6, voices: [tone(400, 1200, .5, .3, { wave: 'sine', attack: .08 }), tone(600, 1800, .5, .15, { wave: 'triangle', attack: .1 }), hiss(.45, .15, { type: 'highpass', freq: 4000 }, { attack: .1 })] },
  'spell.water': { cooldown: .1, volume: .6, voices: [tone(400, 1200, .5, .3, { wave: 'sine', attack: .08 }), tone(600, 1800, .5, .15, { wave: 'triangle', attack: .1 }), hiss(.45, .15, { type: 'highpass', freq: 4000 }, { attack: .1 })] },
  'spell.lightning': { cooldown: .1, volume: .6, voices: [tone(400, 1200, .5, .3, { wave: 'sine', attack: .08 }), tone(600, 1800, .5, .15, { wave: 'triangle', attack: .1 }), hiss(.45, .15, { type: 'highpass', freq: 4000 }, { attack: .1 })] },
  'energy.gain': { cooldown: .06, volume: .5, voices: [tone(660, 990, .22, .4, { attack: .01 }), tone(990, 1320, .2, .2, { at: .06 })] },
  'combat.attack': { cooldown: .1, volume: .6, voices: [hiss(.22, .5, { type: 'bandpass', freq: 600, to: 2600, q: 1 }, { attack: .06 })] },
  'combat.hit': { cooldown: .06, volume: .75, voices: [tone(120, 45, .22, .9), hiss(.1, .6, { type: 'lowpass', freq: 1800 })] },
  'creature.die': { cooldown: .12, volume: .7, voices: [tone(220, 55, .5, .6, { wave: 'sawtooth', filter: { type: 'lowpass', freq: 900, to: 150 } }), hiss(.35, .3, { type: 'lowpass', freq: 700 })] },
  'life.heal': { cooldown: .15, volume: .5, voices: [tone(520, 780, .35, .35, { attack: .05 }), tone(780, 1040, .3, .2, { at: .08, attack: .05 })] },
  'draft.pick': { cooldown: .1, volume: .6, voices: [hiss(.07, .4, { type: 'lowpass', freq: 2200 }), tone(330, 440, .18, .45, { wave: 'triangle' })] },
  'pack.open': { cooldown: .3, volume: .8, voices: [hiss(.5, .6, { type: 'bandpass', freq: 800, to: 5000, q: .7 }, { attack: .15 }), tone(200, 800, .5, .3, { attack: .2 })] },
  'pack.burst': { cooldown: .5, volume: .9, voices: [tone(110, 28, 1.5, 1, { attack: .004 }), hiss(1.3, .9, { type: 'lowpass', freq: 3200, to: 180, q: .7 }, { attack: .004 }), hiss(.25, .5, { type: 'highpass', freq: 2500 }, { attack: .002 })] },
  'pack.rare': { cooldown: .5, volume: .8, voices: [tone(523, 523, 1.2, .35, { attack: .02 }), tone(784, 784, 1.2, .3, { at: .08, attack: .02 }), tone(1046, 1046, 1.4, .25, { at: .16, attack: .02 })] },
  'reward.coins': { cooldown: .1, volume: .55, voices: [tone(1800, 2400, .12, .35, { wave: 'triangle' }), tone(2400, 3000, .16, .3, { at: .07, wave: 'triangle' })] },
};

/** Names the game and the rules engine already use, mapped to the sound that answers them. */
export const effectAliases: Record<string, EffectName> = {
  'card.played': 'card.play', 'card.drawn': 'card.draw', 'card.discarded': 'card.discard', 'spell.cast': 'spell.cast',
  'energy.generated': 'energy.gain', 'damage.dealt': 'combat.hit', 'creature.attacked': 'combat.attack', 'creature.destroyed': 'creature.die',
  'life.restored': 'life.heal',
};
export const effectFor = (type: string): EffectName | undefined => (type in effects ? type as EffectName : effectAliases[type]);
/** Which engine events make a sound, in order of importance: one sound per step so a busy turn stays readable. */
/** Sounds the game plays right now. The rest stay defined (and keep their files) so one can be switched back on by adding its name here. */
export const enabledEffects: ReadonlySet<EffectName> = new Set<EffectName>(['spell.cast', 'spell.fire', 'spell.ice', 'spell.water', 'spell.lightning', 'life.heal', 'card.play', 'draft.pick', 'pack.open', 'pack.burst', 'pack.rare', 'combat.attack', 'combat.hit', 'creature.die']);
/** Ambience is built but switched off until there are recordings worth hearing. */
export const ambienceAvailable = false;
/** What a spell sounds like is up to the spell: its element, not its faction. Spells not listed fall back to what they do. */
const spellElements: Record<string, EffectName> = {
  'strike-the-hammer': 'spell.lightning', puncture: 'spell.lightning', volley: 'spell.lightning',
  revenge: 'spell.fire', rockslide: 'spell.fire', 'moment-of-glory': 'spell.fire', sabotage: 'spell.fire',
  death: 'spell.ice', 'plague-wind': 'spell.ice', 'raise-undead': 'spell.ice', 'grave-exchange': 'spell.ice',
  'cleansing-light': 'spell.water', 'battlefield-hymn': 'spell.water', 'borrowed-wisdom': 'spell.water', 'find-gold': 'spell.water', 'close-ranks': 'spell.water',
};
export const spellEffect = (spell: { id: string; cast?: readonly { id: string }[] }): EffectName =>
  spellElements[spell.id] ?? (spell.cast?.some(a => a.id === 'damage') ? 'spell.fire' : spell.cast?.some(a => a.id === 'heal' || a.id === 'draw') ? 'spell.water' : 'spell.cast');
export const soundOrder = ['spell.cast', 'card.played', 'life.restored'];

/** A bed is a quiet loop under the music. Synthesised beds are only a stand-in: noise shaped by a slow filter. */
export type Bed = { gain: number; noise: { type: BiquadFilterType; freq: number; q?: number; sweep?: number; rate?: number }; /** Occasional soft crackles or knocks. */ pops?: { every: number; freq: number; gain: number } };
export const beds = {
  wind: { gain: .5, noise: { type: 'bandpass', freq: 420, q: .5, sweep: 220, rate: .07 } },
  library: { gain: .28, noise: { type: 'lowpass', freq: 260, q: .4 }, pops: { every: 6, freq: 900, gain: .05 } },
  embers: { gain: .45, noise: { type: 'bandpass', freq: 650, q: .6, sweep: 180, rate: .09 }, pops: { every: 1.2, freq: 2400, gain: .18 } },
  market: { gain: .4, noise: { type: 'bandpass', freq: 900, q: .35, sweep: 260, rate: .12 } },
  hall: { gain: .4, noise: { type: 'lowpass', freq: 340, q: .4, sweep: 80, rate: .05 }, pops: { every: .8, freq: 2800, gain: .22 } },
  road: { gain: .45, noise: { type: 'bandpass', freq: 520, q: .45, sweep: 240, rate: .06 } },
} satisfies Record<string, Bed>;
export type BedName = keyof typeof beds;

/** The bed under each screen. A screen not listed has none. The match has its own sound and stays quiet. */
export const screenBeds: Record<string, BedName> = {
  menu: 'wind', multiplayer: 'wind', cards: 'library', builder: 'library', stats: 'library', packs: 'embers', store: 'market', profile: 'hall',
  quest: 'road', draft: 'embers',
};
