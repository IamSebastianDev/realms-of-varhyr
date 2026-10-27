/**
 * Every sound the client can make, by name. Game code only ever says "play card.play" or "ambience: library"; what that sounds like
 * is decided here. A real recording replaces a synthesised stand-in just by existing: drop `card.play.mp3` into assets/sfx or
 * `library.mp3` into assets/ambience and it is used. Nothing else changes.
 */
export type Voice = {
  kind: "tone" | "noise";
  wave?: OscillatorType;
  /** Start and end frequency in Hz; the pitch glides between them. */
  from?: number;
  to?: number;
  /** Seconds after the effect starts. */
  at?: number;
  length: number;
  gain: number;
  attack?: number;
  filter?: { type: BiquadFilterType; freq: number; to?: number; q?: number };
};
export type EffectName =
  | "ui.scene"
  | "ui.click"
  | "ui.tab"
  | "ui.open"
  | "ui.close"
  | "ui.error"
  | "card.flip"
  | "card.play"
  | "card.draw"
  | "card.discard"
  | "spell.cast"
  | "spell.fire"
  | "spell.ice"
  | "spell.water"
  | "spell.lightning"
  | "energy.gain"
  | "combat.attack"
  | "combat.hit"
  | "creature.die"
  | "life.heal"
  | "draft.pick"
  | "pack.open"
  | "pack.burst"
  | "reward.coins";
export type Effect = {
  voices: Voice[];
  /** Minimum seconds between two plays, so a burst of events does not machine-gun. */ cooldown: number;
  volume: number;
};

const tone = (
  from: number,
  to: number,
  length: number,
  gain: number,
  extra: Partial<Voice> = {},
): Voice => ({ kind: "tone", wave: "sine", from, to, length, gain, ...extra });
const hiss = (
  length: number,
  gain: number,
  filter: Voice["filter"],
  extra: Partial<Voice> = {},
): Voice => ({ kind: "noise", length, gain, filter, ...extra });

