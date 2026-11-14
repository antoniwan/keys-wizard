export type Role = 'play' | 'backing' | 'mute';

export interface SongNote {
  midi: number;
  /** Seconds from the start of the song, at the song's own tempo. */
  time: number;
  duration: number;
  /** 0..1 */
  velocity: number;
  track: number;
}

export interface SongTrack {
  id: number;
  name: string;
  instrument: string;
  percussion: boolean;
  noteCount: number;
  lo: number;
  hi: number;
  role: Role;
}

export interface Song {
  title: string;
  artist: string;
  format: string;
  duration: number;
  tracks: SongTrack[];
  /** Sorted by time. */
  notes: SongNote[];
}

export interface RawTrack {
  name: string;
  instrument: string;
  percussion: boolean;
  notes: Omit<SongNote, 'track'>[];
}

export class SongError extends Error {}

/** Turns parsed tracks into a Song: drops empty tracks, sorts notes, picks default roles. */
export function buildSong(title: string, artist: string, format: string, raw: RawTrack[]): Song {
  const kept = raw.filter((t) => t.notes.length > 0);
  if (kept.length === 0) throw new SongError('This file has no notes.');

  const tracks: SongTrack[] = [];
  const notes: SongNote[] = [];
  kept.forEach((t, id) => {
    let lo = 127;
    let hi = 0;
    for (const n of t.notes) {
      const midi = Math.round(n.midi);
      lo = Math.min(lo, midi);
      hi = Math.max(hi, midi);
      notes.push({
        midi,
        time: Math.max(0, n.time),
        duration: Math.max(0.05, n.duration),
        velocity: n.velocity > 0 ? Math.min(1, n.velocity) : 0.7,
        track: id,
      });
    }
    tracks.push({
      id,
      name: t.name.trim() || `Track ${id + 1}`,
      instrument: t.instrument,
      percussion: t.percussion,
      noteCount: t.notes.length,
      lo,
      hi,
      role: 'backing',
    });
  });
  notes.sort((a, b) => a.time - b.time || a.midi - b.midi);

  // Default roles: drums are muted (the synth has no drum kit). One or two
  // melodic tracks are both yours to play (think two hands); with a bigger
  // band you get the first melodic track and the rest plays along.
  const melodic = tracks.filter((t) => !t.percussion);
  for (const t of tracks) if (t.percussion) t.role = 'mute';
  if (melodic.length <= 2) for (const t of melodic) t.role = 'play';
  else melodic[0].role = 'play';

  const duration = notes.reduce((end, n) => Math.max(end, n.time + n.duration), 0);
  return { title: title.trim() || 'Untitled', artist: artist.trim(), format, duration, tracks, notes };
}

const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

export function noteName(midi: number, withOctave = true): string {
  const name = NAMES[((midi % 12) + 12) % 12];
  return withOctave ? `${name}${Math.floor(midi / 12) - 1}` : name;
}

export function isBlackKey(midi: number): boolean {
  return [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12);
}
