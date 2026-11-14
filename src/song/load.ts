import { parseMidi } from './midi';
import { parseTab } from './tab';
import { SongError, type Song } from './types';

export const ACCEPT = '.mid,.midi,.kar,.gp,.gp3,.gp4,.gp5,.gpx,.gp7,.musicxml,.xml,.mxl,.alphatex,.atex,.txt,.tab';

function isMidi(bytes: Uint8Array): boolean {
  // "MThd", or "RIFF" for RMI wrappers
  return bytes.length > 4 && bytes[0] === 0x4d && bytes[1] === 0x54 && bytes[2] === 0x68 && bytes[3] === 0x64;
}

/** Picks the right parser from the file name and contents. */
export async function loadSong(name: string, bytes: Uint8Array): Promise<Song> {
  const dot = name.lastIndexOf('.');
  const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
  const title = (dot >= 0 ? name.slice(0, dot) : name).replace(/[_]+/g, ' ').trim();

  if (isMidi(bytes) || ['mid', 'midi', 'kar'].includes(ext)) return parseMidi(bytes, title);

  if (['gp', 'gp3', 'gp4', 'gp5', 'gpx', 'gp7', 'gtp'].includes(ext)) {
    const { parseScore } = await import('./guitarpro');
    return parseScore(bytes, title, 'Guitar Pro');
  }
  if (['musicxml', 'xml', 'mxl'].includes(ext)) {
    const { parseScore } = await import('./guitarpro');
    return parseScore(bytes, title, 'MusicXML');
  }
  if (['alphatex', 'atex'].includes(ext)) {
    const { parseScore } = await import('./guitarpro');
    return parseScore(bytes, title, 'alphaTex');
  }
  if (['txt', 'tab', 'crd', ''].includes(ext)) {
    return parseTab(new TextDecoder().decode(bytes), title);
  }
  throw new SongError(`Keys Wizard cannot read .${ext} files. Use a MIDI, Guitar Pro, MusicXML, or text tab file.`);
}
