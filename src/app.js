// The page: Patchbook text in, diagram out. Parsing and styling are in
// patchbook.js and style.js; D2.js (vendor/d2) draws the diagram in a web worker.

import {PatchbookError, parsePatchbook, toD2} from "./patchbook.js";
import {renderSvg} from "./render.js";
import {CABLE_NAMES, StyleError, checkStyle, d2Options, styleD2} from "./style.js";

const $ = id => document.getElementById(id);

const PALETTE_MAIN = [
    ["bright", "Labels"],
    ["accent", "Box outlines"],
    ["bg-raised", "Box fill"],
    ["bg", "Background"],
];
const PALETTE_MORE = [
    ["text", "Text"],
    ["muted", "Soft text"],
    ["dim", "Faint text"],
    ["border-strong", "Strong lines"],
    ["border", "Lines"],
];
const CABLE_LABELS = {
    audio: ["Audio", "->"], cv: ["CV", ">>"], pitch: ["Pitch", "p>"], gate: ["Gate", "g>"],
    trigger: ["Trigger", "t>"], clock: ["Clock", "c>"], other: ["Other", ""],
};
const DASHES = [[0, "Solid"], [2, "Dotted"], [4, "Dashed"], [6, "Long dashes"]];
// D2.js option -> label. D2 draws module names and comments in bold, port names in italic.
const FONTS = [
    ["fontBold", "Module names (bold)"],
    ["fontItalic", "Port names (italic)"],
    ["fontRegular", "Other text (regular)"],
];
const RENDER_DELAY = 300;

const state = {
    presets: [],       // [{id, style}]
    style: null,       // the current, checked style
    presetId: "",      // "" once the style has been changed by hand
    options: {direction: "LR", layout: "elk", pad: 25, transparent: true},
    fonts: {},         // D2.js option -> {name, bytes: number[]}
    fileName: "patch",
    loaded: null,      // the text as last loaded or saved, see setLoaded()
    svg: null,
    d2Text: null,
    summary: "",
};

let d2 = null;
let renderToken = 0;
let renderTimer = 0;

// localStorage can be missing or blocked; the page works without it.
const store = {
    get(key) {
        try {
            const value = localStorage.getItem("patchbook-web:" + key);
            return value === null ? null : JSON.parse(value);
        } catch {
            return null;
        }
    },
    set(key, value) {
        try {
            localStorage.setItem("patchbook-web:" + key, JSON.stringify(value));
        } catch {
            // not saved; nothing else to do
        }
    },
};

async function fetchJson(path) {
    const response = await fetch(path);
    if (!response.ok) {
        throw new Error(`${path}: ${response.status} ${response.statusText}`);
    }
    return response.json();
}

function download(name, data, type) {
    const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], {type}));
    const link = Object.assign(document.createElement("a"), {href: url, download: name});
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function element(tag, props = {}, ...children) {
    const node = Object.assign(document.createElement(tag), props);
    node.append(...children);
    return node;
}

// Rendering

function scheduleRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(render, RENDER_DELAY);
}

function showMessages(items) {
    $("messages").replaceChildren(...items.map(({text, error}) => element("li", {className: error ? "error" : "", textContent: text})));
}

function showStatus(text, error = false) {
    $("preview").replaceChildren(element("p", {className: "status" + (error ? " error" : ""), textContent: text}));
    setDiagram(null, null);
}

function setDiagram(svg, d2Text) {
    state.svg = svg;
    state.d2Text = d2Text;
    for (const id of ["download-svg", "download-png", "zoom-fit", "zoom-actual"]) {
        $(id).disabled = !svg;
    }
    showSummary();
}

// "3 modules, 2 cables", plus the zoom level when the preview shrinks the diagram to fit.
function showSummary() {
    let text = state.summary;
    const img = $("preview").querySelector("img");
    if (text && state.svg && img?.complete && !$("preview").classList.contains("actual-size")) {
        const scale = img.clientWidth / svgSize(state.svg)[0];
        if (scale > 0 && scale < 0.995) {
            text += ` · shown at ${Math.round(scale * 100)}%`;
        }
    }
    $("summary").textContent = text;
}

