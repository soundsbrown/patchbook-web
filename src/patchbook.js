// Patchbook parser and D2 output: a port of patchbook.py from the SoundsBrown
// fork (https://github.com/soundsbrown/Patchbook), which is based on PatchBook
// by Spektro Audio (MIT). Same names and the same output as the Python version:
// toD2(parsePatchbook(text)) prints exactly what `patchbook.py -d2` prints, and
// test/parity.mjs checks that. This is the main version now: fix parser bugs
// here first, then port the fix to the fork.
//
// Differences: modules, ports and parameters are Maps (plain objects would
// reorder number-like keys), and input that makes the Python script crash
// throws a PatchbookError with the line number. Unknown connection types and
// lines that match nothing are collected as warnings instead of printed.

// Available connection types
const connectionTypes = new Map([
    ["->", "audio"],
    [">>", "cv"],
    ["p>", "pitch"],
    ["g>", "gate"],
    ["t>", "trigger"],
    ["c>", "clock"],
]);

export class PatchbookError extends Error {
    constructor(message, lineNumber) {
        super(`Line ${lineNumber}: ${message}`);
        this.lineNumber = lineNumber;
    }
}

const commentRe = /^\/\/\s?(.+)$/;  // "// Comments"
const voiceRe = /^(.+):$/;  // "VOICE 1:"
// The "(port)" after either module is optional; an omitted port leaves that
// end of the connection unlabeled.
const connectionRe = /-\s(.+?)(?:\s*[(]([^()]*)[)])?\s(>>|->|[a-z]>)\s(.+?)(?:\s*[(]([^()]*)[)])?\s*(\[.+\])?\s*$/;
const parameterRe = /^\*\s(.+):\s?(.+)?$/;

export function parsePatchbook(text) {
    const patch = {modules: new Map(), comments: [], warnings: []};
    const state = {lastModuleProcessed: "", lastVoiceProcessed: "", connectionID: 0, lineNumber: 0};

    // Python reads the file line by line, keeping each line's "\n".
    const lines = text.split(/\r\n|\r|\n/);
    if (lines.length && lines[lines.length - 1] === "") {
        lines.pop();
    }
    for (const line of lines) {
        state.lineNumber++;
        if (!regexLine(patch, state, line + "\n") && line.trim() !== "") {
            patch.warnings.push({lineNumber: state.lineNumber, message: `Not understood: ${line.trim()}`});
        }
    }
    return patch;
}

// Returns false for a line that matches nothing, which Python ignores silently.
function regexLine(patch, state, line) {
    const stripped = line.trim();

    // CHECK FOR COMMENTS
    let match = commentRe.exec(stripped);
    if (match) {
        patch.comments.push(match[1].trim());
        return true;
    }

    // CHECK FOR VOICES
    match = voiceRe.exec(stripped);
    if (match) {
        const results = match[0].replaceAll(":", "");
        if (!results.includes("*") && !results.includes("-") && !results.includes("|")) {
            state.lastVoiceProcessed = results.toUpperCase();
            return true;
        }
    }

    // CHECK FOR CONNECTIONS
    match = connectionRe.exec(line);
    if (match) {
        addConnection(patch, state, match.slice(1), state.lastVoiceProcessed);
        return true;
    }

    // CHECK PARAMETERS
    // If single-line parameter declaration:
    match = parameterRe.exec(stripped);
    if (match) {
        const module = match[1].trim().toLowerCase();
        if (match[2] !== undefined) {
            // If parameters are also declared
            for (const p of match[2].split(" | ")) {
                const [name, value] = p.split(" = ");
                if (value === undefined) {
                    throw new PatchbookError(`"${p.trim()}" needs " = " between the parameter and its value`, state.lineNumber);
                }
                addParameter(patch, module, name.trim().toLowerCase(), value.trim());
            }
        } else {
            state.lastModuleProcessed = module;
        }
        return true;
    }

    // If multi-line parameter declaration:
    if (line.includes("|") && line.includes("=") && !line.includes("*")) {
        const module = state.lastModuleProcessed.toLowerCase();
        const [name, value] = line.split(" = ");
        if (value === undefined) {
            throw new PatchbookError(`"${stripped}" needs " = " between the parameter and its value`, state.lineNumber);
        }
        addParameter(patch, module, name.replaceAll("|", "").trim().toLowerCase(), value.trim());
        return true;
    }
    return false;
}

function parseArguments(state, args) {
    // This method takes an arguments string like "[color = blue]" and converts it to a dictionary
    const argsDict = new Map();
    for (const item of args.replaceAll("[", "").replaceAll("]", "").split(",")) {
        const [name, value] = item.split("=");
        if (value === undefined) {
            throw new PatchbookError(`"${item.trim()}" needs "=" between the argument and its value`, state.lineNumber);
        }
        argsDict.set(name.trim(), value.trim());
    }
    return argsDict;
}

