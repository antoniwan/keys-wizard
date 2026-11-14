import type { Song } from '../song/types';

/** A note as it will be shown and played: transposed, with its track's role baked in. */
export interface PNote {
  midi: number;
  time: number;
  duration: number;
  velocity: number;
  track: number;
  /** True when this note is yours to play, false for backing. */
  play: boolean;
}

export interface Range {
  lo: number;
  hi: number;
}

export interface PrepareOptions {
  /** Semitones added to every note. */
  transpose: number;
  /** When set, notes you play are moved by octaves until they fit this range. */
  fold: Range | null;
}

function foldInto(midi: number, range: Range): number {
  if (range.hi - range.lo < 11) return midi;
  while (midi < range.lo) midi += 12;
  while (midi > range.hi) midi -= 12;
  return midi;
}

export function prepare(song: Song, opts: PrepareOptions): PNote[] {
  const out: PNote[] = [];
  for (const n of song.notes) {
    const track = song.tracks[n.track];
    if (track.role === 'mute') continue;
    const play = track.role === 'play';
    let midi = n.midi + (track.percussion ? 0 : opts.transpose);
    if (play && opts.fold) midi = foldInto(midi, opts.fold);
    if (midi < 0 || midi > 127) continue;
    out.push({ midi, time: n.time, duration: n.duration, velocity: n.velocity, track: n.track, play });
  }
  return out;
}

/**
 * Picks the octave shift that puts the most of your notes on your keyboard.
 * Guitar and bass parts often sit lower than a 49-key board reaches.
 */
export function autoTranspose(song: Song, range: Range): number {
  const mine = song.notes.filter((n) => song.tracks[n.track].role === 'play');
  if (mine.length === 0) return 0;
  let best = 0;
  let bestScore = -1;
  for (const shift of [0, 12, -12, 24, -24, 36, -36]) {
    let inRange = 0;
    for (const n of mine) if (n.midi + shift >= range.lo && n.midi + shift <= range.hi) inRange++;
    if (inRange > bestScore) {
      best = shift;
      bestScore = inRange;
    }
  }
  return best;
}
