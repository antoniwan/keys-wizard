import { describe, expect, it } from 'vitest';
import { buildSteps, NOTE_HIT, NOTE_MISSED, Practice } from '../src/engine/practice';
import { autoTranspose, prepare, type PNote } from '../src/engine/prepare';
import { buildSong } from '../src/song/types';

const note = (midi: number, time: number, play = true): PNote => ({
  midi, time, duration: 0.5, velocity: 0.8, track: play ? 0 : 1, play,
});

function start(notes: PNote[], mode: Practice['mode'] = 'wait'): Practice {
  const p = new Practice();
  p.mode = mode;
  p.load(notes, 4);
  p.playing = true;
  return p;
}

describe('steps', () => {
  it('groups notes that start together into one chord', () => {
    const steps = buildSteps([note(60, 0), note(64, 0.01), note(67, 0.02), note(72, 1), note(40, 1, false)]);
    expect(steps.map((s) => s.pitches)).toEqual([[60, 64, 67], [72]]);
  });
});

describe('wait mode', () => {
  it('stops at a note until it is played', () => {
    const p = start([note(60, 0), note(62, 1)]);
    for (let i = 0; i < 100; i++) p.advance(0.1);
    expect(p.time).toBe(0);
    expect(p.waiting).toBe(true);

    expect(p.press(61)).toBe('wrong');
    expect(p.time).toBe(0);
    expect(p.press(60)).toBe('hit');
    expect(p.state[0]).toBe(NOTE_HIT);

    for (let i = 0; i < 100; i++) p.advance(0.1);
    expect(p.time).toBe(1);
    expect(p.press(62)).toBe('hit');
    for (let i = 0; i < 100; i++) p.advance(0.1);
    expect(p.finished).toBe(true);
    expect(p.stats).toMatchObject({ hits: 2, wrong: 1, bestStreak: 2 });
  });

  it('needs every note of a chord', () => {
    const p = start([note(60, 0), note(64, 0), note(67, 0), note(72, 1)]);
    p.advance(3);
    expect(p.press(60)).toBe('hit');
    expect(p.press(60)).toBe('free'); // pressing it again is not a slip
    expect(p.press(64)).toBe('hit');
    expect([...p.targets]).toEqual([67]);
    expect(p.press(67)).toBe('hit');
    expect([...p.targets]).toEqual([72]);
  });

  it('accepts a note played slightly early, and ignores noodling far from any note', () => {
    const p = start([note(60, 0)]);
    expect(p.press(60)).toBe('free'); // two seconds early, during the lead-in
    p.advance(1.8);
    expect(p.press(60)).toBe('hit');
  });

  it('returns backing notes to sound, but not your own', () => {
    const p = start([note(60, 0), note(40, 0, false)]);
    const sounds = p.advance(2.5);
    expect(sounds.map((n) => n.midi)).toEqual([40]);
  });

  it('microphone presses match any octave and clear the chord', () => {
    const p = start([note(60, 0), note(64, 0), note(62, 1)]);
    p.advance(3);
    expect(p.press(73, true)).toBe('wrong');
    expect(p.press(76, true)).toBe('hit');
    expect([...p.targets]).toEqual([62]);
  });
});

describe('flow mode', () => {
  it('keeps going and marks notes you skipped', () => {
    const p = start([note(60, 0), note(62, 1)], 'flow');
    p.advance(2.1); // lead-in, now at 0.1
    p.advance(0.5);
    expect(p.state[0]).toBe(NOTE_MISSED);
    expect(p.stats.missed).toBe(1);
    p.advance(0.35); // 0.95: just before the second note
    expect(p.press(62)).toBe('hit');
  });
});

describe('flow mode, skipped note', () => {
  it('counts the next note as correct when you skip one and play on in time', () => {
    const p = start([note(60, 0), note(62, 0.4)], 'flow');
    p.advance(2.2); // 0.2: the first note is late but still open
    expect(p.press(62)).toBe('hit');
    expect(p.state[0]).toBe(NOTE_MISSED);
    expect(p.stats).toMatchObject({ hits: 1, missed: 1, wrong: 0 });
  });
});

describe('listen mode', () => {
  it('sounds every note itself', () => {
    const p = start([note(60, 0), note(40, 0, false)], 'listen');
    expect(p.advance(2.5).map((n) => n.midi).sort()).toEqual([40, 60]);
    expect(p.press(60)).toBe('free');
  });
});

describe('loop', () => {
  it('jumps back to the loop start', () => {
    const p = start([note(60, 0), note(62, 1), note(64, 2)], 'listen');
    p.loop = { a: 1, b: 2 };
    p.seek(1.5);
    p.advance(0.6);
    expect(p.time).toBe(0);
  });
});

describe('prepare', () => {
  const song = buildSong('t', '', 'MIDI', [
    { name: 'Guitar', instrument: '', percussion: false, notes: [
      { midi: 28, time: 0, duration: 1, velocity: 0.8 },
      { midi: 40, time: 1, duration: 1, velocity: 0.8 },
      { midi: 52, time: 2, duration: 1, velocity: 0.8 },
    ] },
    { name: 'Drums', instrument: '', percussion: true, notes: [{ midi: 36, time: 0, duration: 0.1, velocity: 1 }] },
  ]);

  it('defaults: you play the melodic track, drums are muted', () => {
    expect(song.tracks.map((t) => t.role)).toEqual(['play', 'mute']);
  });

  it('shifts low parts up to reach a 49-key keyboard', () => {
    expect(autoTranspose(song, { lo: 36, hi: 84 })).toBe(12);
  });

  it('folds stray notes into range', () => {
    const notes = prepare(song, { transpose: 0, fold: { lo: 36, hi: 84 } });
    expect(notes.map((n) => n.midi)).toEqual([40, 40, 52]);
  });
});
