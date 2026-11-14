import { Midi } from '@tonejs/midi';
import { prettyInstrument } from './midi';
import { buildSong, SongError, type RawTrack, type Song } from './types';

/**
 * Reads Guitar Pro (.gp3 to .gp), MusicXML, and alphaTex files with alphaTab.
 * alphaTab plays the score into a MIDI file for us, which takes care of
 * repeats, tempo changes, ties, and tunings. We then read the notes back out.
 * The library is large, so it loads only when one of these files is opened.
 */
export async function parseScore(bytes: Uint8Array, fallbackTitle: string, format: string): Promise<Song> {
  const alphaTab = await import('@coderline/alphatab');
  const settings = new alphaTab.Settings();

  let score;
  try {
    score = alphaTab.importer.ScoreLoader.loadScoreFromBytes(bytes, settings);
  } catch {
    throw new SongError(`Could not read this ${format} file. It may be damaged or an unsupported version.`);
  }

  const file = new alphaTab.midi.MidiFile();
  const handler = new alphaTab.midi.AlphaSynthMidiFileHandler(file, true);
  new alphaTab.midi.MidiFileGenerator(score, settings, handler).generate();
  const midi = new Midi(file.toBinary());

  // Each score track owns two MIDI channels. Map channels back to tracks.
  const byChannel = new Map<number, number>();
  const raw: RawTrack[] = score.tracks.map((t, i) => {
    byChannel.set(t.playbackInfo.primaryChannel, i);
    byChannel.set(t.playbackInfo.secondaryChannel, i);
    return { name: t.name, instrument: '', percussion: t.isPercussion, notes: [] };
  });
  for (const t of midi.tracks) {
    const target = raw[byChannel.get(t.channel) ?? -1];
    if (!target) continue;
    if (!target.instrument) target.instrument = prettyInstrument(t.instrument.name);
    for (const n of t.notes) {
      target.notes.push({ midi: n.midi, time: n.time, duration: n.duration, velocity: n.velocity });
    }
  }
  return buildSong(score.title || fallbackTitle, score.artist || '', format, raw);
}