function setZoom(actual) {
    $("preview").classList.toggle("actual-size", actual);
    $("zoom-fit").setAttribute("aria-pressed", String(!actual));
    $("zoom-actual").setAttribute("aria-pressed", String(actual));
    showSummary();
}

async function render() {
    const token = ++renderToken;
    const text = $("source").value;
    store.set("text", text);
    if (!d2) {
        return;
    }

    let patch;
    try {
        patch = parsePatchbook(text);
    } catch (error) {
        if (!(error instanceof PatchbookError)) {
            throw error;
        }
        showMessages([{text: error.message, error: true}]);
        return;  // keep showing the last good diagram
    }
    showMessages(patch.warnings.map(w => ({text: `Line ${w.lineNumber}: ${w.message}`})));

    const cableCount = [...patch.modules.values()].reduce((n, m) => n + [...m.connections.out.values()].reduce((k, port) => k + port.length, 0), 0);
    state.summary = patch.modules.size
        ? `${patch.modules.size} module${patch.modules.size === 1 ? "" : "s"}, ${cableCount} cable${cableCount === 1 ? "" : "s"}`
        : "";
    showSummary();
    if (!patch.modules.size) {
        showStatus("Your diagram appears here. Type a patch, load an example, or drop a .pb file anywhere on this page.");
        return;
    }

    $("preview").classList.add("busy");
    try {
        const d2Text = styleD2(toD2(patch, state.options.direction), state.style, {transparent: state.options.transparent});
        const fonts = Object.fromEntries(Object.entries(state.fonts).map(([option, font]) => [option, font.bytes]));
        const svg = await renderSvg(d2, d2Text, d2Options(state.style, {layout: state.options.layout, pad: state.options.pad, fonts}));
        if (token !== renderToken) {
            return;  // a newer render has started
        }
        const url = URL.createObjectURL(new Blob([svg], {type: "image/svg+xml"}));
        const img = element("img", {src: url, alt: `Diagram of the patch: ${[...patch.modules.keys()].join(", ")}`});
        img.addEventListener("load", () => {
            URL.revokeObjectURL(url);
            showSummary();
        }, {once: true});
        $("preview").replaceChildren(img);
        setDiagram(svg, d2Text);
    } catch (error) {
        if (token !== renderToken) {
            return;
        }
        const message = error instanceof StyleError ? error.message : d2ErrorMessage(error);
        showStatus(`The diagram couldn't be drawn: ${message}`, true);
    } finally {
        if (token === renderToken) {
            $("preview").classList.remove("busy");
        }
    }
}

// D2.js reports compile errors as a JSON list of {range, errmsg}.
function d2ErrorMessage(error) {
    try {
        return JSON.parse(error.message).map(e => e.errmsg).join("; ");
    } catch {
        return error.message;
    }
}

// Downloads

function svgSize(svg) {
    const match = /viewBox="[-\d.]+ [-\d.]+ ([\d.]+) ([\d.]+)"/.exec(svg);
    return match ? [Number(match[1]), Number(match[2])] : [800, 600];
}

async function downloadPng() {
    const svg = state.svg;
    const [width, height] = svgSize(svg);
    const scale = 2;
    const url = URL.createObjectURL(new Blob([svg], {type: "image/svg+xml"}));
    try {
        const img = new Image();
        img.src = url;
        await img.decode();
        const canvas = element("canvas", {width: Math.round(width * scale), height: Math.round(height * scale)});
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
        download(state.fileName + ".png", blob);
    } finally {
        URL.revokeObjectURL(url);
    }
}

// Settings

function presetById(id) {
    return state.presets.find(p => p.id === id);
}

function setStyle(style, presetId) {
    state.style = style;
    state.presetId = presetId;
    store.set("style", style);
    store.set("preset", presetId);
    syncStyleControls();
    scheduleRender();
}

