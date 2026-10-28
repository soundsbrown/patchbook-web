// Diagram styling: turns Patchbook's D2 code into a themed diagram, for the
// page and the command line (bin/patchbook-web.mjs).
//
// A style (presets/*.json, or exported from the page) is
//   {name, theme, palette: {bright, text, ..., accent}, cables: {audio: {color, dash}, ...}}
// theme is a D2 theme ID; the palette overrides its colours, so the theme
// mostly decides the details the palette doesn't cover. All colours are hex.

// D2 theme colour codes -> palette names. N1-N7 are text through background,
// B1-B6 strokes through shape fills.
export const THEME_CODES = {
    N1: "bright", N2: "text", N3: "muted", N4: "dim",
    N5: "border-strong", N6: "border", N7: "bg",
    B1: "accent", B2: "accent", B3: "dim",
    B4: "bg-raised", B5: "bg-raised", B6: "bg-raised",
    AA2: "accent", AA4: "border", AA5: "bg-raised",
    AB4: "border", AB5: "bg-raised",
};
export const PALETTE_NAMES = [...new Set(Object.values(THEME_CODES))];

// Patchbook's D2 colour for each connection type (linetypes in patchbook.js),
// and "black" for a type it doesn't know.
export const CABLE_TYPES = {
    "#c5c2b8": "audio", "#4caf50": "cv", "#64b5f6": "pitch", "#e57373": "gate",
    "#ffb74d": "trigger", "#ce93d8": "clock", "black": "other",
};
export const CABLE_NAMES = Object.values(CABLE_TYPES);

// The only layouts offered. TALA is open source and bundled since D2 0.9.0;
// older builds watermark its output, which checkSvg refuses to show.
export const LAYOUTS = ["elk", "dagre", "tala"];
export const WATERMARK = "UNLICENSED COPY";

const HEX_RE = /^#[0-9a-f]{6}$/i;
const STROKE_RE = /style\.stroke: "([^"]+)"/g;
const BACKGROUND = "style: {\n  fill: transparent\n}\n";
// Port names go into the D2 code unquoted, so a patch could smuggle in D2
// settings of its own, such as a layout-engine the page doesn't offer.
const LAYOUT_VAR_RE = /d2-config|layout-engine/;

export class StyleError extends Error {}

// A checked copy of a style (e.g. one loaded from a file). Anything missing
// comes from fallback; anything that isn't a hex colour or a known value is an error.
export function checkStyle(raw, fallback) {
    if (typeof raw !== "object" || raw === null) {
        throw new StyleError("A style must be a JSON object.");
    }
    const colour = (value, what) => {
        if (!HEX_RE.test(value)) {
            throw new StyleError(`${what} must be a colour like #1d1612, not ${JSON.stringify(value)}.`);
        }
        return value.toLowerCase();
    };
    const style = {
        name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim().slice(0, 60) : "Custom",
        theme: raw.theme ?? fallback.theme,
        palette: {},
        cables: {},
    };
    if (!Number.isInteger(style.theme) || style.theme < 0 || style.theme > 999) {
        throw new StyleError(`theme must be a D2 theme ID, not ${JSON.stringify(raw.theme)}.`);
    }
    for (const name of PALETTE_NAMES) {
        style.palette[name] = colour(raw.palette?.[name] ?? fallback.palette[name], `palette.${name}`);
    }
    for (const name of CABLE_NAMES) {
        const cable = {...fallback.cables[name], ...raw.cables?.[name]};
        const dash = Number(cable.dash ?? 0);
        if (!Number.isInteger(dash) || dash < 0 || dash > 10) {
            throw new StyleError(`cables.${name}.dash must be a whole number from 0 to 10.`);
        }
        style.cables[name] = {color: colour(cable.color, `cables.${name}.color`), dash};
    }
    return style;
}

function themePrelude(palette) {
    const overrides = Object.entries(THEME_CODES).map(([code, name]) => `      ${code}: "${palette[name]}"`).join("\n");
    return "vars: {\n  d2-config: {\n    theme-overrides: {\n" + overrides + "\n    }\n  }\n}\n\n";
}

function restyleConnections(d2Text, cables) {
    return d2Text.replace(STROKE_RE, (match, patchbookColour) => {
        const type = CABLE_TYPES[patchbookColour.toLowerCase()];
        if (!type) {
            return match;
        }
        const {color, dash} = cables[type];
        return `style.stroke: "${color}"` + (dash ? `\n    style.stroke-dash: ${dash}` : "");
    });
}

// Patchbook's D2 code with the style applied. A transparent background
// (Patchbook's own) suits diagrams placed on a page; otherwise it gets the
// palette's background colour.
export function styleD2(d2Text, style, {transparent = true} = {}) {
    if (LAYOUT_VAR_RE.test(d2Text)) {
        throw new StyleError("The patch tries to set D2's layout engine, which isn't allowed.");
    }
    let styled = restyleConnections(d2Text, style.cables);
    if (!transparent) {
        styled = styled.replace(BACKGROUND, `style: {\n  fill: "${style.palette.bg}"\n}\n`);
    }
    return themePrelude(style.palette) + styled;
}

// Hand-written D2 code with the style's palette: cables and background are
// left as the code sets them.
export function themeD2(d2Text, style) {
    if (LAYOUT_VAR_RE.test(d2Text)) {
        throw new StyleError("The D2 code tries to set D2's layout engine, which isn't allowed.");
    }
    return themePrelude(style.palette) + d2Text;
}

// D2.js compile/render options. fonts is {fontRegular, fontBold, ...} as Uint8Arrays, or {}.
export function d2Options(style, {layout = "elk", pad = 25, fonts = {}} = {}) {
    if (!LAYOUTS.includes(layout)) {
        throw new StyleError(`Unknown layout: ${layout}`);
    }
    // scale: 1 gives the SVG a width and height; D2.js leaves them out by default.
    return {layout, themeID: style.theme, pad, scale: 1, ...fonts};
}

export function checkSvg(svg) {
    if (svg.includes(WATERMARK)) {
        throw new StyleError("D2 watermarked this diagram, so it won't be shown.");
    }
    return svg;
}
