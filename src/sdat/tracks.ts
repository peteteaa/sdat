export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
} as const;

/** Parameters for the procedural tape music. */
export interface SynthSpec {
  bpm: number;
  /** MIDI note for the tonic in the pad register. */
  root: number;
  scale: readonly number[];
  /** Scale degree the chord of each bar is built on. */
  progression: number[];
  sevenths?: boolean;
  pad: OscillatorType;
  padLevel?: number;
  lead: OscillatorType;
  /** 16 steps: chord-tone index (0-7, >3 = next octave) or null for a rest. */
  arp: (number | null)[];
  /** Probability that an arp step actually sounds. */
  density: number;
  /** 16 steps: 1 = bass hit. */
  bass: number[];
  drums: 'none' | 'soft' | 'beat' | 'heavy';
  /** Delay applied to odd 16ths, as a fraction of a step. */
  swing?: number;
  /** Pad low-pass cutoff in Hz. */
  brightness: number;
  bells?: boolean;
  cicadas?: boolean;
  drone?: boolean;
  seed: number;
}

export interface Track {
  pgm: number;
  title: string;
  subtitle: string;
  /** Label colour on the cassette. */
  color: string;
  /** Band colour at the top of the label. */
  accent: string;
  /** Audio file URL. When set it plays instead of the synth. */
  src?: string;
  /** Procedural fallback used when there is no `src`. */
  synth?: SynthSpec;
}

const _ = null;

/** Generated tapes, used when sdatmusic/ has no audio files. */
export const SYNTH_TRACKS: Track[] = [
  {
    pgm: 25,
    title: 'Rooftop, 4 PM',
    subtitle: 'side A · lo-fi',
    color: '#e8a54b',
    accent: '#2a2150',
    synth: {
      bpm: 76, root: 50, scale: SCALES.major, progression: [0, 5, 3, 4], sevenths: true,
      pad: 'triangle', lead: 'triangle', drums: 'soft', swing: 0.14, brightness: 1500, density: 0.7,
      arp: [0, _, 2, _, 1, _, 3, _, 4, _, 2, _, 1, _, 3, _],
      bass: [1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0],
      seed: 25,
    },
  },
  {
    pgm: 26,
    title: 'Cicadas',
    subtitle: 'side A · summer',
    color: '#8cc07a',
    accent: '#1c3b2a',
    synth: {
      bpm: 60, root: 52, scale: SCALES.lydian, progression: [0, 1, 0, 4], sevenths: true,
      pad: 'sine', padLevel: 0.06, lead: 'sine', drums: 'none', brightness: 1100, density: 0.45,
      arp: [4, _, _, 2, _, _, 5, _, _, 3, _, _, 1, _, _, _],
      bass: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      bells: true, cicadas: true, seed: 26,
    },
  },
  {
    pgm: 27,
    title: 'Last Train to Tokyo-3',
    subtitle: 'side A · unit 00',
    color: '#6f9be8',
    accent: '#f2f0ea',
    synth: {
      bpm: 98, root: 57, scale: SCALES.dorian, progression: [0, 0, 3, 4],
      pad: 'sawtooth', padLevel: 0.022, lead: 'square', drums: 'beat', brightness: 2200, density: 0.85,
      arp: [0, 1, 2, 4, 2, 1, 0, 1, 2, 4, 5, 4, 2, 1, 2, 3],
      bass: [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0],
      seed: 27,
    },
  },
  {
    pgm: 28,
    title: 'Cage 01',
    subtitle: 'side B · berserk',
    color: '#8a5cd6',
    accent: '#7ee06a',
    synth: {
      bpm: 84, root: 45, scale: SCALES.phrygian, progression: [0, 1, 0, 6],
      pad: 'sawtooth', padLevel: 0.025, lead: 'sawtooth', drums: 'heavy', brightness: 800, density: 0.6,
      arp: [0, _, _, 1, _, _, 0, _, 4, _, _, 3, _, 2, _, 1],
      bass: [1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 1],
      drone: true, seed: 28,
    },
  },
  {
    pgm: 29,
    title: 'Apartment 11-A-2',
    subtitle: 'side B · city pop',
    color: '#f07aa0',
    accent: '#2b2150',
    synth: {
      bpm: 112, root: 53, scale: SCALES.major, progression: [3, 4, 2, 5], sevenths: true,
      pad: 'triangle', lead: 'square', drums: 'beat', swing: 0.06, brightness: 2600, density: 0.75,
      arp: [4, _, 3, 2, _, 1, 2, _, 4, _, 5, 4, _, 2, 1, _],
      bass: [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 0, 0],
      seed: 29,
    },
  },
  {
    pgm: 30,
    title: 'Terminal Dogma',
    subtitle: 'side B · unit 02',
    color: '#d9453f',
    accent: '#f4c542',
    synth: {
      bpm: 52, root: 43, scale: SCALES.minor, progression: [0, 5], sevenths: true,
      pad: 'sine', padLevel: 0.07, lead: 'sine', drums: 'none', brightness: 650, density: 0.3,
      arp: [4, _, _, _, _, _, 6, _, _, _, 5, _, _, _, _, _],
      bass: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      bells: true, drone: true, seed: 30,
    },
  },
];

/* ------------------------------------------------------- sdatmusic/ */

// Every audio file in /sdatmusic becomes a cassette. Vite bundles them as assets.
const FILES = import.meta.glob('../../sdatmusic/*.{mp3,m4a,aac,ogg,oga,wav,flac,opus}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

/** Label text for known files, in wheel order. Keyed by filename without extension. */
const LABELS: [file: string, title: string, subtitle: string][] = [
  ['FLY ME TO THE MOON (Instrumental Version)', 'Fly Me to the Moon', 'instrumental'],
  ["Evangelion - Rahbari - Beethoven's 9th Symphony 4th Movement Ode to Joy", 'Ode to Joy', 'Beethoven · Rahbari'],
  ['Masami Okui - Ryoute Ippai no Yume (1995)', 'Ryoute Ippai no Yume', 'Masami Okui · 1995'],
  ['Lilia ~from Ys~ - 01 you are the only one', 'You Are the Only One', 'Lilia · from Ys'],
  ['Lilia ~from Ys~ - 03 blue legend', 'Blue Legend', 'Lilia · from Ys'],
  ['Lilia ~from Ys~ - Ribbon of the Heart (Translated to english Sub. Español)', 'Ribbon of the Heart', 'Lilia · from Ys'],
];

/** "Artist - 01 Song (Extra)" -> title "Song", subtitle "Artist". */
function parseName(name: string): [string, string] {
  const parts = name.split(' - ');
  const title = (parts.pop() ?? name).replace(/^\d+\s*[-.]?\s*/, '').replace(/\s*[([].*$/, '').trim() || name;
  return [title, parts.join(' · ')];
}

const fileTracks: Track[] = Object.entries(FILES)
  .map(([path, src]) => {
    const name = decodeURIComponent(path.split('/').pop()!).replace(/\.[^.]+$/, '');
    const known = LABELS.findIndex(([f]) => f === name);
    const [title, subtitle] = known >= 0 ? [LABELS[known][1], LABELS[known][2]] : parseName(name);
    return { name, src, title, subtitle, order: known >= 0 ? known : LABELS.length };
  })
  .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
  .map(({ src, title, subtitle }, i) => {
    const look = SYNTH_TRACKS[i % SYNTH_TRACKS.length];
    return { pgm: 25 + i, title, subtitle, src, color: look.color, accent: look.accent };
  });

export const DEFAULT_TRACKS: Track[] = fileTracks.length ? fileTracks : SYNTH_TRACKS;