export const effects: Record<EffectName, Effect> = {
  "ui.scene": {
    cooldown: 0.12,
    volume: 0.6,
    voices: [
      tone(180, 90, 0.22, 0.6, { wave: "sine" }),
      hiss(0.5, 0.12, { type: "bandpass", freq: 2400 }),
    ],
  },
  "ui.click": {
    cooldown: 0.03,
    volume: 0.5,
    voices: [
      tone(1400, 900, 0.05, 0.5, { wave: "triangle" }),
      hiss(0.03, 0.15, { type: "highpass", freq: 3000 }),
    ],
  },
  "ui.tab": {
    cooldown: 0.05,
    volume: 0.5,
    voices: [tone(520, 640, 0.08, 0.4, { wave: "triangle" })],
  },
  "ui.open": {
    cooldown: 0.08,
    volume: 0.55,
    voices: [
      tone(300, 520, 0.16, 0.4, { wave: "triangle" }),
      hiss(0.14, 0.12, { type: "bandpass", freq: 1800, to: 3200, q: 0.8 }),
    ],
  },
  "ui.close": {
    cooldown: 0.08,
    volume: 0.5,
    voices: [tone(520, 280, 0.14, 0.4, { wave: "triangle" })],
  },
  "ui.error": {
    cooldown: 0.2,
    volume: 0.55,
    voices: [tone(180, 150, 0.18, 0.5, { wave: "square", filter: { type: "lowpass", freq: 700 } })],
  },
  "card.flip": {
    cooldown: 0.05,
    volume: 0.6,
    voices: [
      hiss(0.09, 0.5, { type: "bandpass", freq: 2400, to: 900, q: 1.2 }),
      tone(240, 160, 0.05, 0.25, { wave: "triangle" }),
    ],
  },
  "card.play": {
    cooldown: 0.08,
    volume: 0.7,
    voices: [hiss(0.06, 0.5, { type: "lowpass", freq: 1600 }), tone(150, 90, 0.14, 0.6)],
  },
  "card.draw": {
    cooldown: 0.06,
    volume: 0.5,
    voices: [hiss(0.12, 0.4, { type: "bandpass", freq: 3000, to: 1200, q: 0.9 })],
  },
  "card.discard": {
    cooldown: 0.06,
    volume: 0.45,
    voices: [hiss(0.18, 0.35, { type: "bandpass", freq: 1400, to: 500, q: 0.8 })],
  },
  "spell.cast": {
    cooldown: 0.1,
    volume: 0.6,
    voices: [
      tone(400, 1200, 0.5, 0.3, { wave: "sine", attack: 0.08 }),
      tone(600, 1800, 0.5, 0.15, { wave: "triangle", attack: 0.1 }),
      hiss(0.45, 0.15, { type: "highpass", freq: 4000 }, { attack: 0.1 }),
    ],
  },
  "spell.fire": {
    cooldown: 0.1,
    volume: 0.6,
    voices: [
      tone(400, 1200, 0.5, 0.3, { wave: "sine", attack: 0.08 }),
      tone(600, 1800, 0.5, 0.15, { wave: "triangle", attack: 0.1 }),
      hiss(0.45, 0.15, { type: "highpass", freq: 4000 }, { attack: 0.1 }),
    ],
  },
  "spell.ice": {
    cooldown: 0.1,
    volume: 0.6,
    voices: [
      tone(400, 1200, 0.5, 0.3, { wave: "sine", attack: 0.08 }),
      tone(600, 1800, 0.5, 0.15, { wave: "triangle", attack: 0.1 }),
      hiss(0.45, 0.15, { type: "highpass", freq: 4000 }, { attack: 0.1 }),
    ],
  },
  "spell.water": {
    cooldown: 0.1,
    volume: 0.6,
    voices: [
      tone(400, 1200, 0.5, 0.3, { wave: "sine", attack: 0.08 }),
      tone(600, 1800, 0.5, 0.15, { wave: "triangle", attack: 0.1 }),
      hiss(0.45, 0.15, { type: "highpass", freq: 4000 }, { attack: 0.1 }),
    ],
  },
  "spell.lightning": {
    cooldown: 0.1,
    volume: 0.6,
    voices: [
      tone(400, 1200, 0.5, 0.3, { wave: "sine", attack: 0.08 }),
      tone(600, 1800, 0.5, 0.15, { wave: "triangle", attack: 0.1 }),
      hiss(0.45, 0.15, { type: "highpass", freq: 4000 }, { attack: 0.1 }),
    ],
  },
  "energy.gain": {
    cooldown: 0.06,
    volume: 0.5,
    voices: [tone(660, 990, 0.22, 0.4, { attack: 0.01 }), tone(990, 1320, 0.2, 0.2, { at: 0.06 })],
  },
  "combat.attack": {
    cooldown: 0.1,
    volume: 0.6,
    voices: [hiss(0.22, 0.5, { type: "bandpass", freq: 600, to: 2600, q: 1 }, { attack: 0.06 })],
  },
  "combat.hit": {
    cooldown: 0.06,
    volume: 0.75,
    voices: [tone(120, 45, 0.22, 0.9), hiss(0.1, 0.6, { type: "lowpass", freq: 1800 })],
  },
  "creature.die": {
    cooldown: 0.12,
    volume: 0.7,
    voices: [
      tone(220, 55, 0.5, 0.6, {
        wave: "sawtooth",
        filter: { type: "lowpass", freq: 900, to: 150 },
      }),
      hiss(0.35, 0.3, { type: "lowpass", freq: 700 }),
    ],
  },
  "life.heal": {
    cooldown: 0.15,
    volume: 0.5,
    voices: [
      tone(520, 780, 0.35, 0.35, { attack: 0.05 }),
      tone(780, 1040, 0.3, 0.2, { at: 0.08, attack: 0.05 }),
    ],
  },
  "draft.pick": {
    cooldown: 0.1,
    volume: 0.6,
    voices: [
      hiss(0.07, 0.4, { type: "lowpass", freq: 2200 }),
      tone(330, 440, 0.18, 0.45, { wave: "triangle" }),
    ],
  },
  "pack.open": {
    cooldown: 0.3,
    volume: 0.8,
    voices: [
      hiss(0.5, 0.6, { type: "bandpass", freq: 800, to: 5000, q: 0.7 }, { attack: 0.15 }),
      tone(200, 800, 0.5, 0.3, { attack: 0.2 }),
    ],
  },
  "pack.burst": {
    cooldown: 0.5,
    volume: 0.9,
    voices: [
      tone(110, 28, 1.5, 1, { attack: 0.004 }),
      hiss(1.3, 0.9, { type: "lowpass", freq: 3200, to: 180, q: 0.7 }, { attack: 0.004 }),
      hiss(0.25, 0.5, { type: "highpass", freq: 2500 }, { attack: 0.002 }),
    ],
  },
  "reward.coins": {
    cooldown: 0.1,
    volume: 0.55,
    voices: [
      tone(1800, 2400, 0.12, 0.35, { wave: "triangle" }),
      tone(2400, 3000, 0.16, 0.3, { at: 0.07, wave: "triangle" }),
    ],
  },
};

