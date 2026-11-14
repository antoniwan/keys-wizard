import { NOTE_HIT, NOTE_MISSED } from '../engine/practice';
import type { PNote } from '../engine/prepare';
import { noteName } from '../song/types';
import { TRACK_COLORS, type Frame } from './roll';

/**
 * A grand staff (treble and bass clef) that scrolls with the song.
 *
 * It is here to teach where each key sits on the staff, so it shows pitch
 * only: note heads on the right line or space, with sharps. It does not
 * draw rhythm (stems, beams, rests). How long a note lasts is the faint
 * tail behind its head, and the falling notes below.
 *
 * The keys you hold appear on the staff at the playhead as you press them.
 */

// For each of the 12 pitch classes: which letter (C=0 .. B=6) and whether it is sharp.
const LETTER = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
const SHARP = [false, true, false, true, false, false, true, false, true, false, true, false];

/** Staff steps above middle C. Each line or space is one step. */
export function staffStep(midi: number): number {
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return (octave - 4) * 7 + LETTER[pc];
}

export function isSharp(midi: number): boolean {
  return SHARP[((midi % 12) + 12) % 12];
}

/**
 * The steps that need a short ledger line for a note at `step`.
 * Treble lines sit at steps 2..10, bass lines at -10..-2, middle C at 0.
 */
export function ledgerSteps(step: number): number[] {
  const out: number[] = [];
  if (step >= 12) for (let s = 12; s <= step; s += 2) out.push(s);
  else if (step <= -12) for (let s = -12; s >= step; s -= 2) out.push(s);
  else if (step === 0) out.push(0);
  return out;
}

const PLAYHEAD = 118;
const PX_PER_SEC = 120;
const MUSIC_FONT = '"Segoe UI Symbol", "Noto Music", "Apple Symbols", serif';

export class Staff {
  private ctx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private trackColor = new Map<number, number>();
  private maxDuration = 1;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
  }

  setNotes(notes: PNote[]): void {
    this.trackColor.clear();
    this.maxDuration = 1;
    for (const n of notes) {
      this.maxDuration = Math.max(this.maxDuration, n.duration);
      if (n.play) this.trackColor.set(n.track, 0);
    }
    [...this.trackColor.keys()].sort((a, b) => a - b).forEach((track, i) => this.trackColor.set(track, i));
  }

  private resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  draw(f: Frame): void {
    const { ctx, width, height } = this;
    if (width === 0 || height === 0) return;
    ctx.clearRect(0, 0, width, height);

    // Room for two ledger lines above the treble staff and below the bass staff (C2 to C6).
    const gap = (height - 20) / 15;
    const half = gap / 2;
    const midY = height / 2;
    const y = (step: number) => midY - step * half;

    // The ten staff lines.
    ctx.strokeStyle = 'rgba(236,233,251,0.38)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const step of [2, 4, 6, 8, 10, -2, -4, -6, -8, -10]) {
      const ly = Math.round(y(step)) + 0.5;
      ctx.moveTo(8, ly);
      ctx.lineTo(width - 8, ly);
    }
    ctx.stroke();

    // Clefs. The treble clef curls around G4, the bass clef's dots sit around F3.
    ctx.fillStyle = 'rgba(236,233,251,0.85)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = `${gap * 7.4}px ${MUSIC_FONT}`;
    ctx.fillText('\u{1D11E}', 38, y(2) + gap * 1.35);
    ctx.font = `${gap * 4.3}px ${MUSIC_FONT}`;
    ctx.fillText('\u{1D122}', 38, y(-10) + gap * 0.35);

    // Notes scroll right to left and pass under the playhead as they are due.
    ctx.save();
    ctx.beginPath();
    ctx.rect(70, 0, width - 70, height);
    ctx.clip();

    const from = f.time - (PLAYHEAD - 70) / PX_PER_SEC - this.maxDuration;
    const until = f.time + (width - PLAYHEAD) / PX_PER_SEC;
    for (let k = lowerBound(f.notes, from); k < f.notes.length; k++) {
      const n = f.notes[k];
      if (n.time > until) break;
      if (!n.play) continue;
      const x = PLAYHEAD + (n.time - f.time) * PX_PER_SEC;
      const state = f.state[k];
      const due = state !== NOTE_HIT && state !== NOTE_MISSED && f.targets.has(n.midi) && n.time <= f.time + 0.31;
      const color = TRACK_COLORS[(this.trackColor.get(n.track) ?? 0) % TRACK_COLORS.length].fill;
      const fill = state === NOTE_MISSED ? '#ff5d73' : due ? '#ffd76a' : color;
      const alpha = state === NOTE_HIT ? 0.3 : x < PLAYHEAD - 4 && !due ? 0.45 : 1;

      // Tail: how long the note lasts.
      ctx.globalAlpha = alpha * 0.28;
      ctx.fillStyle = fill;
      ctx.fillRect(x, y(staffStep(n.midi)) - 1.5, Math.max(0, n.duration * PX_PER_SEC - 6), 3);
      ctx.globalAlpha = alpha;
      this.head(n.midi, x, y, gap, fill, due);
      if (due && f.labels) {
        ctx.fillStyle = '#ffd76a';
        ctx.font = `700 ${Math.max(10, gap * 1.2)}px system-ui, sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(noteName(n.midi, false), x + gap * 1.1, y(staffStep(n.midi)));
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // Playhead.
    ctx.fillStyle = f.waiting ? '#ffd76a' : 'rgba(255,255,255,0.5)';
    ctx.fillRect(PLAYHEAD - 1, 6, 2, height - 12);

    // The keys you are holding, shown where they live on the staff.
    for (const [midi, result] of f.pressed) {
      const fill = result === 'wrong' ? '#ff5d73' : result === 'hit' ? '#62f2a8' : '#8fb8ff';
      ctx.globalAlpha = 0.95;
      this.head(midi, PLAYHEAD - gap * 2.6, y, gap, fill, false);
    }
    ctx.globalAlpha = 1;
  }

  /** One note head, with its ledger lines and sharp sign. */
  private head(midi: number, x: number, y: (step: number) => number, gap: number, fill: string, glow: boolean): void {
    const ctx = this.ctx;
    const step = staffStep(midi);
    const cy = y(step);
    const rx = gap * 0.66;

    ctx.strokeStyle = 'rgba(236,233,251,0.7)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (const s of ledgerSteps(step)) {
      const ly = Math.round(y(s)) + 0.5;
      ctx.moveTo(x - rx * 1.7, ly);
      ctx.lineTo(x + rx * 1.7, ly);
    }
    ctx.stroke();

    ctx.fillStyle = fill;
    if (glow) {
      ctx.shadowColor = fill;
      ctx.shadowBlur = 12;
    }
    ctx.beginPath();
    ctx.ellipse(x, cy, rx, gap * 0.48, -0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    if (isSharp(midi)) {
      ctx.font = `${gap * 1.9}px ${MUSIC_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('♯', x - rx * 2.1, cy);
    }
  }
}

function lowerBound(notes: PNote[], time: number): number {
  let lo = 0;
  let hi = notes.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (notes[mid].time < time) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
