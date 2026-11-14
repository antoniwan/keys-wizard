// Builds the bundled song library: songs-src/*.alphatex -> public/songs/*.gp + index.json
// Every song here must be one we are allowed to share. See AGENTS.md.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as alphaTab from '@coderline/alphatab';
import tone from '@tonejs/midi';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'songs-src');
const out = path.join(root, 'public', 'songs');
const meta = JSON.parse(fs.readFileSync(path.join(src, 'songs.json'), 'utf8'));
const settings = new alphaTab.Settings();
fs.mkdirSync(out, { recursive: true });

const index = [];
for (const m of meta) {
  if (!m.license || !m.provenance) throw new Error(`${m.id}: license and provenance are required`);
  const tex = fs.readFileSync(path.join(src, `${m.id}.alphatex`), 'utf8');
  const score = alphaTab.importer.ScoreLoader.loadAlphaTex(tex, settings);
  const gp = new alphaTab.exporter.Gp7Exporter().export(score, settings);
  fs.writeFileSync(path.join(out, `${m.id}.gp`), gp);

  // Read the .gp back and report what a player will see.
  const back = alphaTab.importer.ScoreLoader.loadScoreFromBytes(gp, settings);
  const file = new alphaTab.midi.MidiFile();
  const handler = new alphaTab.midi.AlphaSynthMidiFileHandler(file, true);
  new alphaTab.midi.MidiFileGenerator(back, settings, handler).generate();
  const midi = new tone.Midi(file.toBinary());
  const notes = midi.tracks.flatMap((t) => t.notes);
  const pitches = notes.map((n) => n.midi);
  console.log(
    `${m.id}: ${back.masterBars.length} bars, ${notes.length} notes, ` +
      `range ${Math.min(...pitches)}-${Math.max(...pitches)}, ${midi.duration.toFixed(1)}s`,
  );
  if (process.argv.includes('--dump')) {
    for (const t of midi.tracks) {
      if (!t.notes.length) continue;
      const head = t.notes.slice(0, 14).map((n) => `${n.name}@${n.time.toFixed(2)}`);
      console.log('  ch', t.channel, head.join(' '));
    }
  }
  index.push({
    file: `${m.id}.gp`,
    title: back.title,
    composer: back.artist,
    level: m.level,
    license: m.license,
    provenance: m.provenance,
  });
}
fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify(index, null, 2) + '\n');
console.log(`Wrote ${index.length} songs to public/songs`);