function addConnection(patch, state, list, voice) {
    state.connectionID++;
    const connectionID = state.connectionID;

    const outputModule = list[0].toLowerCase().trim();
    const outputPort = (list[1] || "").toLowerCase().trim();

    let connectionType = connectionTypes.get(list[2].toLowerCase());
    if (connectionType === undefined) {
        patch.warnings.push({lineNumber: state.lineNumber, message: `Invalid connection: ${list[2]} (drawn as CV)`});
        connectionType = "cv";
    }

    const inputModule = list[3].toLowerCase().trim();
    const inputPort = (list[4] || "").toLowerCase().trim();
    const args = list[5] !== undefined ? parseArguments(state, list[5]) : new Map();

    // An input port holds a single connection, so each unlabeled input gets
    // its own key; the connection itself records the port as "".
    const inputKey = inputPort || unlabeledInputKey(connectionID);

    checkModuleExistance(patch, outputModule, outputPort, "out");
    checkModuleExistance(patch, inputModule, inputKey, "in");

    const outputDict = new Map([
        ["input_module", inputModule],
        ["input_port", inputPort],
        ["connection_type", connectionType],
        ["voice", voice],
        ["id", connectionID]]);
    const inputDict = new Map([
        ["output_module", outputModule],
        ["output_port", outputPort],
        ["connection_type", connectionType],
        ["voice", voice],
        ["id", connectionID]]);
    for (const [key, value] of args) {
        outputDict.set(key, value);
        inputDict.set(key, value);
    }

    patch.modules.get(outputModule).connections.out.get(outputPort).push(outputDict);
    patch.modules.get(inputModule).connections.in.set(inputKey, inputDict);
}

function unlabeledInputKey(id) {
    return "#" + id;
}

function checkModuleExistance(patch, module, port = "port", direction = "") {
    // Check if module exists in main dictionary
    if (!patch.modules.has(module)) {
        patch.modules.set(module, {parameters: new Map(), connections: {out: new Map(), in: new Map()}});
    }
    // If it exists, check if the port exists
    const connections = patch.modules.get(module).connections;
    if (direction === "in" && !connections.in.has(port)) {
        connections.in.set(port, []);
    }
    if (direction === "out" && !connections.out.has(port)) {
        connections.out.set(port, []);
    }
}

function addParameter(patch, module, name, value) {
    checkModuleExistance(patch, module);
    patch.modules.get(module).parameters.set(name, value);
}

// Python's sorted() on strings: by code point.
function byCodePoint(a, b) {
    const x = [...a], y = [...b];
    for (let i = 0; i < Math.min(x.length, y.length); i++) {
        if (x[i] !== y[i]) {
            return x[i].codePointAt(0) - y[i].codePointAt(0);
        }
    }
    return x.length - y.length;
}

function sortedKeys(map) {
    return [...map.keys()].sort(byCodePoint);
}

function sortBy(list, key) {
    // Stable, like Python's list.sort(key=...)
    return list.map(item => [key(item), item]).sort((a, b) => a[0] - b[0]).map(([, item]) => item);
}

// Sort modules so that sources come first and sinks come last.
// Falls back gracefully on cycles by breaking the least-recently-added edge.
function topologicalSort(modules) {
    // Build adjacency list from connections
    const successors = new Map(), predecessors = new Map();
    for (const m of modules.keys()) {
        successors.set(m, new Set());
        predecessors.set(m, new Set());
    }
    for (const [module, info] of modules) {
        for (const port of info.connections.out.values()) {
            for (const c of port) {
                const target = c.get("input_module");
                if (modules.has(target)) {
                    successors.get(module).add(target);
                    predecessors.get(target).add(module);
                }
            }
        }
    }

    // Kahn's algorithm
    const inDegree = new Map([...modules.keys()].map(m => [m, predecessors.get(m).size]));
    // Sort the initial queue by first appearance (lowest connection ID touching the module)
    const firstId = m => {
        const ids = [];
        const connections = modules.get(m).connections;
        for (const port of connections.out.values()) {
            for (const c of port) {
                ids.push(c.get("id"));
            }
        }
        for (const c of connections.in.values()) {
            ids.push(c.get("id"));
        }
        return ids.length ? Math.min(...ids) : 0;
    };
    const queue = sortBy([...modules.keys()].filter(m => inDegree.get(m) === 0), firstId);
    const result = [];
    while (queue.length) {
        const node = queue.shift();
        result.push(node);
        for (const succ of sortBy([...successors.get(node)], firstId)) {
            inDegree.set(succ, inDegree.get(succ) - 1);
            if (inDegree.get(succ) === 0) {
                queue.push(succ);
            }
        }
    }
    // If there are remaining nodes (cycles), append them sorted by first_id
    const remaining = sortBy([...modules.keys()].filter(m => !result.includes(m)), firstId);
    return result.concat(remaining);
}

