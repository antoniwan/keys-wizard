import type { MidiStatus } from './midi';

export type Browser = 'chromium' | 'firefox' | 'safari' | 'ios' | 'other';

export interface MidiEnv {
  browser: Browser;
  /** The page is inside a frame of another page. */
  framed: boolean;
}

export interface MidiHelp {
  title: string;
  /** Why the app cannot use MIDI. */
  reason: string;
  /** What the person can do, in order. */
  steps: string[];
}

/** Finds the browser family from the user agent. No DOM, so it is testable. */
export function detectBrowser(userAgent: string, maxTouchPoints = 0): Browser {
  // iPadOS says it is a Mac. A Mac with touch points is an iPad.
  if (/iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)) return 'ios';
  if (/Firefox\//.test(userAgent)) return 'firefox';
  if (/Chrome\/|Chromium\/|Edg\//.test(userAgent)) return 'chromium';
  if (/Safari\//.test(userAgent)) return 'safari';
  return 'other';
}

const NO_MIDI_FALLBACK = 'You can still practise: use the microphone, the computer keyboard, or click the keys on the screen.';

/** Explains a MIDI status in plain words, with steps to fix it. */
export function midiHelp(status: MidiStatus, env: MidiEnv): MidiHelp {
  switch (status.state) {
    case 'connected':
      return {
        title: 'MIDI keyboard connected',
        reason: `The app receives notes from: ${status.devices.join(', ')}.`,
        steps: [
          'Play a key. The same key lights up on the screen.',
          'If no key lights up, make sure that the keyboard sends MIDI through USB. Some keyboards send MIDI only from their 5-pin MIDI OUT port. Read the keyboard manual.',
          'Turn off "Play my notes through the speakers" in Settings if the keyboard makes its own sound.',
        ],
      };

    case 'none':
      return {
        title: 'No MIDI keyboard found',
        reason: 'The browser allows MIDI, but it finds no MIDI input device.',
        steps: [
          'Connect the keyboard with a USB cable and turn it on. Some USB cables only charge and do not carry data. Try a different cable.',
          'Connect the keyboard directly to the computer, not through a USB hub or a dock.',
          'Some keyboards have a setting to send MIDI through USB. Read the keyboard manual.',
          'Close other music apps (for example a DAW). On Windows, only one app at a time can use a MIDI device.',
          'On a Mac, open Audio MIDI Setup, then select Window › Show MIDI Studio. If your keyboard is not there, macOS does not see it. The problem is the cable or the keyboard, not the browser.',
          'A keyboard with only a 5-pin MIDI port needs a USB MIDI interface.',
          'Click "Search again".',
        ],
      };

    case 'denied': {
      const steps: string[] = [];
      if (env.framed) {
        steps.push('This page is inside another page. The other page can block MIDI. Open keys.antoniwan.online directly in its own tab.');
      }
      if (env.browser === 'firefox') {
        steps.push(
          'Firefox asks you to install a small "site permission add-on" for MIDI. Click "Search again" and accept the request.',
          'If you blocked it before, click the icon at the left of the address bar and remove the blocked permission. Then reload the page.',
        );
      } else {
        steps.push(
          'Click the icon at the left of the address bar (site settings).',
          'Find "MIDI devices" (Chrome can call it "MIDI device control & reprogram") and set it to Allow.',
          'Reload the page.',
        );
      }
      return {
        title: 'MIDI permission blocked',
        reason: 'The browser did not give this page access to MIDI devices. You or a browser setting blocked it, or the request was closed.',
        steps,
      };
    }

    case 'unsupported':
      if (status.reason === 'insecure') {
        return {
          title: 'MIDI needs a secure page',
          reason: 'Browsers allow MIDI only on pages that use https:// or on localhost. This page does not.',
          steps: ['Open https://keys.antoniwan.online.', NO_MIDI_FALLBACK],
        };
      }
      if (env.browser === 'ios') {
        return {
          title: 'MIDI does not work on iPhone and iPad',
          reason: 'All browsers on iPhone and iPad use Safari’s engine, and it does not support Web MIDI.',
          steps: ['Use a computer with Chrome, Edge, or Firefox.', NO_MIDI_FALLBACK],
        };
      }
      if (env.browser === 'safari') {
        return {
          title: 'Safari does not support MIDI',
          reason: 'Safari does not have Web MIDI, the browser feature that reads a USB keyboard. The app cannot change this.',
          steps: ['Open this page in Chrome, Edge, or Firefox.', NO_MIDI_FALLBACK],
        };
      }
      return {
        title: 'This browser does not support MIDI',
        reason: 'This browser does not have Web MIDI, the browser feature that reads a USB keyboard.',
        steps: [
          'Open this page in Chrome, Edge, or Firefox.',
          NO_MIDI_FALLBACK,
        ],
      };
  }
}
