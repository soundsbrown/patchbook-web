// Renders every fixture and Patchbook example with every preset and layout,
// the way the page does, into test/out/ (one SVG each, to look at).
//
//   node test/render.mjs
//
// Fails on D2 errors, on a watermarked SVG, or if the layout guards let anything through.

import {mkdirSync, readFileSync, readdirSync, writeFileSync} from "node:fs";
import {basename, dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {D2} from "@d2lang/d2";
import {parsePatchbook, toD2} from "../src/patchbook.js";
import {renderSvg} from "../src/render.js";
import {LAYOUTS, StyleError, checkStyle, checkSvg, d2Options, styleD2} from "../src/style.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const outDir = join(here, "out");
mkdirSync(outDir, {recursive: true});

const presetNames = JSON.parse(readFileSync(join(root, "presets/index.json"), "utf8"));
const presets = presetNames.map(name => JSON.parse(readFileSync(join(root, "presets", name + ".json"), "utf8")));
const fallback = presets[0];
const patchDirs = [join(here, "fixtures"), join(root, "examples")];
const patches = patchDirs.flatMap(dir => readdirSync(dir).filter(name => /\.(pb|txt)$/.test(name)).map(name => join(dir, name)));

const d2 = new D2();
let failures = 0;
function fail(message) {
    failures++;
    console.log("FAIL " + message);
}

for (const file of patches) {
    const d2Text = toD2(parsePatchbook(readFileSync(file, "utf8")));
    for (const [i, preset] of presets.entries()) {
        const style = checkStyle(preset, fallback);
        for (const layout of LAYOUTS) {
            const transparent = i % 2 === 0;
            const name = `${basename(file).replace(/\.\w+$/, "")}-${presetNames[i]}-${layout}.svg`;
            try {
                const svg = await renderSvg(d2, styleD2(d2Text, style, {transparent}), d2Options(style, {layout}));
                writeFileSync(join(outDir, name), svg);
            } catch (error) {
                fail(`${name}: ${error.message}`);
            }
        }
    }
}

// The layout guards: a port name carrying D2 settings, and a layout outside the allowlist.
const smuggled = toD2(parsePatchbook("- Osc (out; vars: {d2-config: {layout-engine: tala}}) -> VCA (in)\n"));
for (const [what, attempt] of [
    ["smuggled layout-engine", () => styleD2(smuggled, fallback)],
    ["layout: unknown", () => d2Options(fallback, {layout: "unknown"})],
]) {
    try {
        attempt();
        fail(`${what} was let through`);
    } catch (error) {
        if (!(error instanceof StyleError)) {
            fail(`${what}: ${error.message}`);
        }
    }
}
try {
    checkSvg("<svg>UNLICENSED COPY</svg>");
    fail("a watermarked SVG was let through");
} catch {
    // as it should
}

await d2.dispose();
console.log(failures ? `${failures} failures` : `All rendered into ${outDir}`);
process.exit(failures ? 1 : 0);