// D2 uses named colors or hex codes; "thick" is replaced with stroke-width and a color
export const linetypes = {
    audio: {color: "#c5c2b8", width: 3},
    cv: {color: "#4CAF50"},
    gate: {color: "#E57373"},
    trigger: {color: "#FFB74D"},
    pitch: {color: "#64B5F6"},
    clock: {color: "#CE93D8"},
};
// The Graphviz line styles a connection's [style = ...] argument may give.
// Other values have no D2 equivalent and are left out.
const d2LineStyles = new Map([
    ["dashed", "style.stroke-dash: 4"],
    ["dotted", "style.stroke-dash: 2"],
    ["bold", "style.stroke-width: 3"],
]);

// direction is "LR" (the default: left to right, top to bottom at 10 or more
// modules), "DN" (always top to bottom) or anything else (always left to right).
export function toD2(patch, direction = "LR") {
    const modules = patch.modules;
    let totalString = "";

    // D2 direction: auto-select based on complexity
    let directionStr;
    if (direction === "DN") {
        directionStr = "down";
    } else if (direction === "LR") {
        directionStr = modules.size >= 10 ? "down" : "right";
    } else {
        directionStr = "right";
    }
    totalString += `direction: ${directionStr}\n`;

    // Transparent background so diagrams blend with the page
    totalString += "style: {\n  fill: transparent\n}\n";

    // Build a D2-safe identifier for each module
    const nodeId = module => module.replace(/[^A-Za-z0-9_]/g, "");
    const escape = text => text.replaceAll("\\", "\\\\").replaceAll('"', '\\"');

    // A module without parameters is a plain box labelled with its uppercase
    // name. One with parameters becomes a one-cell grid container: the name
    // sits on top and the parameters fill the cell in a smaller monospace font
    // (a single D2 label can only have one font and size). With no grid gap the
    // cell is flush with the container, so its top edge separates the two.
    const moduleNode = module => {
        const name = escape(module.toUpperCase());
        const params = modules.get(module).parameters;
        if (!params.size) {
            return `${nodeId(module)}: "${name}"`;
        }
        const paramStr = sortedKeys(params).map(par => `${escape(par)}: ${escape(params.get(par))}`).join("\\n");
        return `${nodeId(module)}: {\n` +
            `  label: "${name}"\n` +
            "  label.near: top-center\n" +
            "  style.font-size: 16\n" +
            "  style.bold: true\n" +
            "  grid-columns: 1\n" +
            "  grid-gap: 0\n" +
            `  params: "${paramStr}" {\n` +
            "    style.font: mono\n" +
            "    style.font-size: 12\n" +
            "    style.bold: false\n" +
            "  }\n" +
            "}";
    };

    // Emit modules in topological order
    for (const module of topologicalSort(modules)) {
        totalString += moduleNode(module) + "\n";
    }

    // Collect all connections with their original IDs for ordering
    const conn = [];
    for (const [module, info] of modules) {
        for (const [out, port] of info.connections.out) {
            for (const c of port) {
                // Build connection style
                const styleParts = [];
                const connTypeStyle = linetypes[c.get("connection_type")] ?? {color: "black"};
                styleParts.push(`style.stroke: "${connTypeStyle.color ?? "black"}"`);
                if ("width" in connTypeStyle) {
                    styleParts.push(`style.stroke-width: ${connTypeStyle.width}`);
                }
                const lineStyle = d2LineStyles.get((c.get("style") ?? "").toLowerCase());
                if (lineStyle) {
                    styleParts.push(lineStyle);
                }

                const styleStr = styleParts.length ? "\n    " + styleParts.join("\n    ") : "";
                let labels = "";
                if (out) {
                    labels += `\n    source-arrowhead.label: ${out}`;
                }
                if (c.get("input_port")) {
                    labels += `\n    target-arrowhead.label: ${c.get("input_port")}`;
                }
                conn.push([c.get("id"), `${nodeId(module)} -> ${nodeId(c.get("input_module"))} {${labels}${styleStr}\n  }`]);
            }
        }
    }

    // Sort connections by their original ID (source file order)
    for (const [, c] of sortBy(conn, x => x[0])) {
        totalString += c + "\n";
    }

    // Add comments if any, as a single node. A line break inside a D2 label is
    // the two-character escape "\n", not a real newline -- same as moduleNode.
    if (patch.comments.length) {
        const commentLines = patch.comments.map(escape).join("\\n");
        totalString += `comments: "PATCH COMMENTS\\n\\n${commentLines}"\n`;
    }
    return totalString;
}
