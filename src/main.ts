import { Synth } from './audio/synth';
import { Practice, type Mode } from './engine/practice';
import { autoTranspose, prepare, type PNote, type Range } from './engine/prepare';
import { connectComputerKeys } from './input/keys';
import { MicInput } from './input/mic';
import { connectMidi } from './input/midi';
import { fetchBundled, listBundled, listSaved, removeSaved, saveSong } from './library';
import { ACCEPT, loadSong } from './song/load';
import type { Role, Song } from './song/types';
import { Roll, type KeyState } from './view/roll';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

// ---------- Settings (remembered between visits) ----------

interface Settings {
  mode: Mode;
  device: Range;
  fold: boolean;
  labels: boolean;
  zoom: number;
  volume: number;
  monitor: boolean;
}

const defaults: Settings = {
  mode: 'wait',
  device: { lo: 36, hi: 84 }, // 49 keys, C2 to C6
  fold: true,
  labels: true,
  zoom: 3.2,
  volume: 0.8,
  monitor: true,
};

function readSettings(): Settings {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem('keys-wizard') ?? '{}') };
  } catch {
    return { ...defaults };
  }
}

const settings = readSettings();
function saveSettings(): void {
  try {
    localStorage.setItem('keys-wizard', JSON.stringify(settings));
  } catch {
    // Storage can be blocked. Settings then last for this visit only.
  }
}

// ---------- State ----------

const synth = new Synth();
const practice = new Practice();
const roll = new Roll($<HTMLCanvasElement>('roll'));
const pressed = new Map<number, KeyState>();
let song: Song | null = null;
let notes: PNote[] = [];
let transpose = 0;
let loopA: number | null = null;
let shownDone = false;

synth.setVolume(settings.volume);
roll.lookahead = settings.zoom;
practice.mode = settings.mode;

// ---------- Song loading ----------

function rebuild(keepTime: boolean): void {
  if (!song) return;
  notes = prepare(song, { transpose, fold: settings.fold ? settings.device : null });
  practice.load(notes, song.duration, keepTime);
  roll.setNotes(notes, settings.device);
  $('oct-out').textContent = `${transpose > 0 ? '+' : ''}${transpose / 12}`;
}

async function openSong(name: string, bytes: Uint8Array, remember: boolean): Promise<void> {
  const error = $('error');
  error.hidden = true;
  try {
    const loaded = await loadSong(name, bytes);
    song = loaded;
    transpose = autoTranspose(loaded, settings.device);
    practice.playing = false;
    practice.loop = null;
    loopA = null;
    shownDone = false;
    rebuild(false);
    if (remember) await saveSong({ name, title: loaded.title, added: Date.now(), bytes });

    $('song-title').textContent = loaded.title;
    $('song-meta').textContent = [loaded.artist, loaded.format].filter(Boolean).join(' · ');
    for (const id of ['song-info', 'controls', 'progress', 'hud']) $(id).hidden = false;
    $('start').hidden = true;
    $('done').hidden = true;
    renderTracks();
    renderLoop();
    syncControls();
  } catch (e) {
    error.textContent = e instanceof Error && e.message ? e.message : 'Something went wrong reading that file.';
    error.hidden = false;
    showStart();
  }
}

async function openFile(file: File): Promise<void> {
  await openSong(file.name, new Uint8Array(await file.arrayBuffer()), true);
}

function showStart(): void {
  practice.playing = false;
  synth.allOff();
  song = null;
  for (const id of ['song-info', 'controls', 'progress', 'hud', 'done', 'tracks-panel', 'settings-panel']) {
    $(id).hidden = true;
  }
  $('start').hidden = false;
  void renderShelves();
}

async function renderShelves(): Promise<void> {
  const [bundled, saved] = await Promise.all([listBundled(), listSaved()]);

  const bundledList = $('bundled-list');
  bundledList.replaceChildren(
    ...bundled.map((b) => {
      const li = document.createElement('li');
      const card = songCard(b.title, b.composer, b.level);
      card.title = `${b.provenance} Licence: ${b.license}.`;
      card.onclick = async () => openSong(b.file, await fetchBundled(b.file), false);
      li.append(card);
      return li;
    }),
  );

  $('saved-shelf').hidden = saved.length === 0;
  $('saved-list').replaceChildren(
    ...saved.map((s) => {
      const li = document.createElement('li');
      const card = songCard(s.title, s.name, '');
      card.onclick = () => openSong(s.name, s.bytes, false);
      const remove = document.createElement('button');
      remove.className = 'remove';
      remove.textContent = '✕';
      remove.title = 'Forget this song';
      remove.setAttribute('aria-label', `Forget ${s.title}`);
      remove.onclick = async () => {
        await removeSaved(s.name);
        void renderShelves();
      };
      li.append(card, remove);
      return li;
    }),
  );
}

