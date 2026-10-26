# Patchbook to SVG

A web page that turns a [Patchbook](https://github.com/spektroaudio/Patchbook)
patch into a diagram, for people who'd rather not install Python and D2. It
runs entirely in the browser and is served by GitHub Pages at
https://soundsbrown.github.io/patchbook-web/.

There's no build step: the page is plain HTML, CSS and ES modules, plus D2.js
in `vendor/d2/`.

| Path | What it is |
| --- | --- |
| `index.html`, `app.css`, `src/app.js` | The page |
| `src/patchbook.js` | JavaScript port of `patchbook.py` from the [SoundsBrown fork](https://github.com/soundsbrown/Patchbook): parser and D2 output |
| `src/style.js` | Applies a style: theme colours, cable colours and dashes. Also the TALA guards |
| `src/render.js` | D2 → SVG, with room made for port labels under ELK |
| `presets/` | Built-in styles. `index.json` lists them in menu order |
| `examples/` | Example patches. `index.json` lists them |
| `vendor/d2/` | D2.js, unmodified (MPL-2.0). See its README |
| `test/` | Parity and render tests, and their fixtures |

## Working on it

```
npm install          # D2.js for the tests and the vendor script
npm run serve        # http://localhost:8000
npm test
```

`npm test` runs two checks:
- `test/parity.mjs` compares `src/patchbook.js` with the Python fork. It looks
  for `../Patchbook/patchbook.py`, or `$PATCHBOOK_PY`. Extra files or folders
  can be passed: `node test/parity.mjs path/to/patches`.
- `test/render.mjs` renders every fixture and example with every preset and
  layout into `test/out/`. It fails on D2 errors, on watermarks and on gaps in
  the TALA guards.

Parser changes go into the Python fork first, then get ported here. The
parity test keeps the two in step.

To update D2.js, set the new exact version in `package.json`, then run
`npm install`, `npm run vendor` and `npm test`.

## Styles

A style is a JSON file like those in `presets/`:
- `theme` is a D2 theme ID.
- `palette` overrides the theme's colours. The names map to D2's colour codes
  in `THEME_CODES` in `src/style.js`.
- `cables` gives a colour and a dash length (0–10, 0 = solid) for each
  Patchbook connection type.

The page can export and import styles in this format.

## Licenses

MIT for this page's code (`LICENSE`). Patchbook (MIT, Spektro Audio) and D2
(MPL-2.0) are covered in `THIRD-PARTY-NOTICES.txt`, as is the title font,
Righteous (OFL, `fonts/OFL-righteous.txt`). TALA, D2's proprietary
layout engine, is never offered or used.
