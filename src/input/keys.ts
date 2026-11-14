import type { NoteHandlers } from './midi';

// The home row is the white keys, the row above is the black keys.
const MAP: Record<string, number> = {
  KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7, KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11,
  KeyK: 12, KeyO: 13, KeyL: 14, KeyP: 15, Semicolon: 16, Quote: 17,
};

/** Lets you try the app with a computer keyboard. Z and X shift the octave. */
export function connectComputerKeys(handlers: NoteHandlers): void {
  let base = 60;
  const down = new Map<string, number>();

  window.addEventListener('keydown', (e) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target as HTMLElement | null;
    if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
    if (e.code === 'KeyZ') base = Math.max(24, base - 12);
    else if (e.code === 'KeyX') base = Math.min(96, base + 12);
    else if (e.code in MAP && !down.has(e.code)) {
      const midi = base + MAP[e.code];
      down.set(e.code, midi);
      handlers.noteOn(midi, 0.8);
    }
  });
  // If the window loses focus, the key-up never arrives. Release the keys.
  window.addEventListener('blur', () => {
    for (const midi of down.values()) handlers.noteOff(midi);
    down.clear();
  });
  window.addEventListener('keyup', (e) => {
    const midi = down.get(e.code);
    if (midi === undefined) return;
    down.delete(e.code);
    handlers.noteOff(midi);
  });
}
