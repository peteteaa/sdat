import type { AudioEngine } from './audio';
import { clamp, damp } from './layout';
import type { Track } from './tracks';

export type DeckStatus = 'empty' | 'loading' | 'reading' | 'playing' | 'paused' | 'stopped' | 'ejecting';

export interface DeckUI {
  selected: number;
  loaded: number | null;
  status: DeckStatus;
}

/** Seconds into each animation at which a phase ends. */
export const LOAD_T = { fly: 0.85, drop: 1.2, close: 1.5, read: 2.2 };
export const EJECT_T = { open: 0.3, rise: 0.55, fly: 1.35 };

export type ButtonName = 'prev' | 'play' | 'stop' | 'next' | 'open';

/**
 * Transport state machine. Mutable and read every frame by the 3D components;
 * React only hears about coarse changes through `onChange`.
 */
export class Deck {
  readonly tracks: Track[];
  readonly engine: AudioEngine;
  private onChange: (ui: DeckUI) => void;

  scroll = 0;
  scrollTarget = 0;
  lid = 0;
  spin = 0;
  clock = 0;
  anim: { kind: 'load' | 'eject'; index: number; t: number } | null = null;
  loaded: number | null = null;
  status: DeckStatus = 'empty';
  presses: Partial<Record<ButtonName, number>> = {};

  private queue: number | null = null;
  private lastScrollInput = -1;
  private lastUi = '';

  constructor(tracks: Track[], engine: AudioEngine, onChange: (ui: DeckUI) => void) {
    this.tracks = tracks;
    this.engine = engine;
    this.onChange = onChange;
  }

  get selected() {
    return clamp(Math.round(this.scrollTarget), 0, this.tracks.length - 1);
  }

  scrollBy(delta: number) {
    this.scrollTarget = clamp(this.scrollTarget + delta, -0.4, this.tracks.length - 0.6);
    this.lastScrollInput = this.clock;
  }

  scrollTo(i: number) {
    this.scrollTarget = clamp(i, 0, this.tracks.length - 1);
    this.emit();
  }

  press(name: ButtonName) {
    this.presses[name] = this.clock;
    this.engine.sfx('click');
    if (name === 'prev') this.skip(-1);
    else if (name === 'next') this.skip(1);
    else if (name === 'play') this.togglePlay();
    else if (name === 'stop') this.stop();
    else this.eject();
  }

  load(i: number) {
    this.engine.unlock();
    this.scrollTo(i);
    if (this.anim) {
      this.queue = i;
      return;
    }
    if (this.loaded === i) {
      if (this.status !== 'playing') this.togglePlay();
      return;
    }
    if (this.loaded !== null) {
      this.queue = i;
      this.startEject();
    } else {
      this.startLoad(i);
    }
  }

  eject() {
    this.engine.unlock();
    if (this.anim || this.loaded === null) return;
    this.queue = null;
    this.startEject();
  }

  togglePlay() {
    this.engine.unlock();
    if (this.anim) return;
    if (this.loaded === null) {
      this.load(this.selected);
      return;
    }
    if (this.status === 'playing') {
      this.engine.pause();
      this.status = 'paused';
    } else if (this.status === 'paused') {
      this.engine.resume();
      this.status = 'playing';
    } else {
      this.engine.play(this.tracks[this.loaded]);
      this.status = 'playing';
    }
    this.emit();
  }

  stop() {
    if (this.anim || this.loaded === null) return;
    this.engine.stop();
    this.status = 'stopped';
    this.emit();
  }

  skip(dir: 1 | -1) {
    const n = this.tracks.length;
    const base = this.anim?.kind === 'load' ? this.anim.index : (this.loaded ?? this.selected);
    const next = (base + dir + n) % n;
    if (this.loaded === null && !this.anim) this.scrollTo(next);
    else this.load(next);
  }

  private startLoad(i: number) {
    this.anim = { kind: 'load', index: i, t: 0 };
    this.status = 'loading';
    this.emit();
  }

  private startEject() {
    this.engine.stop();
    this.engine.sfx('eject');
    this.anim = { kind: 'eject', index: this.loaded!, t: 0 };
    this.loaded = null;
    this.status = 'ejecting';
    this.emit();
  }

  update(dt: number) {
    this.clock += dt;

    if (this.lastScrollInput >= 0 && this.clock - this.lastScrollInput > 0.16) {
      this.lastScrollInput = -1;
      this.scrollTarget = this.selected;
      this.emit();
    }
    this.scroll = damp(this.scroll, this.scrollTarget, 9, dt);

    let lidTarget = 0;
    const a = this.anim;
    if (a) {
      a.t += dt;
      if (a.kind === 'load') {
        lidTarget = a.t < LOAD_T.drop ? 1 : 0;
        if (a.t >= LOAD_T.close && this.status === 'loading') {
          this.status = 'reading';
          this.emit();
        }
        if (a.t >= LOAD_T.read) {
          this.anim = null;
          this.loaded = a.index;
          const q = this.queue;
          this.queue = null;
          if (q !== null && q !== a.index) {
            this.startEject();
            this.queue = q;
          } else {
            this.engine.play(this.tracks[a.index]);
            this.status = 'playing';
            this.emit();
          }
        }
      } else {
        lidTarget = a.t < EJECT_T.fly - 0.3 || this.queue !== null ? 1 : 0;
        if (a.t >= EJECT_T.fly) {
          this.anim = null;
          this.status = 'empty';
          const q = this.queue;
          this.queue = null;
          if (q !== null) this.startLoad(q);
          else this.emit();
        }
      }
    }

    this.lid = damp(this.lid, lidTarget, 9, dt);
    const spinTarget = this.status === 'playing' ? 2.4 : this.status === 'reading' ? 18 : 0;
    this.spin = damp(this.spin, spinTarget, 4, dt);
  }

  /** Whether cassette `i` sits on the transport (so its hubs turn). */
  isMounted(i: number) {
    return this.loaded === i || (this.anim?.kind === 'load' && this.anim.index === i && this.anim.t > LOAD_T.drop);
  }

  private emit() {
    const ui: DeckUI = {
      selected: this.selected,
      loaded: this.anim?.kind === 'load' ? this.anim.index : this.loaded,
      status: this.status,
    };
    const key = `${ui.selected}|${ui.loaded}|${ui.status}`;
    if (key === this.lastUi) return;
    this.lastUi = key;
    this.onChange(ui);
  }
}
