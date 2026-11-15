# Keys Wizard: notes for agents and contributors

Keys Wizard is a browser app for learning songs on a keyboard. You drop in a MIDI, Guitar Pro, MusicXML, or text tab file. The notes fall onto an on-screen keyboard, and the song waits until you play the right ones on a USB MIDI keyboard (or into the microphone).

The repo is public and open source: https://github.com/antoniwan/keys-wizard

## Songs and copyright (read this first)

**Only commit a song file if we are allowed to share it. If you are not sure, it does not go in the repo.**

This rule covers every form a song can take: Guitar Pro files, MIDI, MusicXML, text tab, alphaTex, and notes typed into source code or tests.

A song may be committed only when one of these is true:

1. **The composition is in the public domain and the arrangement is ours.** For example, a Beethoven piece that we typed out ourselves. A public-domain composition is not enough on its own: someone else's transcription, arrangement, or engraving of it has its own copyright.
2. **It is original work written for this repo**, released under CC0.
3. **Its licence clearly allows redistribution** (CC0, CC BY, CC BY-SA), and we record the source and give the credit the licence asks for.

Never commit:

- Tabs or Guitar Pro files of commercial songs, including ones downloaded from tab sites (Ultimate Guitar, Songsterr, and the like). Being free to download does not make a file free to share.
- MIDI files of copyrighted songs, including "karaoke" MIDIs and files ripped from games.
- Someone else's arrangement of a public-domain piece, unless its licence allows it.
- Files whose origin you cannot name.
- A "short excerpt" of a copyrighted song as a test fixture. Write a made-up melody instead.

A person's own songs are theirs to practise. They drop them into the app, which keeps them in that browser only (IndexedDB). The app never uploads a song. Do not add a feature that sends a user's song file to a server without Antonio's say-so.

### How the rule is enforced

- **One place.** Bundled songs live in `public/songs/` and nowhere else.
- **A source for each.** Each bundled song is written as `songs-src/<id>.alphatex` and listed in `songs-src/songs.json` with a `license` and a `provenance` line that says where the music came from. `npm run songs` builds the `.gp` files and `public/songs/index.json` from those.
- **A test.** `tests/songs.test.ts` fails if a file in `public/songs/` is not listed, or is listed without an allowed licence and a provenance line.
- **A net.** `.gitignore` ignores song file types everywhere except `public/songs/`. Do not use `git add -f` to get around it, and do not loosen those patterns.
- **A local shelf.** `local-songs/` is ignored. Put personal test files there.

### Adding a bundled song

1. Confirm it passes one of the three conditions above. If you cannot, stop and ask Antonio.
2. Write `songs-src/<id>.alphatex` yourself. Do not convert a downloaded file.
3. Add its entry to `songs-src/songs.json` with `license` and `provenance`.
4. Run `npm run songs`, then `npm test`.
5. Add a row to `public/songs/README.md`.

If you find a file in the repo that breaks this rule, remove it and tell Antonio. A file that was already pushed also needs to come out of the git history.

## Working on the code

```bash
npm install
npm run dev        # http://localhost:5183
npm test           # unit tests, includes the song licence gate
npm run typecheck
npm run build      # typecheck, then a static build in dist/
npm run songs      # rebuild public/songs from songs-src
```

Stack: Vite, TypeScript, no UI framework, one canvas. Web MIDI for the keyboard, Web Audio for sound and the microphone.

| Path | What it does |
| --- | --- |
| `src/song/` | File parsers. Each one returns the same `Song` shape (`types.ts`). `load.ts` picks the parser. |
| `src/song/guitarpro.ts` | Guitar Pro, MusicXML, and alphaTex, read with alphaTab. Loaded on demand because the library is large. |
| `src/song/tab.ts` | Plain-text tab. It has no rhythm, so every column is a sixteenth note. |
| `src/engine/prepare.ts` | Applies track roles, octave shift, and fitting notes to the player's keyboard. |
| `src/engine/practice.ts` | The practice logic: wait, flow, and listen modes, scoring, looping. No DOM, fully unit tested. |
| `src/input/` | USB MIDI, microphone pitch detection, and computer-keyboard input. All three call the same `noteOn` and `noteOff`. |
| `src/audio/synth.ts` | A small synth, so a silent controller makes sound. It uses no samples, so there is nothing to license. |
| `src/view/roll.ts` | Draws the falling notes and the keyboard. |
| `src/view/staff.ts` | Draws the sheet-music strip: note heads on a grand staff, pitch only, no rhythm. |
| `src/main.ts` | Wires the page together. |
| `about.html`, `privacy.html`, `404.html` | The text pages. They share `src/pages.css`. |
| `vite.config.ts` | Lists the pages and writes `sitemap.xml`, `robots.txt`, and `llms.txt` at build time. On the live build only, it adds the visit counters (Vercel Web Analytics and Stats, Antonio's Umami). |
| `package.json` | Its `homepage` field is the public address of the site. |
| `vercel.json` | Clean URLs and security headers for Vercel. |
| `docs/antoniwan-online/` | Info package for the Projects page of antoniwan.online. |
| `docs/screenshots/` | Pictures for the README. Take new ones when the look of the app changes. |

Conventions:

- Keep the practice engine free of DOM and audio code so it stays testable.
- New file formats go through `loadSong` and return a `Song`. Add a test.
- Do not add sampled instruments, sound fonts, or fonts unless their licence allows redistribution and you record it. The same care that applies to songs applies to every asset.
- Text in the app and in the README files follows ASD-STE100 Simplified Technical English as far as is practical: short sentences, one idea in each, active voice, simple words, the same word for the same thing. Say what happened and what to do next. Be honest about what the app cannot do.
- Buttons and links that ask the person to do something carry `data-umami-event="cta"` and a `data-umami-event-label`. Never put a person's own song name or file name into an event. A new or removed label also goes in Antonio's all-sites stats page (`lib/ctas.js` in `antoniwan/tstlss`).
- The privacy page is a promise. If a change makes the app send data to a server, add analytics, set a cookie, or load a file from a different company, change `privacy.html` in the same commit and tell Antonio first.
- A new page needs an entry in `PAGES` in `vite.config.ts`, a canonical link, and its own title and description.
- Code is MIT (`LICENSE`). Bundled songs are CC0 (`public/songs/README.md`).
