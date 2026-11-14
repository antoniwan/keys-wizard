export interface NoteHandlers {
  noteOn(midi: number, velocity: number): void;
  noteOff(midi: number): void;
}

export type MidiStatus =
  | { state: 'unsupported' }
  | { state: 'denied' }
  | { state: 'none' }
  | { state: 'connected'; devices: string[] };

/**
 * Listens to every MIDI keyboard plugged into the machine (Web MIDI).
 * Devices can come and go; plugging one in later just works.
 */
export async function connectMidi(handlers: NoteHandlers, onStatus: (s: MidiStatus) => void): Promise<void> {
  if (!('requestMIDIAccess' in navigator)) {
    onStatus({ state: 'unsupported' });
    return;
  }
  let access: MIDIAccess;
  try {
    access = await navigator.requestMIDIAccess();
  } catch {
    onStatus({ state: 'denied' });
    return;
  }

  const onMessage = (event: MIDIMessageEvent) => {
    const data = event.data;
    if (!data || data.length < 3) return;
    const kind = data[0] & 0xf0;
    if (kind === 0x90 && data[2] > 0) handlers.noteOn(data[1], data[2] / 127);
    else if (kind === 0x80 || kind === 0x90) handlers.noteOff(data[1]);
  };

  const bind = () => {
    const names: string[] = [];
    access.inputs.forEach((input) => {
      input.onmidimessage = onMessage;
      if (input.state === 'connected') names.push(input.name ?? 'MIDI device');
    });
    onStatus(names.length ? { state: 'connected', devices: names } : { state: 'none' });
  };
  access.onstatechange = bind;
  bind();
}