function songCard(title: string, sub: string, tag: string): HTMLButtonElement {
  const card = document.createElement('button');
  card.className = 'song-card';
  const text = document.createElement('div');
  const strong = document.createElement('strong');
  strong.textContent = title;
  const small = document.createElement('small');
  small.textContent = sub;
  text.append(strong, small);
  card.append(text);
  if (tag) {
    const em = document.createElement('em');
    em.textContent = tag;
    card.append(em);
  }
  return card;
}

// ---------- Tracks ----------

function renderTracks(): void {
  if (!song) return;
  const current = song;
  $('tracks-list').replaceChildren(
    ...current.tracks.map((t) => {
      const row = document.createElement('div');
      row.className = 'track';
      const name = document.createElement('div');
      name.className = 'track-name';
      const strong = document.createElement('strong');
      strong.textContent = t.name;
      const info = document.createElement('span');
      info.textContent = `${t.percussion ? 'Drums' : t.instrument || 'Instrument'} · ${t.noteCount} notes`;
      name.append(strong, info);

      const select = document.createElement('select');
      select.setAttribute('aria-label', `Role for ${t.name}`);
      const roles: [Role, string][] = t.percussion
        ? [['mute', 'Muted']]
        : [['play', 'I play this'], ['backing', 'Plays along'], ['mute', 'Muted']];
      for (const [value, label] of roles) select.add(new Option(label, value, false, t.role === value));
      select.disabled = t.percussion;
      select.onchange = () => {
        t.role = select.value as Role;
        rebuild(true);
      };
      row.append(name, select);
      return row;
    }),
  );
}

// ---------- Playing notes ----------

function noteOn(midi: number, velocity: number, source: 'keys' | 'mic'): void {
  if (source === 'keys' && settings.monitor) synth.noteOn(midi, velocity);
  if (!song) {
    pressed.set(midi, 'free');
    return;
  }
  // Hands on the keyboard: playing the first glowing key starts the song.
  if (!practice.playing && !practice.finished && practice.mode !== 'listen' && $('done').hidden) {
    const wanted = source === 'mic'
      ? [...practice.targets].some((p) => (p - midi) % 12 === 0)
      : practice.targets.has(midi);
    if (wanted) {
      // Skip the lead-in so this first note counts.
      const next = practice.nextStep;
      if (next && next.time > practice.time) practice.seek(next.time);
      setPlaying(true);
    }
  }
  const result = practice.playing ? practice.press(midi, source === 'mic') : 'free';
  pressed.set(midi, result);
  if (result !== 'free') roll.burst(midi, result === 'hit');
}

function noteOff(midi: number): void {
  synth.noteOff(midi);
  pressed.delete(midi);
}

const fromKeys = { noteOn: (m: number, v: number) => noteOn(m, v, 'keys'), noteOff };
const mic = new MicInput({ noteOn: (m, v) => noteOn(m, v, 'mic'), noteOff });

// ---------- Transport ----------

function setPlaying(on: boolean): void {
  if (!song) return;
  if (on && practice.finished) practice.restart();
  practice.playing = on;
  if (on) {
    shownDone = false;
    $('done').hidden = true;
  }
  syncControls();
}

function restart(): void {
  practice.restart();
  shownDone = false;
  $('done').hidden = true;
  setPlaying(true);
}

function syncControls(): void {
  $('play').textContent = practice.playing ? '⏸' : '▶';
  document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((b) => {
    b.setAttribute('aria-checked', String(b.dataset.mode === practice.mode));
  });
}

function renderLoop(): void {
  const bar = $('progress-loop');
  const loop = practice.loop;
  $('loop-a').classList.toggle('on', loopA !== null);
  $('loop-b').classList.toggle('on', loop !== null);
  $('loop-clear').hidden = loopA === null;
  if (!loop || !song) {
    bar.style.display = 'none';
    return;
  }
  bar.style.display = 'block';
  bar.style.left = `${(loop.a / song.duration) * 100}%`;
  bar.style.width = `${((loop.b - loop.a) / song.duration) * 100}%`;
}

function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function setText(id: string, text: string): void {
  const el = $(id);
  if (el.textContent !== text) el.textContent = text;
}

