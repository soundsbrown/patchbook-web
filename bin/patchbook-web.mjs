#!/usr/bin/env node
// Patchbook to SVG on the command line: renders patches (.pb or .txt) and
// D2 files (.d2) to SVG diagrams, as the page does, with the same settings.
// Run with --help for the options.

import {readFile, writeFile} from "node:fs/promises";
import {parseArgs} from "node:util";
import {D2} from "@d2lang/d2";
import {PatchbookError, parsePatchbook, toD2} from "../src/patchbook.js";
import {d2ErrorMessage, renderSvg} from "../src/render.js";
import {LAYOUTS, StyleError, checkStyle, d2Options, styleD2, themeD2} from "../src/style.js";
import {addCredit, renderCredit} from "../src/credit.js";

const presetsDir = new URL("../presets/", import.meta.url);
const DIRECTIONS = ["LR", "RT", "DN"];
const FONT_SLOTS = {regular: "fontRegular", italic: "fontItalic", bold: "fontBold"};
const MAX_PAD = 200;

const presetIds = JSON.parse(await readFile(new URL("index.json", presetsDir), "utf8"));

const HELP = `Usage: patchbook-web [options] FILE...

Renders each patch (.pb, .txt) or D2 file (.d2) to an SVG next to it
(FILE.svg), or to --output. A D2 file gets the style's palette, but keeps its
own cable colours and background.

Options:
  -o, --output FILE      where to write the diagram (only with one file)
  -s, --style STYLE      a preset (${presetIds.join(", ")})
                         or a style file exported from the page (default: ${presetIds[0]})
  -l, --layout LAYOUT    ${LAYOUTS.join(", ")} (default: ${LAYOUTS[0]})
  -d, --direction DIR    LR (left to right, or top to bottom for 10 modules or
                         more), RT (always left to right) or DN (top to bottom)
                         (default: LR)
  --pad PX               space around the diagram, 0 to ${MAX_PAD} (default: 25)
  --background           fill the background with the style's colour
                         (default: transparent)
  --credit TEXT          a line of small print under the diagram's bottom-right
                         corner, such as an address and a licence
  --font SLOT=FILE       use a TTF font instead of D2's Source Sans Pro for
                         ${Object.keys(FONT_SLOTS).join(", ")} (module names are bold, port names italic)
  -h, --help

Exits with 1 if a file has errors (the other files are still rendered),
or 2 if the options are wrong.`;

class UsageError extends Error {}

function choice(option, value, allowed) {
    if (!allowed.includes(value)) {
        throw new UsageError(`--${option} must be one of ${allowed.join(", ")}, not ${value}.`);
    }
    return value;
}

async function loadStyle(name) {
    const fallback = JSON.parse(await readFile(new URL(`${presetIds[0]}.json`, presetsDir), "utf8"));
    const file = presetIds.includes(name) ? new URL(`${name}.json`, presetsDir) : name;
    let raw;
    try {
        raw = JSON.parse(await readFile(file, "utf8"));
    } catch (error) {
        throw new UsageError(`${name} isn't a preset (${presetIds.join(", ")}) or a readable style file: ${error.message}`);
    }
    try {
        return checkStyle(raw, checkStyle(fallback, fallback));
    } catch (error) {
        throw error instanceof StyleError ? new UsageError(`${name}: ${error.message}`) : error;
    }
}

async function loadFonts(specs) {
    const fonts = {};
    for (const spec of specs) {
        const [, slot, file] = spec.match(/^([^=]*)=(.+)$/) ?? [];
        if (!FONT_SLOTS[slot]) {
            throw new UsageError(`--font takes SLOT=FILE, with SLOT one of ${Object.keys(FONT_SLOTS).join(", ")}, not ${spec}.`);
        }
        try {
            // D2.js passes options to its worker as JSON, so fonts go as plain arrays.
            fonts[FONT_SLOTS[slot]] = Array.from(await readFile(file));
        } catch (error) {
            throw new UsageError(`${file} couldn't be read: ${error.message}`);
        }
    }
    return fonts;
}

// The styled D2 code for one input file, and how many lines the style added
// at the top of a D2 file (to correct the line numbers in D2's errors).
async function d2Code(input, style, direction, transparent) {
    // Read as the page reads files: as text, without a byte order mark
    const text = (await readFile(input, "utf8")).replace(/^﻿/, "");
    if (/\.d2$/i.test(input)) {
        const themed = themeD2(text, style);
        return {code: themed, offset: themed.split("\n").length - text.split("\n").length};
    }
    return {code: styleD2(toD2(parsePatchbook(text), direction), style, {transparent}), offset: null};
}

// A D2 error, with the line numbers of a D2 file (offset null: generated code).
function d2Error(error, offset) {
    const message = d2ErrorMessage(error);
    if (offset === null) {
        return `D2: ${message}`;
    }
    return message.replace(/\bindex:(\d+):(\d+):/g, (match, line, column) => `line ${line - offset}, column ${column}:`);
}

async function main() {
    const {values, positionals} = parseArgs({
        allowPositionals: true,
        options: {
            output: {type: "string", short: "o"},
            style: {type: "string", short: "s"},
            layout: {type: "string", short: "l"},
            direction: {type: "string", short: "d"},
            pad: {type: "string"},
            background: {type: "boolean"},
            credit: {type: "string"},
            font: {type: "string", multiple: true},
            help: {type: "boolean", short: "h"},
        },
    });
    if (values.help) {
        console.log(HELP);
        return 0;
    }
    if (!positionals.length) {
        throw new UsageError("No file given.");
    }
    if (values.output && positionals.length > 1) {
        throw new UsageError("--output works with one file only.");
    }
    const layout = choice("layout", values.layout ?? LAYOUTS[0], LAYOUTS);
    const direction = choice("direction", values.direction ?? "LR", DIRECTIONS);
    const pad = Number(values.pad ?? 25);
    if (!Number.isInteger(pad) || pad < 0 || pad > MAX_PAD) {
        throw new UsageError(`--pad must be a whole number from 0 to ${MAX_PAD}, not ${values.pad}.`);
    }
    const style = await loadStyle(values.style ?? presetIds[0]);
    const options = d2Options(style, {layout, pad, fonts: await loadFonts(values.font ?? [])});

    const d2 = new D2();
    try {
        const credit = values.credit ? await renderCredit(d2, values.credit, style) : null;
        let status = 0;
        for (const input of positionals) {
            let offset = null;
            try {
                const d2Text = await d2Code(input, style, direction, !values.background);
                offset = d2Text.offset;
                let svg = await renderSvg(d2, d2Text.code, options);
                if (credit) {
                    svg = addCredit(svg, credit, pad);
                }
                await writeFile(values.output ?? input.replace(/(\.(pb|txt|d2))?$/i, ".svg"), svg);
            } catch (error) {
                if (error.code && error.code !== "ENOENT") {
                    throw error;
                }
                // D2.js reports errors in the D2 code as plain Errors
                const ours = error instanceof PatchbookError || error instanceof StyleError || error.code;
                console.error(`${input}: ${ours ? error.message : d2Error(error, offset)}`);
                status = 1;
            }
        }
        return status;
    } finally {
        await d2.dispose();
    }
}

try {
    process.exitCode = await main();
} catch (error) {
    if (!(error instanceof UsageError || error.code?.startsWith("ERR_PARSE_ARGS"))) {
        throw error;
    }
    console.error(`patchbook-web: ${error.message}\nRun patchbook-web --help for the options.`);
    process.exitCode = 2;
}
