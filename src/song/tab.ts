import { buildSong, SongError, type RawTrack, type Song } from './types';

/**
 * Reads plain-text guitar or bass tab, the kind people paste on the web:
 *
 *   e|--0-----3--|
 *   B|----1------|
 *   ...
 *
 * Text tab has no real rhythm, so this is a best effort: every column is one
 * sixteenth note. Wait mode makes that fine for learning the notes.
 */

// Open-string pitches, top line first.
const TUNINGS: Record<number, number[]> = {
  4: [43, 38, 33, 28],
  5: [43, 38, 33, 28, 23],
  6: [64, 59, 55, 50, 45, 40],
  7: [64, 59, 55, 50, 45, 40, 35],
};
const PITCH_CLASS: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const TAB_LINE = /^\s*([A-Ga-g][#b]?)?\s*[|:\]]?\s*([-0-9hpbrxXsS/\\~|()<>*.=^tTvV\s]*-[-0-9hpbrxXsS/\\~|()<>*.=^tTvV\s]*)$/;

interface TabLine {
  label: string;
  body: string;
}

function matchTabLine(line: string): TabLine | null {
  const m = TAB_LINE.exec(line);
  if (!m) return null;
  const body = m[2];
  if ((body.match(/-/g) ?? []).length < 4) return null;
  return { label: m[1] ?? '', body };
}

/** Uses the letter in front of a line ("D|---") to handle drop and alternate tunings. */
function openPitch(standard: number, label: string): number {
  if (!label) return standard;
  let pc = PITCH_CLASS[label[0].toLowerCase()];
  if (label[1] === '#') pc += 1;
  if (label[1] === 'b' && label.length === 2) pc -= 1;
  let best = standard;
  let bestDistance = 99;
  for (let p = standard - 6; p <= standard + 6; p++) {
    if (((p % 12) + 12) % 12 === ((pc % 12) + 12) % 12 && Math.abs(p - standard) < bestDistance) {
      best = p;
      bestDistance = Math.abs(p - standard);
    }
  }
  return best;
}

export function parseTab(text: string, fallbackTitle: string): Song {
  const lines = text.replace(/\r/g, '').split('\n');
  const bpmMatch = /(?:tempo|bpm)\s*[:=]?\s*(\d{2,3})|(\d{2,3})\s*bpm/i.exec(text);
  const bpm = Math.min(240, Math.max(40, Number(bpmMatch?.[1] ?? bpmMatch?.[2] ?? 100)));
  const step = 60 / bpm / 4;

  // Group consecutive tab lines into blocks (one block per row of tab).
  const blocks: TabLine[][] = [];
  let current: TabLine[] = [];
  for (const line of [...lines, '']) {
    const tabLine = matchTabLine(line);
    if (tabLine) current.push(tabLine);
    else {
      if (TUNINGS[current.length]) blocks.push(current);
      current = [];
    }
  }
  if (blocks.length === 0) throw new SongError('No tab found in this text. A tab line looks like this: e|--0--3--|');

  const notes: RawTrack['notes'] = [];
  let offset = 0; // time steps consumed by earlier blocks
  for (const block of blocks) {
    const tuning = TUNINGS[block.length];
    const width = Math.max(...block.map((l) => l.body.length));
    // Bar lines take no time. Work out which time step each column lands on.
    const stepAt: number[] = [];
    let steps = 0;
    for (let col = 0; col < width; col++) {
      stepAt.push(steps);
      const isBar = block.every((l) => col >= l.body.length || l.body[col] === '|' || l.body[col] === ' ');
      if (!isBar) steps++;
    }
    block.forEach((line, stringIndex) => {
      const open = openPitch(tuning[stringIndex], line.label);
      const starts: { step: number; midi: number }[] = [];
      for (let col = 0; col < line.body.length; col++) {
        const ch = line.body[col];
        if (ch < '0' || ch > '9') continue;
        let fret = Number(ch);
        const next = line.body[col + 1];
        if (next >= '0' && next <= '9' && fret * 10 + Number(next) <= 24) {
          fret = fret * 10 + Number(next);
          starts.push({ step: stepAt[col], midi: open + fret });
          col++;
        } else {
          starts.push({ step: stepAt[col], midi: open + fret });
        }
      }
      starts.forEach((s, i) => {
        // Ring until the next note on the same string, up to two beats.
        const until = i + 1 < starts.length ? starts[i + 1].step : steps;
        const length = Math.min(8, Math.max(1, until - s.step));
        notes.push({ midi: s.midi, time: (offset + s.step) * step, duration: length * step, velocity: 0.75 });
      });
    });
    offset += steps;
  }

  const isBass = blocks[0].length <= 5;
  return buildSong(fallbackTitle, '', 'Tab', [
    { name: isBass ? 'Bass' : 'Guitar', instrument: isBass ? 'Bass' : 'Guitar', percussion: false, notes },
  ]);
}