// ---------- The frame loop ----------

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;

  if (song) {
    for (const n of practice.advance(dt)) {
      synth.play(n.midi, n.velocity, n.duration / practice.speed, n.play ? 0.85 : 0.5);
    }
    $('progress-fill').style.width = `${Math.max(0, Math.min(1, practice.time / song.duration)) * 100}%`;
    setText('hud-acc', `${Math.round(practice.accuracy * 100)}%`);
    setText('hud-streak', String(practice.stats.streak));
    setText('hud-time', clock(practice.time));
    setText('hud-total', `/ ${clock(song.duration)}`);

    let hint = '';
    if (!synth.ready) hint = 'Click anywhere to turn on sound';
    else if (!practice.playing && !practice.finished) {
      hint = practice.mode === 'listen' ? 'Press Space to listen' : 'Play the glowing key, or press Space, to begin';
    } else if (notes.every((n) => !n.play) && practice.mode !== 'listen') {
      hint = 'No track is set to “I play this”. Open Tracks to pick one.';
    }
    setText('hint', hint);
    $('hint').hidden = hint === '';

    if (practice.finished && !shownDone) {
      shownDone = true;
      showDone();
    }
  }

  roll.draw(
    {
      notes,
      state: practice.state,
      time: practice.time,
      waiting: practice.waiting,
      targets: song && practice.mode !== 'listen' ? practice.targets : new Set(),
      pressed,
      device: settings.device,
      labels: settings.labels,
    },
    dt,
  );
  requestAnimationFrame(frame);
}

function showDone(): void {
  syncControls();
  const s = practice.stats;
  const listened = practice.mode === 'listen';
  const acc = Math.round(practice.accuracy * 100);
  $('done-title').textContent = listened
    ? 'That is the song. Ready to try it?'
    : acc >= 95 ? 'Spellbinding!' : acc >= 80 ? 'Nicely done!' : 'You made it through!';
  $('done-acc').textContent = listened ? '—' : `${acc}%`;
  $('done-hits').textContent = String(s.hits);
  $('done-wrong').textContent = String(s.wrong + s.missed);
  $('done-streak').textContent = String(s.bestStreak);
  $('done-again').textContent = listened ? 'Let me play it' : 'Play it again';
  $('done').hidden = false;
}

// ---------- Wiring ----------

$('play').onclick = () => setPlaying(!practice.playing);
$('restart').onclick = restart;
$('home').onclick = showStart;
$('done-home').onclick = showStart;
$('done-again').onclick = () => {
  if (practice.mode === 'listen') {
    practice.mode = 'wait';
    settings.mode = 'wait';
    saveSettings();
  }
  restart();
};

document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((b) => {
  b.onclick = () => {
    practice.mode = b.dataset.mode as Mode;
    settings.mode = practice.mode;
    saveSettings();
    practice.seek(practice.time);
    syncControls();
  };
});

const speed = $<HTMLInputElement>('speed');
speed.oninput = () => {
  practice.speed = Number(speed.value) / 100;
  $('speed-out').textContent = `${speed.value}%`;
};

$('oct-down').onclick = () => {
  transpose = Math.max(-36, transpose - 12);
  rebuild(true);
};
$('oct-up').onclick = () => {
  transpose = Math.min(36, transpose + 12);
  rebuild(true);
};

$('loop-a').onclick = () => {
  loopA = Math.max(0, practice.time);
  practice.loop = null;
  renderLoop();
};
$('loop-b').onclick = () => {
  if (loopA === null || practice.time < loopA + 0.5) return;
  practice.loop = { a: loopA, b: practice.time };
  practice.seek(loopA - 1);
  renderLoop();
};
$('loop-clear').onclick = () => {
  loopA = null;
  practice.loop = null;
  renderLoop();
};

$('progress').onclick = (e) => {
  if (!song) return;
  const rect = $('progress').getBoundingClientRect();
  practice.seek(((e.clientX - rect.left) / rect.width) * song.duration - 0.5);
  shownDone = false;
  $('done').hidden = true;
};

// Panels
function togglePanel(panelId: string): void {
  for (const [p, b] of [['tracks-panel', 'tracks-btn'], ['settings-panel', 'settings-btn']]) {
    const show = p === panelId ? $(p).hidden : false;
    $(p).hidden = !show;
    $(b).setAttribute('aria-expanded', String(show));
  }
}
$('tracks-btn').onclick = () => togglePanel('tracks-panel');
$('settings-btn').onclick = () => togglePanel('settings-panel');

