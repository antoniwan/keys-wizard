import { describe, expect, it } from 'vitest';
import { detectBrowser, midiHelp } from '../src/input/midi-help';

const SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Safari/605.1.15';
const CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const EDGE = `${CHROME} Edg/140.0.0.0`;
const FIREFOX = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:140.0) Gecko/20100101 Firefox/140.0';
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0 Mobile/15E148 Safari/604.1';

describe('detectBrowser', () => {
  it('tells the browser families apart', () => {
    expect(detectBrowser(SAFARI)).toBe('safari');
    expect(detectBrowser(CHROME)).toBe('chromium');
    expect(detectBrowser(EDGE)).toBe('chromium');
    expect(detectBrowser(FIREFOX)).toBe('firefox');
    expect(detectBrowser(IPHONE)).toBe('ios');
    expect(detectBrowser(SAFARI, 5)).toBe('ios'); // an iPad that says it is a Mac
  });
});

describe('midiHelp', () => {
  const env = { browser: 'chromium' as const, framed: false };

  it('names Safari as the cause when Safari has no Web MIDI', () => {
    const help = midiHelp({ state: 'unsupported', reason: 'browser' }, { browser: 'safari', framed: false });
    expect(help.title).toMatch(/Safari/);
    expect(help.steps[0]).toMatch(/Chrome, Edge, or Firefox/);
  });

  it('asks for https when the page is not secure', () => {
    const help = midiHelp({ state: 'unsupported', reason: 'insecure' }, env);
    expect(help.reason).toMatch(/https/);
  });

  it('gives Firefox its own permission steps', () => {
    const help = midiHelp({ state: 'denied', error: 'SecurityError: x' }, { browser: 'firefox', framed: false });
    expect(help.steps.join(' ')).toMatch(/add-on/);
  });

  it('points at the frame when the page is framed', () => {
    const help = midiHelp({ state: 'denied', error: 'NotAllowedError: x' }, { ...env, framed: true });
    expect(help.steps[0]).toMatch(/inside another page/);
  });

  it('gives hardware steps when no device is found', () => {
    const help = midiHelp({ state: 'none' }, env);
    expect(help.steps.join(' ')).toMatch(/USB cable/);
  });

  it('lists the connected devices', () => {
    const help = midiHelp({ state: 'connected', devices: ['KeyLab 49'] }, env);
    expect(help.reason).toContain('KeyLab 49');
  });
});
