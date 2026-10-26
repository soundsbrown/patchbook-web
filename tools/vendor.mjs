// Copies D2.js from node_modules into vendor/d2/, which the page loads.
//
//   npm install && npm run vendor
//
// To update D2.js, change the exact version in package.json, run both
// commands, then `npm test`, and check vendor/d2/README.md.
// The files are copied unmodified (MPL-2.0 applies to them as they are).

import {copyFileSync, mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {D2} from "@d2lang/d2";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkgDir = join(root, "node_modules/@d2lang/d2");
const version = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8")).version;
const outDir = join(root, "vendor/d2");
mkdirSync(outDir, {recursive: true});
const d2 = new D2();
const d2Version = await d2.version();
await d2.dispose();

copyFileSync(join(pkgDir, "dist/browser/index.js"), join(outDir, "d2.js"));
copyFileSync(join(pkgDir, "LICENSE.txt"), join(outDir, "LICENSE.txt"));
copyFileSync(join(pkgDir, "THIRD_PARTY_NOTICES.txt"), join(outDir, "THIRD_PARTY_NOTICES.txt"));
writeFileSync(join(outDir, "README.md"),
    `# D2.js ${version}\n\n` +
    `\`d2.js\` is \`dist/browser/index.js\` from the npm package [@d2lang/d2](https://www.npmjs.com/package/@d2lang/d2) ${version},\n` +
    `unmodified. It bundles the WebAssembly build of [D2](https://d2lang.com) ${d2Version}.\n\n` +
    "License: Mozilla Public License 2.0 (`LICENSE.txt`). Source code:\n" +
    `https://github.com/d2lang/d2/tree/${d2Version} (D2.js is in \`d2js/\`).\n\n` +
    "D2 includes third-party code and fonts under their own licenses, listed in\n" +
    "`THIRD_PARTY_NOTICES.txt`.\n");
console.log(`Vendored D2.js ${version} (D2 ${d2Version}) into ${outDir}`);