// Settings controls
const deviceSize = $<HTMLSelectElement>('device-size');
deviceSize.value = `${settings.device.lo}-${settings.device.hi}`;
deviceSize.onchange = () => {
  const [lo, hi] = deviceSize.value.split('-').map(Number);
  settings.device = { lo, hi };
  saveSettings();
  if (song) transpose = autoTranspose(song, settings.device);
  rebuild(true);
};
const bindCheck = (id: string, key: 'fold' | 'labels' | 'monitor', after?: () => void) => {
  const el = $<HTMLInputElement>(id);
  el.checked = settings[key];
  el.onchange = () => {
    settings[key] = el.checked;
    saveSettings();
    after?.();
  };
};
bindCheck('fold', 'fold', () => rebuild(true));
bindCheck('labels', 'labels');
bindCheck('monitor', 'monitor', () => synth.allOff());

const zoom = $<HTMLInputElement>('zoom');
zoom.value = String(settings.zoom);
zoom.oninput = () => {
  settings.zoom = Number(zoom.value);
  roll.lookahead = settings.zoom;
  saveSettings();
};
const volume = $<HTMLInputElement>('volume');
volume.value = String(settings.volume);
volume.oninput = () => {
  settings.volume = Number(volume.value);
  synth.setVolume(settings.volume);
  saveSettings();
};

// Files: the button, the big drop target, and dropping anywhere on the page.
const fileInput = $<HTMLInputElement>('file');
fileInput.accept = ACCEPT;
fileInput.onchange = () => {
  const file = fileInput.files?.[0];
  fileInput.value = '';
  if (file) void openFile(file);
};
$('open-btn').onclick = () => fileInput.click();
$('drop').onclick = () => fileInput.click();

let dragDepth = 0;
window.addEventListener('dragenter', (e) => {
  if (!e.dataTransfer?.types.includes('Files')) return;
  dragDepth++;
  $('dropping').hidden = false;
});
window.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) $('dropping').hidden = true;
});
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  $('dropping').hidden = true;
  const file = e.dataTransfer?.files[0];
  if (file) void openFile(file);
});

// Keyboard shortcuts
window.addEventListener('keydown', (e) => {
  const target = e.target as HTMLElement | null;
  if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
  if (e.code === 'Space' && song) {
    e.preventDefault();
    setPlaying(!practice.playing);
  } else if (e.code === 'Home' && song) {
    restart();
  } else if (e.code === 'Escape') {
    $('tracks-panel').hidden = true;
    $('settings-panel').hidden = true;
  }
});

// Sound can only start after a click or key press.
const unlock = () => void synth.unlock();
window.addEventListener('pointerdown', unlock);
window.addEventListener('keydown', unlock);

// Clicking the on-screen keys plays them too.
const canvas = $<HTMLCanvasElement>('roll');
const pointerNotes = new Map<number, number>();
canvas.addEventListener('pointerdown', (e) => {
  const rect = canvas.getBoundingClientRect();
  const midi = roll.keyAt(e.clientX - rect.left, e.clientY - rect.top);
  if (midi < 0) return;
  canvas.setPointerCapture(e.pointerId);
  pointerNotes.set(e.pointerId, midi);
  void synth.unlock();
  noteOn(midi, 0.8, 'keys');
});
const release = (e: PointerEvent) => {
  const midi = pointerNotes.get(e.pointerId);
  if (midi === undefined) return;
  pointerNotes.delete(e.pointerId);
  noteOff(midi);
};
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);

// Inputs
connectComputerKeys(fromKeys);
void connectMidi(fromKeys, (status) => {
  const chip = $('midi-chip');
  chip.classList.toggle('ok', status.state === 'connected');
  chip.classList.toggle('warn', status.state === 'denied' || status.state === 'unsupported');
  if (status.state === 'connected') {
    chip.textContent = `MIDI: ${status.devices.join(', ')}`;
    chip.title = `Connected: ${status.devices.join(', ')}`;
  } else if (status.state === 'none') {
    chip.textContent = 'MIDI: plug in a keyboard';
  } else if (status.state === 'denied') {
    chip.textContent = 'MIDI: permission needed';
    chip.title = 'Allow MIDI devices for this page in your browser, then reload.';
  } else {
    chip.textContent = 'MIDI: not supported here';
    chip.title = 'This browser has no Web MIDI. Chrome, Edge, and Firefox do.';
  }
});

const micBtn = $('mic-btn');
micBtn.onclick = async () => {
  if (mic.active) {
    mic.stop();
    micBtn.textContent = 'Mic off';
    micBtn.classList.remove('ok');
    return;
  }
  try {
    await mic.start();
    micBtn.textContent = 'Mic listening';
    micBtn.classList.add('ok');
  } catch {
    micBtn.textContent = 'Mic blocked';
    micBtn.classList.add('warn');
  }
};

speed.value = '100';
syncControls();
void renderShelves();
requestAnimationFrame(frame);
