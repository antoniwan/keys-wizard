# Keys Wizard: info package for antoniwan.online

This folder has all that the antoniwan.online project needs to add Keys Wizard to its Projects page. Copy from here. Nothing in this folder is used by the app.

Checked on November 14, 2026 against `src/data/projects.ts` in the antoniwan.online repository.

## 1. The project entry

Add this object to the `projects` array in `src/data/projects.ts`. That file sorts each category from newest to oldest, so put it above `Cookbook`, which is the newest entry in `apps-and-tools` today.

```ts
{
  title: 'Keys Wizard',
  category: 'apps-and-tools',
  href: 'https://keys.antoniwan.online',
  repo: 'https://github.com/antoniwan/keys-wizard',
  body: 'A page that teaches me songs on my MIDI keyboard. I open a MIDI, Guitar Pro, or tab file, the notes fall onto the keys, and the song waits until I play the right one. A staff above the notes helps me learn to read music.',
  stack: 'TypeScript, Vite, Web MIDI',
},
```

The same entry is in [`project.ts`](project.ts) as a file.

The `body` is written in the first person, like the other entries. Change the words if they do not sound like you.

## 2. Facts

| Field | Value |
| --- | --- |
| Name | Keys Wizard |
| Live address | https://keys.antoniwan.online |
| Repository | https://github.com/antoniwan/keys-wizard |
| Started | November 14, 2026 |
| Status | Works. Not yet tested with many MIDI keyboards. |
| Stack | TypeScript, Vite, Canvas, Web MIDI, Web Audio. No UI framework. |
| Libraries | alphaTab (Guitar Pro and MusicXML), @tonejs/midi (MIDI) |
| Host | Vercel, team SHSH, project `keys-wizard`. Each push to `main` deploys. |
| Code license | MIT |
| Song license | CC0 1.0 |
| Cost to use | Free. No accounts, no ads, no analytics. |
| Language | English |

## 3. Text you can use

**One line (under 60 characters)**

> Learn songs on your MIDI keyboard. The song waits for you.

**Short (under 160 characters, good for a meta description)**

> A free web app to learn songs on a MIDI keyboard. Open a MIDI, Guitar Pro, or tab file. The notes fall onto the keyboard and the song waits for you.

**Long**

> Keys Wizard is a free web app to learn songs on a keyboard. You open a MIDI, Guitar Pro, MusicXML, or text tab file. The notes fall onto a keyboard on the screen, and the song stops at each note until you play the correct key on your USB MIDI keyboard. A treble and bass staff above the notes shows where each key is in sheet music. You can make the song slower, repeat a hard part, and select the track that you play. Your song files stay in your browser. The code is open source.

**What it cannot do (keep this near any long description)**

> The staff shows pitch only, not rhythm. The microphone hears one note at a time. There is no drum sound. Safari does not support MIDI keyboards.

## 4. Pictures

All pictures are in the keys-wizard repository. Copy the ones you need into the antoniwan.online repository; do not link to them from another site.

| File | Size | Use |
| --- | --- | --- |
| `public/og.png` | 1200 × 630 | Share image, project card |
| `docs/screenshots/wait-mode.png` | 2160 × 1215 | The main picture: Wait mode with the staff |
| `docs/screenshots/start.png` | 2160 × 1215 | The start page |
| `docs/screenshots/listen-mode.png` | 2160 × 1215 | Listen mode with the Tracks panel |
| `docs/screenshots/settings.png` | 2160 × 1215 | The Settings panel |
| `public/favicon.svg` | vector | The icon |

Alt text for the main picture:

> Keys Wizard in Wait mode. Blue and orange notes fall onto a piano keyboard. One key is gold: the song waits for that note. A staff with a treble and bass clef is above.

## 5. Structured data

Keys Wizard already points to your one person ID, `https://antoniwan.online/#person`, as its author. That is the ID in `SITE.personId`.

If the Projects page lists each project in its JSON-LD, this is the item for Keys Wizard. The file is [`structured-data.json`](structured-data.json).

```json
{
  "@type": "WebApplication",
  "@id": "https://keys.antoniwan.online/#app",
  "name": "Keys Wizard",
  "url": "https://keys.antoniwan.online/",
  "description": "A free web app to learn songs on a MIDI keyboard. Open a MIDI, Guitar Pro, or tab file. The notes fall onto the keyboard and the song waits for you.",
  "applicationCategory": "EducationalApplication",
  "operatingSystem": "Any",
  "isAccessibleForFree": true,
  "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
  "image": "https://keys.antoniwan.online/og.png",
  "sameAs": "https://github.com/antoniwan/keys-wizard",
  "author": { "@id": "https://antoniwan.online/#person" }
}
```

## 6. A line for llms.txt

If `llms.txt` on antoniwan.online lists your projects, add this line:

```md
- [Keys Wizard](https://keys.antoniwan.online): a free web app to learn songs on a MIDI keyboard. It opens MIDI, Guitar Pro, MusicXML, and text tab files, and the song waits until you play the correct key. Open source (MIT).
```

Keys Wizard has its own file at https://keys.antoniwan.online/llms.txt.

## 7. Pages on the Keys Wizard site

| Page | Address |
| --- | --- |
| The app | https://keys.antoniwan.online/ |
| About | https://keys.antoniwan.online/about |
| Privacy | https://keys.antoniwan.online/privacy |
| Sitemap | https://keys.antoniwan.online/sitemap.xml |

The About page and the footer of the start page link back to https://antoniwan.online.

## 8. If the address changes

Cookbook is at `cookbook.antoniwan.online`. If you give Keys Wizard an address of the same kind:

1. Add the domain to the `keys-wizard` project in Vercel.
2. In the keys-wizard repository, change the `homepage` field in `package.json`. Canonical links, the sitemap, `robots.txt`, `llms.txt`, and the structured data all read that one field.
3. Change the address in this folder and in `README.md`.
4. Change `href` in the project entry on antoniwan.online.

## 9. Things to check before you publish the entry

- [ ] Read the `body` text. It speaks as you.
- [ ] Read the "Who made it" and "Why it was made" parts of the About page. They also speak as you, and they say that an AI assistant wrote most of the code.
- [ ] Test the app with your Keystation 49 MK3. This was not possible when the app was built.
