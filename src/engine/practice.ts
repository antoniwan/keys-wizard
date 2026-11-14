import type { PNote } from './prepare';

/**
 * wait:   the song stops at each note until you play it. No pressure.
 * flow:   the song keeps going at tempo and scores your timing.
 * listen: the song plays itself so you can hear and watch it.
 */
export type Mode = 'wait' | 'flow' | 'listen';

export type PressResult = 'hit' | 'wrong' | 'free';

export const NOTE_PENDING = 0;
export const NOTE_HIT = 1;
export const NOTE_MISSED = 2;

/** Notes that start together, to be played together. */
export interface Step {
  time: number;
  pitches: number[];
  /** Indexes into the notes array. */
  notes: number[];
}

export interface Stats {
  hits: number;
  wrong: number;
  missed: number;
  streak: number;
  bestStreak: number;
}

/** How far ahead of a note (in song seconds) a press still counts. */
const EARLY = 0.3;
/** Flow mode: how late a press still counts. */
const LATE = 0.25;
/** Notes closer together than this are one chord. */
const CHORD = 0.035;
const LEAD_IN = 2;

export function buildSteps(notes: PNote[]): Step[] {
  const steps: Step[] = [];
  notes.forEach((n, i) => {
    if (!n.play) return;
    const last = steps[steps.length - 1];
    if (last && n.time - last.time <= CHORD) {
      last.notes.push(i);
      if (!last.pitches.includes(n.midi)) last.pitches.push(n.midi);
    } else {
      steps.push({ time: n.time, pitches: [n.midi], notes: [i] });
    }
  });
  return steps;
}

export class Practice {
  notes: PNote[] = [];
  steps: Step[] = [];
  state = new Uint8Array(0);
  duration = 0;

  mode: Mode = 'wait';
  speed = 1;
  playing = false;
  finished = false;
  waiting = false;
  /** Song time in seconds. Starts negative for a short lead-in. */
  time = -LEAD_IN;
  loop: { a: number; b: number } | null = null;
  stats: Stats = { hits: 0, wrong: 0, missed: 0, streak: 0, bestStreak: 0 };

  private stepIndex = 0;
  private pending = new Set<number>();
  private soundCursor = 0;

  load(notes: PNote[], duration: number, keepTime = false): void {
    this.notes = notes;
    this.steps = buildSteps(notes);
    this.state = new Uint8Array(notes.length);
    this.duration = duration;
    this.finished = false;
    this.seek(keepTime ? this.time : -LEAD_IN);
    if (!keepTime) this.resetStats();
  }

  resetStats(): void {
    this.stats = { hits: 0, wrong: 0, missed: 0, streak: 0, bestStreak: 0 };
  }

  restart(): void {
    this.resetStats();
    this.finished = false;
    this.seek(this.loop ? this.loop.a - 1 : -LEAD_IN);
  }

  seek(time: number): void {
    this.time = Math.max(-LEAD_IN, Math.min(time, this.duration));
    this.waiting = false;
    this.finished = false;
    this.stepIndex = this.steps.findIndex((s) => s.time >= this.time - 1e-6);
    if (this.stepIndex < 0) this.stepIndex = this.steps.length;
    this.armStep();
    this.soundCursor = this.notes.findIndex((n) => n.time >= this.time);
    if (this.soundCursor < 0) this.soundCursor = this.notes.length;
    // Everything ahead of the playhead is fresh again.
    for (let i = 0; i < this.notes.length; i++) if (this.notes[i].time >= this.time) this.state[i] = NOTE_PENDING;
  }

  /** The pitches the song is waiting for right now, or coming up next. */
  get targets(): ReadonlySet<number> {
    return this.pending;
  }

  get nextStep(): Step | undefined {
    return this.steps[this.stepIndex];
  }

  get accuracy(): number {
    const { hits, wrong, missed } = this.stats;
    const total = hits + wrong + missed;
    return total === 0 ? 1 : hits / total;
  }

  /**
   * Moves the clock forward by `dt` real seconds.
   * Returns the notes the app should sound (backing, or everything in listen mode).
   */
  advance(dt: number): PNote[] {
    if (!this.playing || this.finished) return [];
    let target = this.time + dt * this.speed;
    const step = this.steps[this.stepIndex];

    if (this.mode === 'wait') {
      if (step && target >= step.time) {
        target = step.time;
        this.waiting = true;
      } else {
        this.waiting = false;
      }
    } else if (this.mode === 'flow') {
      while (this.stepIndex < this.steps.length && target > this.steps[this.stepIndex].time + LATE) {
        this.failStep();
      }
    }
    this.time = target;

    const sounds: PNote[] = [];
    while (this.soundCursor < this.notes.length && this.notes[this.soundCursor].time <= this.time) {
      const n = this.notes[this.soundCursor];
      if (!n.play || this.mode === 'listen') sounds.push(n);
      if (n.play && this.mode === 'listen') this.state[this.soundCursor] = NOTE_HIT;
      this.soundCursor++;
    }
    if (this.mode === 'listen') {
      while (this.stepIndex < this.steps.length && this.steps[this.stepIndex].time <= this.time) this.stepIndex++;
      this.armStep();
    }

    if (this.loop && this.time >= this.loop.b) {
      this.seek(this.loop.a - 1);
    } else if (this.time >= this.duration + 0.5 && this.stepIndex >= this.steps.length) {
      this.finished = true;
      this.playing = false;
    }
    return sounds;
  }

  /**
   * You played a note. `anyOctave` is for the microphone, which hears one
   * note at a time and often lands in the wrong octave: the right note name
   * clears the whole step.
   */
  press(midi: number, anyOctave = false): PressResult {
    if (this.mode === 'listen') return 'free';
    const step = this.steps[this.stepIndex];
    if (!step || step.time - this.time > EARLY) return 'free';

    if (anyOctave) {
      const match = [...this.pending].some((p) => (p - midi) % 12 === 0);
      if (!match) return this.miss();
      this.pending.clear();
    } else {
      if (!this.pending.has(midi)) {
        // Pressing a chord note twice is not a mistake.
        return step.pitches.includes(midi) ? 'free' : this.miss();
      }
      this.pending.delete(midi);
    }

    this.stats.hits++;
    this.stats.streak++;
    this.stats.bestStreak = Math.max(this.stats.bestStreak, this.stats.streak);
    for (const i of step.notes) {
      if (anyOctave || this.notes[i].midi === midi) this.state[i] = NOTE_HIT;
    }
    if (this.pending.size === 0) {
      this.stepIndex++;
      this.waiting = false;
      this.armStep();
    }
    return 'hit';
  }

  private miss(): PressResult {
    this.stats.wrong++;
    this.stats.streak = 0;
    return 'wrong';
  }

  private failStep(): void {
    const step = this.steps[this.stepIndex];
    this.stats.missed += this.pending.size;
    this.stats.streak = 0;
    for (const i of step.notes) if (this.state[i] === NOTE_PENDING) this.state[i] = NOTE_MISSED;
    this.stepIndex++;
    this.armStep();
  }

  private armStep(): void {
    this.pending = new Set(this.steps[this.stepIndex]?.pitches ?? []);
  }
}