function syncStyleControls() {
    const select = $("preset");
    let custom = select.querySelector('option[value=""]');
    if (!state.presetId && !custom) {
        custom = element("option", {value: "", textContent: "Custom"});
        select.prepend(custom);
    } else if (state.presetId && custom) {
        custom.remove();
    }
    if (custom) {
        custom.textContent = state.style.name === "Custom" ? "Custom" : `Custom (${state.style.name})`;
    }
    select.value = state.presetId;
    for (const input of document.querySelectorAll("[data-palette]")) {
        input.value = state.style.palette[input.dataset.palette];
    }
    for (const input of document.querySelectorAll("[data-cable-color]")) {
        input.value = state.style.cables[input.dataset.cableColor].color;
    }
    for (const select of document.querySelectorAll("[data-cable-dash]")) {
        const dash = state.style.cables[select.dataset.cableDash].dash;
        if (![...select.options].some(o => Number(o.value) === dash)) {
            select.append(element("option", {value: dash, textContent: `Dashes (${dash})`}));
        }
        select.value = String(dash);
    }
    $("preview").style.setProperty("--preview-bg", state.style.palette.bg);
}

// A change made by hand: the style is no longer one of the presets.
function editStyle(change) {
    const style = structuredClone(state.style);
    if (state.presetId) {
        style.name = presetById(state.presetId).style.name;
    }
    change(style);
    setStyle(style, "");
}

function buildStyleControls() {
    const swatch = ([name, label]) => {
        const input = element("input", {type: "color"});
        input.dataset.palette = name;
        input.addEventListener("input", () => editStyle(style => {
            style.palette[name] = input.value;
        }));
        return element("label", {className: "swatch"}, input, label);
    };
    $("palette").replaceChildren(...PALETTE_MAIN.map(swatch));
    $("palette-more").replaceChildren(...PALETTE_MORE.map(swatch));

    const rows = [];
    for (const name of CABLE_NAMES) {
        const [label, symbol] = CABLE_LABELS[name];
        const colour = element("input", {type: "color", ariaLabel: `${label} colour`});
        colour.dataset.cableColor = name;
        colour.addEventListener("input", () => editStyle(style => {
            style.cables[name].color = colour.value;
        }));
        const dash = element("select", {ariaLabel: `${label} line`},
            ...DASHES.map(([value, text]) => element("option", {value, textContent: text})));
        dash.dataset.cableDash = name;
        dash.addEventListener("change", () => editStyle(style => {
            style.cables[name].dash = Number(dash.value);
        }));
        rows.push(colour, element("span", {}, label + " ", element("code", {textContent: symbol})), dash);
    }
    $("cables").replaceChildren(...rows);

    $("preset").replaceChildren(...state.presets.map(p => element("option", {value: p.id, textContent: p.style.name})));
    $("preset").addEventListener("change", () => {
        const preset = presetById($("preset").value);
        if (preset) {
            setStyle(structuredClone(preset.style), preset.id);
        }
    });
}

function buildFontControls() {
    $("fonts").replaceChildren(...FONTS.map(([option, label]) => {
        const input = element("input", {type: "file", accept: ".ttf,font/ttf", hidden: true});
        const name = element("span", {className: "font-name", textContent: "D2's Source Sans Pro"});
        const choose = element("button", {type: "button", textContent: "Choose…", ariaLabel: `Choose a font for ${label}`});
        const reset = element("button", {type: "button", textContent: "Reset", disabled: true});
        choose.addEventListener("click", () => input.click());
        input.addEventListener("change", async () => {
            const file = input.files[0];
            input.value = "";
            if (!file) {
                return;
            }
            // D2.js passes options to its worker as JSON, so fonts go as plain arrays.
            state.fonts[option] = {name: file.name, bytes: Array.from(new Uint8Array(await file.arrayBuffer()))};
            name.textContent = file.name;
            reset.disabled = false;
            scheduleRender();
        });
        reset.addEventListener("click", () => {
            delete state.fonts[option];
            name.textContent = "D2's Source Sans Pro";
            reset.disabled = true;
            scheduleRender();
        });
        return element("div", {className: "font-row"}, element("span", {textContent: label}), name, choose, reset, input);
    }));
}

