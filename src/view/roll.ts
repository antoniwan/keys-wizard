import { NOTE_HIT, NOTE_MISSED } from '../engine/practice';
import type { PNote, Range } from '../engine/prepare';
import { isBlackKey, noteName } from '../song/types';

export type KeyState = 'hit' | 'wrong' | 'free';

export interface Frame {
  notes: PNote[];
  state: Uint8Array;
  time: number;
  waiting: boolean;
  /** Pitches the song wants next. */
  targets: ReadonlySet<number>;
  /** Keys held down right now. */
  pressed: ReadonlyMap<number, KeyState>;
  /** The reach of the player's own keyboard. */
  device: Range;
  labels: boolean;
  /** Draw a faint line from each coming note down to its key. */
  guides: boolean;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

// One colour per playable track: first is usually the right hand, second the left.
export const TRACK_COLORS = [
  { fill: '#5ee1ff', dark: '#2a9fd0' },
  { fill: '#ffb454', dark: '#d9832a' },
  { fill: '#c792ff', dark: '#9258dc' },
  { fill: '#7dffb0', dark: '#3fc27a' },
];

/** Draws the falling notes and the keyboard on one canvas. */
export class Roll {
  private ctx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private lo = 36;
  private hi = 84;
  private whiteWidth = 20;
  private keyX = new Float32Array(128);
  private keyW = new Float32Array(128);
  private sparks: Spark[] = [];
  private trackColor = new Map<number, number>();
  private maxDuration = 1;
  /** True when the player asked the system for less motion. */
  private calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  /** Seconds of music visible above the keyboard. */
  lookahead = 3.2;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
  }

  /** Call when the song or its tracks change. */
  setNotes(notes: PNote[], device: Range): void {
    let lo = device.lo;
    let hi = device.hi;
    this.maxDuration = 1;
    this.trackColor.clear();
    for (const n of notes) {
      lo = Math.min(lo, n.midi);
      hi = Math.max(hi, n.midi);
      this.maxDuration = Math.max(this.maxDuration, n.duration);
      if (n.play) this.trackColor.set(n.track, 0);
    }
    // Colour playable tracks in track order, so the first (often the right hand) is always the same colour.
    [...this.trackColor.keys()].sort((a, b) => a - b).forEach((track, i) => this.trackColor.set(track, i));
    // Snap to whole octaves: from a C up to a C.
    this.lo = Math.max(21, Math.floor(lo / 12) * 12);
    this.hi = Math.min(108, Math.ceil(hi / 12) * 12);
    this.layout();
  }

