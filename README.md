# Patchbook to SVG

A web page that turns a [Patchbook](https://github.com/spektroaudio/Patchbook)
patch into a diagram, for people who'd rather not install Python and D2. It
runs entirely in the browser and is served by GitHub Pages at
https://soundsbrown.github.io/patchbook-web/. A command line does the same
with Node, for many patches at once (see below).

There's no build step: the page is plain HTML, CSS and ES modules, plus D2.js
in `vendor/d2/`.

| Path | What it is |
| --- | --- |
| `index.html`, `app.css`, `src/app.js` | The page |
| `src/patchbook.js` | JavaScript port of `patchbook.py` from the [SoundsBrown fork](https://github.com/soundsbrown/Patchbook): parser and D2 output |
| `src/style.js` | Applies a style: theme colours, cable colours and dashes. Also the layout guards |
| `src/render.js` | D2 → SVG, with room made for port labels under ELK |
| `src/credit.js` | A line of small print under a diagram, for the command line |
| `bin/patchbook-web.mjs` | The command line |
| `presets/` | Built-in styles. `index.json` lists them in menu order |
| `examples/` | Example patches. `index.json` lists them |
| `vendor/d2/` | D2.js, unmodified (MPL-2.0). See its README |
| `test/` | Parity, render and command-line tests, and their fixtures |

## Working on it

```
npm install          # D2.js for the command line, the tests and the vendor script
npm run serve        # http://localhost:8000
npm test
```

`npm test` runs three checks:
- `test/parity.mjs` compares `src/patchbook.js` with the Python fork. It looks
  for `../Patchbook/patchbook.py`, or `$PATCHBOOK_PY`. Extra files or folders
  can be passed: `node test/parity.mjs path/to/patches`.
- `test/render.mjs` renders every fixture and example with every preset and
  layout into `test/out/`. It fails on D2 errors, on watermarks and on gaps in
  the layout guards.
- `test/cli.mjs` runs the command line on examples and bad input, into
  `test/out/cli/`, and checks the exit codes, the messages and the credit.

`src/patchbook.js` is the main version of the parser now: make changes here
first, then port them to the Python fork. The parity test keeps the two in
step.

To update D2.js, set the new exact version in `package.json`, then run
`npm install`, `npm run vendor` and `npm test`.

## Command line

After `npm install`:

```
node bin/patchbook-web.mjs patch.pb                  # writes patch.svg
node bin/patchbook-web.mjs *.pb -s light -l dagre
node bin/patchbook-web.mjs patch.pb -o out.svg --credit "example.org · CC BY 4.0"
node bin/patchbook-web.mjs --help
```

It renders exactly as the page does, with the same presets, layouts,
directions, padding and fonts, and also takes style files exported from the
page. Unlike the page, it also renders hand-written D2 files (`.d2`): they get
the style's palette but keep their own colours. `--credit` adds a line of
small print under the diagram's bottom-right corner, right-aligned with it.
It exits with 1 if a file has errors (the others are still rendered), or 2 if
the options are wrong.

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
Righteous (OFL, `fonts/OFL-righteous.txt`). D2's TALA layout engine is
part of D2.js under the same license since D2 0.9.0.
