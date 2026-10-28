// Runs bin/patchbook-web.mjs on the examples and on bad input, into test/out/cli/.
// Checks the exit codes, the messages, and the credit line.
//   node test/cli.mjs

import {spawnSync} from "node:child_process";
import {copyFileSync, mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "test/out/cli");
mkdirSync(out, {recursive: true});

let count = 0, failures = 0;
function check(label, ok, detail = "") {
    count++;
    if (!ok) {
        failures++;
        console.log(`FAILS ${label}${detail ? "\n  " + detail : ""}`);
    }
}

function run(...args) {
    const result = spawnSync(process.execPath, [join(root, "bin/patchbook-web.mjs"), ...args], {encoding: "utf8"});
    return {status: result.status, stderr: result.stderr};
}

function size(svg) {
    const [, width, height] = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)" width="\1" height="\2"/) ?? [];
    return width ? [Number(width), Number(height)] : null;
}

// Several examples at once, each next to its copy
const examples = ["patch1", "syncpll"];
for (const name of examples) {
    copyFileSync(join(root, `examples/${name}.pb`), join(out, `${name}.pb`));
}
let result = run(...examples.map(name => join(out, `${name}.pb`)));
check("examples render", result.status === 0, result.stderr);
for (const name of examples) {
    const svg = readFileSync(join(out, `${name}.svg`), "utf8");
    check(`${name}: an SVG with a size`, size(svg) !== null);
}

// A credit: right-aligned under the diagram, which gets taller but no wider
const patch = join(root, "examples/syncpll.pb");
result = run(patch, "-o", join(out, "plain.svg"));
const plain = readFileSync(join(out, "plain.svg"), "utf8");
result = run(patch, "-o", join(out, "credit.svg"), "--credit", "example.org · CC BY 4.0 & <more>");
const credit = readFileSync(join(out, "credit.svg"), "utf8");
check("credit drawn", result.status === 0 && /text-anchor:end">example\.org · CC BY 4\.0 &amp; &lt;more&gt;<\/text>/.test(credit),
    result.stderr);
check("credit font embedded", /<g id="patchbook-credit"><style[^>]*><!\[CDATA\[@font-face \{[^}]*base64,/.test(credit));
const [plainSize, creditSize] = [size(plain), size(credit)];
check("credit adds height, not width", plainSize && creditSize && creditSize[0] === plainSize[0] && creditSize[1] > plainSize[1],
    `${plainSize} -> ${creditSize}`);

// A narrow diagram gets as wide as its credit
writeFileSync(join(out, "tiny.pb"), "- A (o) -> B (i)\n");
result = run(join(out, "tiny.pb"), "--credit", "a credit line much wider than this little diagram");
check("narrow diagram widened", result.status === 0 && size(readFileSync(join(out, "tiny.svg"), "utf8"))[0] > 300, result.stderr);

// Options: a style, a layout, a background
result = run(patch, "-o", join(out, "light.svg"), "-s", "light", "-l", "dagre", "-d", "DN", "--pad", "10", "--background");
const light = JSON.parse(readFileSync(join(root, "presets/light.json"), "utf8"));
check("options work", result.status === 0 && readFileSync(join(out, "light.svg"), "utf8").includes(`fill="${light.palette.bg}"`),
    result.stderr);

// A D2 file gets the palette; its errors give its own line numbers
writeFileSync(join(out, "hand.d2"), "a: Osc\nb: VCA\na -> b\n");
result = run(join(out, "hand.d2"));
check("D2 file renders", result.status === 0, result.stderr);
writeFileSync(join(out, "bad.d2"), "a: Osc\nb: {\n");
result = run(join(out, "bad.d2"));
check("bad D2 file fails", result.status === 1 && /bad\.d2: line 2, column \d+: maps must be terminated/.test(result.stderr), result.stderr);

// A smuggled layout engine, and a missing file, among good files: exit 1, the rest rendered
writeFileSync(join(out, "smuggled.pb"), "- Osc (out; vars: {d2-config: {layout-engine: tala}}) -> VCA (in)\n");
result = run(join(out, "smuggled.pb"), join(out, "missing.pb"), join(out, "patch1.pb"));
check("bad files fail", result.status === 1 && /smuggled\.pb: .*layout engine/.test(result.stderr) && /missing\.pb: ENOENT/.test(result.stderr),
    result.stderr);

// Wrong options: exit 2
for (const args of [["-l", "nope", "x.pb"], ["-d", "UP", "x.pb"], ["--pad", "-1", "x.pb"], ["-s", "nope", "x.pb"],
    ["--font", "bogus=x.ttf", "x.pb"], ["-o", "x.svg", "a.pb", "b.pb"], ["--nope"], []]) {
    result = run(...args);
    check(`exit 2 for ${JSON.stringify(args)}`, result.status === 2 && result.stderr.includes("--help"), result.stderr);
}

console.log(failures ? `${failures} of ${count} checks fail` : `All ${count} checks pass`);
process.exit(failures ? 1 : 0);