  private resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.layout();
  }

  private layout(): void {
    let whites = 0;
    for (let m = this.lo; m <= this.hi; m++) if (!isBlackKey(m)) whites++;
    this.whiteWidth = this.width / Math.max(1, whites);
    const blackWidth = this.whiteWidth * 0.62;
    let x = 0;
    for (let m = this.lo; m <= this.hi; m++) {
      if (isBlackKey(m)) {
        this.keyX[m] = x - blackWidth / 2;
        this.keyW[m] = blackWidth;
      } else {
        this.keyX[m] = x;
        this.keyW[m] = this.whiteWidth;
        x += this.whiteWidth;
      }
    }
  }

  private get keyboardHeight(): number {
    return Math.max(84, Math.min(170, this.height * 0.2, this.whiteWidth * 5.2));
  }

  /** Which key is under this point of the canvas, or -1. */
  keyAt(x: number, y: number): number {
    const top = this.height - this.keyboardHeight;
    if (y < top) return -1;
    if (y < top + this.keyboardHeight * 0.62) {
      for (let m = this.lo; m <= this.hi; m++) {
        if (isBlackKey(m) && x >= this.keyX[m] && x < this.keyX[m] + this.keyW[m]) return m;
      }
    }
    for (let m = this.lo; m <= this.hi; m++) {
      if (!isBlackKey(m) && x >= this.keyX[m] && x < this.keyX[m] + this.keyW[m]) return m;
    }
    return -1;
  }

  /** A little burst where a note lands. */
  burst(midi: number, good: boolean): void {
    if (midi < this.lo || midi > this.hi || this.calm) return;
    const x = this.keyX[midi] + this.keyW[midi] / 2;
    const y = this.height - this.keyboardHeight;
    for (let i = 0; i < (good ? 10 : 5); i++) {
      this.sparks.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 160,
        vy: -60 - Math.random() * 180,
        life: 1,
        color: good ? '#9dffd0' : '#ff6b81',
      });
    }
  }

  draw(f: Frame, dt: number): void {
    const { ctx, width, height } = this;
    const kbH = this.keyboardHeight;
    const hitY = height - kbH;
    const pxPerSec = hitY / this.lookahead;
    ctx.clearRect(0, 0, width, height);

    // Lanes: a faint line at every C, and a shade over keys beyond the player's keyboard.
    for (let m = this.lo; m <= this.hi; m++) {
      if (m % 12 === 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.07)';
        ctx.fillRect(this.keyX[m], 0, 1, hitY);
      } else if (m % 12 === 5) {
        ctx.fillStyle = 'rgba(255,255,255,0.03)';
        ctx.fillRect(this.keyX[m], 0, 1, hitY);
      }
    }
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    if (f.device.lo > this.lo) ctx.fillRect(0, 0, this.keyX[f.device.lo], hitY);
    if (f.device.hi < this.hi) {
      const x = this.keyX[f.device.hi] + this.keyW[f.device.hi];
      ctx.fillRect(x, 0, width - x, hitY);
    }

    // Falling notes. Notes are sorted by time, so find the first one that can be on screen.
    const from = f.time - this.maxDuration - 0.3;
    let i = lowerBound(f.notes, from);
    const until = f.time + this.lookahead;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

    // Guide lines first, so they stay behind the notes: a faint line from each
    // coming note down to the key it lands on.
    if (f.guides) {
      for (let k = i; k < f.notes.length; k++) {
        const n = f.notes[k];
        if (n.time > until) break;
        if (!n.play || n.midi < this.lo || n.midi > this.hi) continue;
        const state = f.state[k];
        const bottom = hitY - (n.time - f.time) * pxPerSec;
        if (state === NOTE_HIT || state === NOTE_MISSED || bottom >= hitY - 2 || bottom < 0) continue;
        ctx.globalAlpha = f.targets.has(n.midi) ? 0.34 : 0.17;
        ctx.fillStyle = TRACK_COLORS[(this.trackColor.get(n.track) ?? 0) % TRACK_COLORS.length].fill;
        ctx.fillRect(Math.round(this.keyX[n.midi] + this.keyW[n.midi] / 2) - 0.5, bottom, 1, hitY - bottom);
      }
      ctx.globalAlpha = 1;
    }

    for (let pass = 0; pass < 2; pass++) {
      // Backing first, then your notes on top.
      for (let k = i; k < f.notes.length; k++) {
        const n = f.notes[k];
        if (n.time > until) break;
        if (n.play !== (pass === 1)) continue;
        if (n.midi < this.lo || n.midi > this.hi) continue;
        const bottom = hitY - (n.time - f.time) * pxPerSec;
        const h = Math.max(6, n.duration * pxPerSec - 2);
        const top = bottom - h;
        if (bottom < 0 || top > hitY) continue;
        const w = Math.max(4, this.keyW[n.midi] - 2);
        const x = this.keyX[n.midi] + 1;
        const state = f.state[k];

        if (!n.play) {
          ctx.fillStyle = 'rgba(160,150,210,0.16)';
          roundRect(ctx, x + w * 0.2, top, w * 0.6, Math.min(h, hitY - top), 3);
          ctx.fill();
          continue;
        }
        const color = TRACK_COLORS[(this.trackColor.get(n.track) ?? 0) % TRACK_COLORS.length];
        ctx.globalAlpha = state === NOTE_HIT ? 0.35 : 1;
        ctx.fillStyle = state === NOTE_MISSED ? '#ff5d73' : isBlackKey(n.midi) ? color.dark : color.fill;
        if (state !== NOTE_HIT && state !== NOTE_MISSED && f.targets.has(n.midi) && bottom > hitY - 6) {
          ctx.shadowColor = color.fill;
          ctx.shadowBlur = 18;
        }
        roundRect(ctx, x, top, w, Math.min(h, hitY - top), Math.min(6, w / 3));
        ctx.fill();
        ctx.shadowBlur = 0;
        if (f.labels && w >= 15 && state !== NOTE_HIT) {
          ctx.fillStyle = 'rgba(8,6,24,0.85)';
          ctx.font = `600 ${Math.min(13, w * 0.52)}px system-ui, sans-serif`;
          ctx.fillText(noteName(n.midi, false), x + w / 2, Math.min(bottom, hitY) - 3);
        }
        ctx.globalAlpha = 1;
      }
      if (pass === 0) i = lowerBound(f.notes, from);
    }

    // The line where notes land.
    ctx.fillStyle = f.waiting ? '#ffd76a' : 'rgba(255,255,255,0.5)';
    ctx.fillRect(0, hitY - 2, width, 2);

    this.drawKeyboard(f, hitY, kbH);

    // Sparks.
    for (const s of this.sparks) {
      s.life -= dt * 2.2;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 380 * dt;
      if (s.life <= 0) continue;
      ctx.globalAlpha = s.life;
      ctx.fillStyle = s.color;
      ctx.fillRect(s.x - 2, s.y - 2, 4, 4);
    }
    ctx.globalAlpha = 1;
    this.sparks = this.sparks.filter((s) => s.life > 0);
  }

  private drawKeyboard(f: Frame, top: number, h: number): void {
    const ctx = this.ctx;
    const pulse = this.calm ? 0.85 : 0.65 + 0.35 * Math.sin(performance.now() / 160);
    ctx.fillStyle = '#0a0814';
    ctx.fillRect(0, top, this.width, h);

    const tint = (m: number, base: string): string => {
      const pressed = f.pressed.get(m);
      if (pressed === 'wrong') return '#ff5d73';
      if (pressed === 'hit') return '#62f2a8';
      if (pressed === 'free') return '#8fb8ff';
      return base;
    };

    for (let m = this.lo; m <= this.hi; m++) {
      if (isBlackKey(m)) continue;
      const x = this.keyX[m];
      const w = this.keyW[m];
      const outside = m < f.device.lo || m > f.device.hi;
      ctx.fillStyle = tint(m, outside ? '#8d8aa3' : '#f3f1fa');
      roundRect(ctx, x + 0.5, top, w - 1, h - 1, 4);
      ctx.fill();
      if (f.targets.has(m) && !f.pressed.has(m)) {
        ctx.fillStyle = `rgba(255,205,70,${f.waiting ? pulse : 0.45})`;
        roundRect(ctx, x + 0.5, top, w - 1, h - 1, 4);
        ctx.fill();
      }
      if (w >= 13 && (m % 12 === 0 || (f.labels && f.targets.has(m)))) {
        ctx.fillStyle = 'rgba(20,16,40,0.7)';
        ctx.font = `600 ${Math.min(12, w * 0.5)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(noteName(m, m % 12 === 0), x + w / 2, top + h - 6);
      }
    }
    const blackH = h * 0.62;
    for (let m = this.lo; m <= this.hi; m++) {
      if (!isBlackKey(m)) continue;
      const x = this.keyX[m];
      const w = this.keyW[m];
      ctx.fillStyle = tint(m, '#16122b');
      roundRect(ctx, x, top, w, blackH, 3);
      ctx.fill();
      if (f.targets.has(m) && !f.pressed.has(m)) {
        ctx.fillStyle = `rgba(255,190,50,${f.waiting ? pulse : 0.5})`;
        roundRect(ctx, x, top, w, blackH, 3);
        ctx.fill();
      }
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

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  if (h <= 0 || w <= 0) return;
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
}