function bindOptions() {
    const options = state.options;
    $("direction").value = options.direction;
    $("layout").value = options.layout;
    $("pad").value = options.pad;
    $("transparent").checked = options.transparent;
    const changed = () => {
        store.set("options", options);
        scheduleRender();
    };
    $("direction").addEventListener("change", () => {
        options.direction = $("direction").value;
        changed();
    });
    $("layout").addEventListener("change", () => {
        options.layout = $("layout").value;
        changed();
    });
    $("pad").addEventListener("input", () => {
        const pad = Number($("pad").value);
        if (Number.isInteger(pad) && pad >= 0 && pad <= 200) {
            options.pad = pad;
            changed();
        }
    });
    $("transparent").addEventListener("change", () => {
        options.transparent = $("transparent").checked;
        changed();
    });
}

function restoreOptions() {
    const saved = store.get("options");
    if (!saved) {
        return;
    }
    const options = state.options;
    if (["LR", "RT", "DN"].includes(saved.direction)) options.direction = saved.direction;
    if (["elk", "dagre"].includes(saved.layout)) options.layout = saved.layout;
    if (Number.isInteger(saved.pad) && saved.pad >= 0 && saved.pad <= 200) options.pad = saved.pad;
    if (typeof saved.transparent === "boolean") options.transparent = saved.transparent;
}

// Patch files

// The text as last loaded (example or file) and its name. Text that differs
// from it has been typed, and loading something else asks first.
function setLoaded(text, fileName) {
    state.loaded = text;
    state.fileName = fileName.replace(/\.[^.]*$/, "") || "patch";
    store.set("loaded", {text, fileName: state.fileName});
}

function hasTypedText() {
    const text = $("source").value;
    return text.trim() !== "" && text !== state.loaded;
}

function setText(text, fileName, what) {
    if (hasTypedText() && !confirm(`Replace your patch with ${what}? Your changes will be lost unless you save them first.`)) {
        return;
    }
    $("source").value = text;
    setLoaded(text, fileName);
    render();
}

async function openFile(file) {
    if (!/\.(pb|txt)$/i.test(file.name) && !file.type.startsWith("text/")) {
        showMessages([{text: `${file.name} isn't a Patchbook file. Patches are plain text, usually ending in .pb or .txt.`, error: true}]);
        return;
    }
    if (file.size > 1_000_000) {
        showMessages([{text: `${file.name} is too big for a patch.`, error: true}]);
        return;
    }
    let text;
    try {
        text = await file.text();
    } catch (error) {
        showMessages([{text: `${file.name} couldn't be read: ${error.message}`, error: true}]);
        return;
    }
    setText(text, file.name, file.name);
}

// Dropping a file anywhere on the page opens it. Without this, the browser
// would open a file dropped outside the editor itself, leaving the page.
function bindDrop() {
    const overlay = $("drop-overlay");
    let depth = 0;  // dragenter and dragleave also fire for every child element
    let timer = 0;
    const isFileDrag = event => event.dataTransfer?.types.includes("Files");
    const hide = () => {
        depth = 0;
        clearTimeout(timer);
        overlay.hidden = true;
    };
    window.addEventListener("dragenter", event => {
        if (isFileDrag(event)) {
            depth++;
            overlay.hidden = false;
        }
    });
    window.addEventListener("dragleave", event => {
        if (isFileDrag(event) && --depth <= 0) {
            hide();
        }
    });
    window.addEventListener("dragover", event => {
        if (isFileDrag(event)) {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
            // dragover repeats while the file is over the page. When it stops
            // without a dragleave (some ways of cancelling a drag), hide anyway.
            overlay.hidden = false;
            clearTimeout(timer);
            timer = setTimeout(hide, 500);
        }
    });
    window.addEventListener("drop", event => {
        if (!isFileDrag(event)) {
            return;
        }
        event.preventDefault();
        hide();
        const files = event.dataTransfer.files;
        if (files.length) {
            openFile(files[0]);
        }
    });
}

