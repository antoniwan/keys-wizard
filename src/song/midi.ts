import { Midi } from '@tonejs/midi';
import { buildSong, SongError, type RawTrack, type Song } from './types';

export function parseMidi(bytes: Uint8Array, fallbackTitle: string): Song {
  let midi: Midi;
  try {
    midi = new Midi(bytes);
  } catch {
    throw new SongError('This does not look like a valid MIDI file.');
  }
  const raw: RawTrack[] = midi.tracks.map((t) => ({
    name: t.name || prettyInstrument(t.instrument.name),
    instrument: prettyInstrument(t.instrument.name),
    percussion: t.instrument.percussion || t.channel === 9,
    notes: t.notes.map((n) => ({ midi: n.midi, time: n.time, duration: n.duration, velocity: n.velocity })),
  }));
  return buildSong(midi.name || fallbackTitle, '', 'MIDI', raw);
}

export function prettyInstrument(name: string): string {
  if (!name) return '';
  return name.charAt(0).toUpperCase() + name.slice(1);
}
