// Checks that src/patchbook.js gives the same D2 code as the Python fork.
//
//   node test/parity.mjs [file or folder ...]
//
// Runs `patchbook.py -file X -d2` (both directions) on every .pb and .txt file
// in test/fixtures, the fork's Examples and any paths given, and compares the
// output with toD2(). The fork is found at ../Patchbook/patchbook.py next to
// this repo, or at $PATCHBOOK_PY.

import {execFileSync} from "node:child_process";
import {existsSync, readFileSync, readdirSync, statSync} from "node:fs";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {parsePatchbook, toD2} from "../src/patchbook.js";

const here = dirname(fileURLToPath(import.meta.url));
const patchbookPy = process.env.PATCHBOOK_PY ?? resolve(here, "../../Patchbook/patchbook.py");
if (!existsSync(patchbookPy)) {
    console.error(`Patchbook fork not found: ${patchbookPy} (set PATCHBOOK_PY)`);
    process.exit(2);
}

function* patchFiles(path) {
    if (statSync(path).isFile()) {
        yield path;
        return;
    }
    for (const name of readdirSync(path).sort()) {
        const child = join(path, name);
        if (statSync(child).isDirectory()) {
            yield* patchFiles(child);
        } else if (/\.(pb|txt)$/.test(name)) {
            yield child;
        }
    }
}

const roots = [join(here, "fixtures"), join(dirname(patchbookPy), "Examples"), ...process.argv.slice(2)];
let failures = 0, count = 0;
for (const root of roots) {
    for (const file of patchFiles(root)) {
        for (const direction of ["LR", "DN"]) {
            count++;
            const expected = execFileSync("python", ["-X", "utf8", patchbookPy, "-file", file, "-dir", direction, "-d2"],
                {encoding: "utf8"}).replaceAll("\r\n", "\n");
            const actual = toD2(parsePatchbook(readFileSync(file, "utf8")), direction);
            if (actual !== expected) {
                failures++;
                const lines = [expected.split("\n"), actual.split("\n")];
                const at = lines[0].findIndex((line, i) => line !== lines[1][i]);
                console.log(`DIFFERS ${file} (-dir ${direction}), from line ${at + 1}:`);
                console.log(`  python: ${JSON.stringify(lines[0].slice(at, at + 3))}`);
                console.log(`  js:     ${JSON.stringify(lines[1].slice(at, at + 3))}`);
            }
        }
    }
}
console.log(`${count - failures}/${count} match`);
process.exit(failures ? 1 : 0);