/** Names the game and the rules engine already use, mapped to the sound that answers them. */
export const effectAliases: Record<string, EffectName> = {
  "card.played": "card.play",
  "card.drawn": "card.draw",
  "card.discarded": "card.discard",
  "spell.cast": "spell.cast",
  "energy.generated": "energy.gain",
  "damage.dealt": "combat.hit",
  "creature.attacked": "combat.attack",
  "creature.destroyed": "creature.die",
  "life.restored": "life.heal",
};
export const effectFor = (type: string): EffectName | undefined =>
  type in effects ? (type as EffectName) : effectAliases[type];
/** Which engine events make a sound, in order of importance: one sound per step so a busy turn stays readable. */
/** Sounds the game plays right now. The rest stay defined (and keep their files) so one can be switched back on by adding its name here. */
export const enabledEffects: ReadonlySet<EffectName> = new Set<EffectName>([
  "ui.scene",
  "spell.cast",
  "spell.fire",
  "spell.ice",
  "spell.water",
  "spell.lightning",
  "life.heal",
  "card.play",
  "draft.pick",
  "pack.open",
  "pack.burst",
  "combat.attack",
  "combat.hit",
  "creature.die",
]);
/** Ambience is built but switched off until there are recordings worth hearing. */
export const ambienceAvailable = false;
/** What a spell sounds like is up to the spell: its element, not its faction. Spells not listed fall back to what they do. */
const spellElements: Record<string, EffectName> = {
  "strike-the-hammer": "spell.lightning",
  puncture: "spell.lightning",
  volley: "spell.lightning",
  revenge: "spell.fire",
  rockslide: "spell.fire",
  avalanche: "spell.fire",
  "moment-of-glory": "spell.fire",
  "song-of-war": "spell.fire",
  sabotage: "spell.fire",
  assassination: "spell.ice",
  death: "spell.ice",
  "plague-wind": "spell.ice",
  "raise-undead": "spell.ice",
  "grave-exchange": "spell.ice",
  "cleansing-light": "spell.water",
  "battlefield-hymn": "spell.water",
  "borrowed-wisdom": "spell.water",
  "find-gold": "spell.water",
  "close-ranks": "spell.water",
};
export const spellEffect = (spell: { id: string; cast?: readonly { id: string }[] }): EffectName =>
  spellElements[spell.id] ??
  (spell.cast?.some((a) => a.id === "damage")
    ? "spell.fire"
    : spell.cast?.some((a) => a.id === "heal" || a.id === "draw")
      ? "spell.water"
      : "spell.cast");
export const soundOrder = ["spell.cast", "card.played", "life.restored"];

/** A bed is a quiet loop under the music. Synthesised beds are only a stand-in: noise shaped by a slow filter. */
export type Bed = {
  gain: number;
  noise: { type: BiquadFilterType; freq: number; q?: number; sweep?: number; rate?: number };
  /** Occasional soft crackles or knocks. */ pops?: { every: number; freq: number; gain: number };
};
export const beds = {
  wind: { gain: 0.5, noise: { type: "bandpass", freq: 420, q: 0.5, sweep: 220, rate: 0.07 } },
  library: {
    gain: 0.28,
    noise: { type: "lowpass", freq: 260, q: 0.4 },
    pops: { every: 6, freq: 900, gain: 0.05 },
  },
  embers: {
    gain: 0.45,
    noise: { type: "bandpass", freq: 650, q: 0.6, sweep: 180, rate: 0.09 },
    pops: { every: 1.2, freq: 2400, gain: 0.18 },
  },
  market: { gain: 0.4, noise: { type: "bandpass", freq: 900, q: 0.35, sweep: 260, rate: 0.12 } },
  hall: {
    gain: 0.4,
    noise: { type: "lowpass", freq: 340, q: 0.4, sweep: 80, rate: 0.05 },
    pops: { every: 0.8, freq: 2800, gain: 0.22 },
  },
  road: { gain: 0.45, noise: { type: "bandpass", freq: 520, q: 0.45, sweep: 240, rate: 0.06 } },
} satisfies Record<string, Bed>;
export type BedName = keyof typeof beds;

/** The bed under each screen. A screen not listed has none. The match has its own sound and stays quiet. */
export const screenBeds: Record<string, BedName> = {
  menu: "wind",
  multiplayer: "wind",
  cards: "library",
  builder: "library",
  stats: "library",
  packs: "embers",
  store: "market",
  profile: "hall",
  quest: "road",
  draft: "embers",
};
