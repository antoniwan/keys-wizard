import { Synth } from './audio/synth';
import { Practice, type Mode } from './engine/practice';
import { autoTranspose, prepare, type PNote, type Range } from './engine/prepare';
import { connectComputerKeys } from './input/keys';
import { MicInput } from './input/mic';
import { connectMidi, type MidiStatus } from './input/midi';
import { detectBrowser, midiHelp } from './input/midi-help';
import { fetchBundled, listBundled, listSaved, removeSaved, saveSong } from './library';
import { ACCEPT, loadSong } from './song/load';
import type { Role, Song } from './song/types';
import { Roll, type Frame, type KeyState } from './view/roll';
import { Staff } from './view/staff';

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
  staff: boolean;
  guides: boolean;
}

const defaults: Settings = {
  mode: 'wait',
  device: { lo: 36, hi: 84 }, // 49 keys, C2 to C6
  fold: true,
  labels: true,
  zoom: 3.2,
  volume: 0.8,
  monitor: true,
  staff: true,
  guides: true,
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
const staff = new Staff($<HTMLCanvasElement>('staff'));
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
  staff.setNotes(notes);
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

    document.title = `${loaded.title} · Keys Wizard`;
    $('song-title').textContent = loaded.title;
    $('song-meta').textContent = [loaded.artist, loaded.format].filter(Boolean).join(' · ');
    for (const id of ['song-info', 'controls', 'progress', 'hud']) $(id).hidden = false;
    $('start').hidden = true;
    $('done').hidden = true;
    syncStaff();
    renderTracks();
    renderLoop();
    syncControls();
  } catch (e) {
    error.textContent = e instanceof Error && e.message ? e.message : 'Keys Wizard cannot read this file.';
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
  document.title = 'Keys Wizard';
  pressed.clear();
  syncStaff();
  void renderShelves();
}

