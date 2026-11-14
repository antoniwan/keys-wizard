import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Midi } from '@tonejs/midi';
import { detectPitch, hzToMidi } from '../src/input/pitch';
import { loadSong } from '../src/song/load';
import { parseTab } from '../src/song/tab';

const songsDir = path.resolve(__dirname, '../public/songs');

describe('bundled song library (the legal gate, see AGENTS.md)', () => {
  const index = JSON.parse(fs.readFileSync(path.join(songsDir, 'index.json'), 'utf8')) as {
    file: string; license: string; provenance: string;
  }[];
  const allowed = ['CC0-1.0', 'CC-BY-4.0', 'CC-BY-SA-4.0', 'Public-Domain'];

  it('every song file is listed with a licence and where it came from', () => {
    const files = fs.readdirSync(songsDir).filter((f) => !['index.json', 'README.md'].includes(f));
    expect(files.sort()).toEqual(index.map((s) => s.file).sort());
    for (const s of index) {
      expect(allowed, `${s.file} licence`).toContain(s.license);
      expect(s.provenance.length, `${s.file} provenance`).toBeGreaterThan(20);
    }
  });

  it('every bundled Guitar Pro file loads and has notes to play', async () => {
    for (const s of index) {
      const song = await loadSong(s.file, new Uint8Array(fs.readFileSync(path.join(songsDir, s.file))));
      expect(song.format).toBe('Guitar Pro');
      expect(song.notes.length).toBeGreaterThan(20);
      expect(song.tracks.some((t) => t.role === 'play')).toBe(true);
    }
  });

  it('reads hands as separate tracks with real pitches', async () => {
    const bytes = new Uint8Array(fs.readFileSync(path.join(songsDir, 'ode-to-joy.gp')));
    const song = await loadSong('ode-to-joy.gp', bytes);
    expect(song.title).toBe('Ode to Joy');
    expect(song.tracks.map((t) => t.name)).toEqual(['Right Hand', 'Left Hand']);
    const right = song.notes.filter((n) => n.track === 0).slice(0, 4).map((n) => n.midi);
    expect(right).toEqual([64, 64, 65, 67]);
  });
});

describe('MIDI files', () => {
  it('loads tracks and mutes drums', async () => {
    const midi = new Midi();
    const piano = midi.addTrack();
    piano.name = 'Piano';
    piano.addNote({ midi: 60, time: 0, duration: 0.5 }).addNote({ midi: 64, time: 0.5, duration: 0.5 });
    const drums = midi.addTrack();
    drums.channel = 9;
    drums.addNote({ midi: 36, time: 0, duration: 0.1 });

    const song = await loadSong('My_Song.mid', midi.toArray());
    expect(song.title).toBe('My Song');
    expect(song.tracks.map((t) => [t.name, t.role])).toEqual([['Piano', 'play'], ['Standard kit', 'mute']]);
    expect(song.duration).toBeCloseTo(1);
  });

  it('gives a clear error for a broken file', async () => {
    await expect(loadSong('bad.mid', new Uint8Array([1, 2, 3]))).rejects.toThrow(/valid MIDI/);
  });
});

describe('text tab', () => {
  const tab = [
    'Tempo: 120',
    'e|--0-----------|',
    'B|----1---------|',
    'G|------0-------|',
    'D|--------2-----|',
    'A|--3-------12--|',
    'E|--------------|',
  ].join('\n');

  it('turns frets into pitches, one sixteenth per column', () => {
    const song = parseTab(tab, 'riff');
    const got = song.notes.map((n) => [n.midi, Number(n.time.toFixed(3))]);
    // column 2: open high E (64) with C on the A string (48); 16th at 120bpm = 0.125s
    expect(got).toEqual([[48, 0.25], [64, 0.25], [60, 0.5], [55, 0.75], [52, 1], [57, 1.25]]);
  });

  it('respects drop tunings written at the start of a line', () => {
    const song = parseTab(tab.replace('E|-----', 'D|--0--'), 'drop d');
    expect(Math.min(...song.notes.map((n) => n.midi))).toBe(38);
  });

  it('says so when there is no tab', () => {
    expect(() => parseTab('just some words', 'x')).toThrow(/No tab found/);
  });
});

describe('microphone pitch detection', () => {
  it.each([[110, 45], [261.63, 60], [440, 69], [987.77, 83]])('hears %d Hz as MIDI %d', (hz, midi) => {
    const rate = 48000;
    const buf = new Float32Array(2048);
    for (let i = 0; i < buf.length; i++) {
      const t = i / rate;
      buf[i] = 0.4 * Math.sin(2 * Math.PI * hz * t) + 0.15 * Math.sin(2 * Math.PI * hz * 2 * t);
    }
    expect(hzToMidi(detectPitch(buf, rate)!)).toBe(midi);
  });

  it('ignores silence', () => {
    expect(detectPitch(new Float32Array(2048), 48000)).toBeNull();
  });
});
