# Keys Wizard

Learn any song on your keyboard. Drop in a MIDI, Guitar Pro, MusicXML, or text tab file. The notes fall onto an on-screen keyboard, and the song waits until you play the right ones.

It runs in the browser. Your song files stay on your computer.

## What it does

- **Reads the files you already have.** MIDI (`.mid`), Guitar Pro (`.gp3`, `.gp4`, `.gp5`, `.gpx`, `.gp`), MusicXML, alphaTex, and plain-text guitar or bass tab.
- **Listens to your keyboard.** Plug in a USB MIDI keyboard and it is picked up on its own. It was built around an M-Audio Keystation 49 MK3; any class-compliant keyboard works.
- **Waits for you.** In Wait mode the song stops at each note or chord until you play it. Flow mode keeps tempo and scores you. Listen mode plays the song so you can hear it first.
- **Fits the song to your keys.** Guitar and bass parts sit low. The app shifts them by octaves to land on a 25, 49, 61, 76, or 88-key board.
- **Lets you choose your part.** Each track can be yours to play, play along as backing, or be muted.
- **Helps you drill.** Slow the tempo down to 25%, loop a hard passage with A and B, and watch your accuracy and streak.
- **Teaches the staff.** A strip of sheet music scrolls above the falling notes, so you learn where each key sits on the treble and bass clef. The keys you press show up on it too. It shows pitch only, not rhythm. The Staff button hides it.
- **Makes sound.** A built-in synth plays your notes and the backing tracks, so a controller with no speakers still sings.
- **Has a microphone mode** for acoustic instruments. It hears one note at a time, so it suits melodies. A MIDI keyboard is faster and exact.

No keyboard nearby? The computer keys work: `A` to `'` are the white keys, the row above is the black keys, `Z` and `X` change octave.

## Run it

You need Node 20 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:5183 in Chrome, Edge, or Firefox. The browser asks once for permission to use MIDI devices.

```bash
npm test         # unit tests
npm run build    # static site in dist/
```

Web MIDI and the microphone need a secure page: `localhost` or `https`.

## Songs in this repo

The app ships with a few pieces to try. Each one is in the public domain or was written for this project, and the arrangements are CC0. See [public/songs/README.md](public/songs/README.md).

This repo only holds songs we are allowed to share. Please do not open a pull request with tabs or MIDI files of copyrighted songs. The full rule is in [AGENTS.md](AGENTS.md).

Text tab has no rhythm in it, so the app treats every column as a sixteenth note. Wait mode makes that work well for learning the notes; add `Tempo: 90` to the file to set the speed.

## Licence

Code: [MIT](LICENSE). Bundled song arrangements: CC0 1.0.

Guitar Pro and MusicXML reading is done by [alphaTab](https://alphatab.net) (MPL-2.0). MIDI reading is done by [@tonejs/midi](https://github.com/Tonejs/Midi) (MIT).