async function renderShelves(): Promise<void> {
  const [bundled, saved] = await Promise.all([listBundled(), listSaved()]);

  const bundledList = $('bundled-list');
  bundledList.replaceChildren(
    ...bundled.map((b) => {
      const li = document.createElement('li');
      const card = songCard(b.title, b.composer, b.level);
      card.title = `${b.provenance} License: ${b.license}.`;
      card.dataset.umamiEvent = 'cta';
      card.dataset.umamiEventLabel = 'free-song';
      card.dataset.umamiEventSong = b.file;
      card.onclick = async () => {
        try {
          await openSong(b.file, await fetchBundled(b.file), false);
        } catch {
          $('error').textContent = 'Keys Wizard cannot load this song. Check your connection and try again.';
          $('error').hidden = false;
        }
      };
      li.append(card);
      return li;
    }),
  );

  $('saved-shelf').hidden = saved.length === 0;
  $('saved-list').replaceChildren(
    ...saved.map((s) => {
      const li = document.createElement('li');
      const card = songCard(s.title, s.name, '');
      // Counted as a click only. The name of a person's own song never leaves the browser.
      card.dataset.umamiEvent = 'cta';
      card.dataset.umamiEventLabel = 'saved-song';
      card.onclick = () => openSong(s.name, s.bytes, false);
      const remove = document.createElement('button');
      remove.className = 'remove';
      remove.textContent = '✕';
      remove.title = 'Remove this song from the list';
      remove.setAttribute('aria-label', `Remove ${s.title} from the list`);
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
      info.textContent = `${t.percussion ? 'Drums (no drum sound)' : t.instrument || 'Instrument'} · ${t.noteCount} notes`;
      name.append(strong, info);

      const select = document.createElement('select');
      select.setAttribute('aria-label', `Role for ${t.name}`);
      const roles: [Role, string][] = t.percussion
        ? [['mute', 'Muted']]
        : [['play', 'I play this'], ['backing', 'Plays with me'], ['mute', 'Muted']];
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

function syncStaff(): void {
  $('staff').hidden = !song || !settings.staff;
  $('staff-btn').classList.toggle('on', settings.staff);
  $('staff-btn').setAttribute('aria-pressed', String(settings.staff));
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
    if (!synth.ready) hint = 'Click the page to turn on the sound';
    else if (!practice.playing && !practice.finished) {
      hint = practice.mode === 'listen' ? 'Press Space to listen' : 'Play the bright key or press Space to start';
    } else if (notes.every((n) => !n.play) && practice.mode !== 'listen') {
      hint = 'No track is set to “I play this”. Open Tracks and select one.';
    }
    setText('hint', hint);
    $('hint').hidden = hint === '';

    if (practice.finished && !shownDone) {
      shownDone = true;
      showDone();
    }
  }

  const view: Frame = {
      notes,
      state: practice.state,
      time: practice.time,
      waiting: practice.waiting,
      targets: song && practice.mode !== 'listen' ? practice.targets : new Set(),
      pressed,
      device: settings.device,
      labels: settings.labels,
      guides: settings.guides,
  };
  roll.draw(view, dt);
  if (song && settings.staff) staff.draw(view);
  requestAnimationFrame(frame);
}

function showDone(): void {
  syncControls();
  const s = practice.stats;
  const listened = practice.mode === 'listen';
  const acc = Math.round(practice.accuracy * 100);
  $('done-title').textContent = listened
    ? 'The song is complete. Now you play it.'
    : acc >= 95 ? 'Excellent' : acc >= 80 ? 'Good work' : 'Song complete';
  $('done-stats').hidden = listened;
  $('done-acc').textContent = listened ? '—' : `${acc}%`;
  $('done-hits').textContent = String(s.hits);
  $('done-wrong').textContent = String(s.wrong + s.missed);
  $('done-streak').textContent = String(s.bestStreak);
  $('done-again').textContent = listened ? 'Play it myself' : 'Play again';
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

speed.ondblclick = () => {
  speed.value = '100';
  speed.dispatchEvent(new Event('input'));
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

$('staff-btn').onclick = () => {
  settings.staff = !settings.staff;
  saveSettings();
  syncStaff();
};

// Panels
function togglePanel(panelId: string): void {
  for (const [p, b] of [
    ['tracks-panel', 'tracks-btn'],
    ['settings-panel', 'settings-btn'],
    ['midi-panel', 'midi-chip'],
  ]) {
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
const bindCheck = (id: string, key: 'fold' | 'labels' | 'monitor' | 'guides', after?: () => void) => {
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
bindCheck('guides', 'guides');
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
  // A focused button uses Space for itself. Do not also play or pause.
  if (e.code === 'Space' && target?.tagName === 'BUTTON') return;
  if (e.code === 'Space' && song) {
    e.preventDefault();
    setPlaying(!practice.playing);
  } else if (e.code === 'Home' && song) {
    restart();
  } else if (e.code === 'Escape') {
    $('tracks-panel').hidden = true;
    $('settings-panel').hidden = true;
    $('midi-panel').hidden = true;
    $('midi-chip').setAttribute('aria-expanded', 'false');
  }
});

// If the window loses focus, release all notes so that none stays on.
window.addEventListener('blur', () => {
  synth.allOff();
  pressed.clear();
});

// After a mouse click on a button, give the focus back to the page.
// Then Space plays or pauses, and does not press that button again.
document.addEventListener('click', (e) => {
  const button = (e.target as HTMLElement | null)?.closest('button');
  if (button && e.detail > 0) button.blur();
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
const midiEnv = {
  browser: detectBrowser(navigator.userAgent, navigator.maxTouchPoints),
  framed: window.self !== window.top,
};
const onMidiStatus = (status: MidiStatus) => {
  const chip = $('midi-chip');
  chip.classList.toggle('ok', status.state === 'connected');
  chip.classList.toggle('warn', status.state === 'denied' || status.state === 'unsupported');
  const help = midiHelp(status, midiEnv);
  if (status.state === 'connected') {
    chip.textContent = `MIDI: ${status.devices.join(', ')}`;
  } else if (status.state === 'none') {
    chip.textContent = 'MIDI: connect a keyboard';
  } else if (status.state === 'denied') {
    chip.textContent = 'MIDI: permission blocked';
  } else {
    chip.textContent = 'MIDI: not supported';
  }
  chip.title = `${help.title}. Click for details`;

  // The help panel: why, what to do, and the raw facts for a bug report.
  $('midi-title').textContent = help.title;
  $('midi-reason').textContent = help.reason;
  $('midi-steps').replaceChildren(
    ...help.steps.map((step) => {
      const li = document.createElement('li');
      li.textContent = step;
      return li;
    }),
  );
  $('midi-tech').textContent = [
    `Status: ${status.state}`,
    status.state === 'unsupported' ? `Reason: ${status.reason}` : '',
    status.state === 'denied' ? `Error: ${status.error}` : '',
    `Browser: ${midiEnv.browser}`,
    `Secure page: ${window.isSecureContext ? 'yes' : 'no'}`,
    `In a frame: ${midiEnv.framed ? 'yes' : 'no'}`,
    `Web MIDI in browser: ${'requestMIDIAccess' in navigator ? 'yes' : 'no'}`,
    `User agent: ${navigator.userAgent}`,
  ]
    .filter(Boolean)
    .join('\n');
};
const searchMidi = () => {
  $('midi-chip').textContent = 'MIDI: searching…';
  void connectMidi(fromKeys, onMidiStatus);
};
searchMidi();
$('midi-chip').onclick = () => {
  togglePanel('midi-panel');
  if (!$('midi-panel').hidden) searchMidi();
};
$('midi-retry').onclick = searchMidi;

const micBtn = $('mic-btn');
micBtn.onclick = async () => {
  if (mic.active) {
    mic.stop();
    micBtn.textContent = 'Microphone off';
    micBtn.classList.remove('ok');
    return;
  }
  try {
    await mic.start();
    micBtn.textContent = 'Microphone on';
    micBtn.classList.remove('warn');
    micBtn.classList.add('ok');
  } catch {
    micBtn.textContent = 'Microphone blocked';
    micBtn.title = 'Allow the microphone for this page in your browser. Then click here.';
    micBtn.classList.add('warn');
  }
};

speed.value = '100';
syncControls();
void renderShelves();
requestAnimationFrame(frame);