function bindFiles(examples) {
    $("example").append(...examples.map(e => element("option", {value: e.file, textContent: e.title})));
    $("example").addEventListener("change", async () => {
        const option = $("example").selectedOptions[0];
        $("example").value = "";
        if (option.value) {
            const response = await fetch("examples/" + option.value);
            setText(await response.text(), option.value, `the example "${option.textContent}"`);
        }
    });

    $("open").addEventListener("click", () => $("open-file").click());
    $("open-file").addEventListener("change", () => {
        const file = $("open-file").files[0];
        $("open-file").value = "";
        if (file) {
            openFile(file);
        }
    });
    $("save").addEventListener("click", () => {
        download(state.fileName + ".pb", $("source").value, "text/plain");
        setLoaded($("source").value, state.fileName);
    });
    bindDrop();

    $("source").addEventListener("input", scheduleRender);
    $("download-svg").addEventListener("click", () => download(state.fileName + ".svg", state.svg, "image/svg+xml"));
    $("download-png").addEventListener("click", downloadPng);
    $("zoom-fit").addEventListener("click", () => setZoom(false));
    $("zoom-actual").addEventListener("click", () => setZoom(true));
    new ResizeObserver(showSummary).observe($("preview"));

    $("export-style").addEventListener("click", () =>
        download("patchbook-style.json", JSON.stringify(state.style, null, 2) + "\n", "application/json"));
    $("import-style").addEventListener("click", () => $("import-file").click());
    $("import-file").addEventListener("change", async () => {
        const file = $("import-file").files[0];
        $("import-file").value = "";
        if (!file) {
            return;
        }
        try {
            setStyle(checkStyle(JSON.parse(await file.text()), state.presets[0].style), "");
        } catch (error) {
            alert(`${file.name} isn't a style this page can use: ${error.message}`);
        }
    });
}

async function main() {
    const [presetIds, examples] = await Promise.all([fetchJson("presets/index.json"), fetchJson("examples/index.json")]);
    const presetStyles = await Promise.all(presetIds.map(id => fetchJson(`presets/${id}.json`)));
    state.presets = presetIds.map((id, i) => ({id, style: checkStyle(presetStyles[i], presetStyles[i])}));

    // The saved style, or the first preset.
    const first = state.presets[0];
    const savedPreset = presetById(store.get("preset"));
    let style = savedPreset ? structuredClone(savedPreset.style) : null;
    if (!style && store.get("style")) {
        try {
            style = checkStyle(store.get("style"), first.style);
        } catch {
            style = null;
        }
    }
    state.style = style ?? structuredClone(first.style);
    state.presetId = style ? (savedPreset?.id ?? "") : first.id;

    restoreOptions();
    buildStyleControls();
    buildFontControls();
    bindOptions();
    bindFiles(examples);
    syncStyleControls();

    const savedText = store.get("text");
    const loaded = store.get("loaded");
    if (typeof savedText === "string") {
        $("source").value = savedText;
        if (typeof loaded?.text === "string" && typeof loaded.fileName === "string") {
            setLoaded(loaded.text, loaded.fileName);
        }
    } else {
        const response = await fetch("examples/" + examples[0].file);
        $("source").value = await response.text();
        setLoaded($("source").value, examples[0].file);
    }

    try {
        const {D2} = await import("../vendor/d2/d2.js");
        d2 = new D2();
    } catch (error) {
        showStatus(`The diagram engine didn't load: ${error.message}`, true);
        return;
    }
    render();
}

main().catch(error => showStatus(`Something went wrong: ${error.message}`, true));
