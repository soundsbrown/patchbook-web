// D2 code -> SVG with D2.js, making room for the port labels under ELK.
//
// Port labels sit at either end of a cable. When a diagram flows left to
// right, ELK's default gap between layers is often narrower than the two
// labels of one cable, and they run into each other. site_diagrams.py widens
// the gap with d2's --elk-nodeNodeBetweenLayers, which D2.js doesn't offer.
// Instead, each crowded cable gets an invisible centre label ("spacer") as
// wide as the shortfall: ELK makes room for centre labels. The spacer texts,
// and the gaps D2 masks out of the cables behind them, are then removed from
// the SVG. Patchbook gives cables no centre labels of its own, so every
// masked-out rect in the SVG is a spacer's.

import {checkSvg} from "./style.js";

const CONNECTION_RE = /^(\S+) -> (\S+) \{\n/gm;
const SPACER_CHAR = "x";
const SPACER_TEXT_RE = /<text [^>]*fill="transparent"[^>]*>x+<\/text>/g;
const MASK_HOLE_RE = /(<mask id="[^"]+"[^>]*>[\s\S]*?)<\/mask>/g;
const BLACK_RECT_RE = /\s*<rect [^>]*fill="black"><\/rect>/g;
// Room between the two labels of a cable, and around the arrowhead.
const LABEL_MARGIN = 30;
const MAX_PASSES = 3;

// D2's ID for each connection block in the code, in order: "(a -> b)[n]".
function connectionIds(d2Text) {
    const seen = new Map();
    return [...d2Text.matchAll(CONNECTION_RE)].map(match => {
        const pair = `(${match[1]} -> ${match[2]})`;
        const n = seen.get(pair) ?? 0;
        seen.set(pair, n + 1);
        return {id: `${pair}[${n}]`, index: match.index + match[0].length};
    });
}

function withSpacers(d2Text, spacers) {
    let text = d2Text;
    // Insert from the end, so earlier positions stay valid.
    for (const {id, index} of connectionIds(d2Text).reverse()) {
        const chars = spacers.get(id);
        if (chars) {
            text = text.slice(0, index) + `    label: "${SPACER_CHAR.repeat(chars)}"\n    style.font-color: transparent\n` + text.slice(index);
        }
    }
    return text;
}

// How many spacer characters each crowded cable needs, given a compiled diagram.
function shortfalls(diagram, spacers) {
    const shapes = new Map(diagram.shapes.map(shape => [shape.id, shape]));
    const needed = new Map();
    for (const c of diagram.connections) {
        const src = shapes.get(c.src), dst = shapes.get(c.dst);
        if (!c.srcLabel?.label || !c.dstLabel?.label || !src || !dst) {
            continue;
        }
        const gap = dst.pos.x - (src.pos.x + src.width);
        const want = c.srcLabel.labelWidth + c.dstLabel.labelWidth + LABEL_MARGIN;
        if (gap < 0 || gap >= want) {
            continue;  // a cable going backwards, or one with room enough
        }
        const chars = spacers.get(c.id) ?? 0;
        const charWidth = chars && c.labelWidth ? c.labelWidth / chars : 8;
        needed.set(c.id, chars + Math.ceil((want - gap) / charWidth));
    }
    return needed;
}

function removeSpacers(svg) {
    return svg.replace(SPACER_TEXT_RE, "").replace(MASK_HOLE_RE, (match, body) => body.replace(BLACK_RECT_RE, "") + "</mask>");
}

// The SVG for some D2 code. options are D2.js compile options (see style.js d2Options).
export async function renderSvg(d2, d2Text, options) {
    let compiled = await d2.compile(d2Text, options);
    const spacers = new Map();
    if (options.layout === "elk" && /^direction: right$/m.test(d2Text)) {
        for (let pass = 0; pass < MAX_PASSES; pass++) {
            const needed = shortfalls(compiled.diagram, spacers);
            if (!needed.size) {
                break;
            }
            for (const [id, chars] of needed) {
                spacers.set(id, chars);
            }
            compiled = await d2.compile(withSpacers(d2Text, spacers), options);
        }
    }
    let svg = await d2.render(compiled.diagram, {...compiled.renderOptions, ...options});
    if (spacers.size) {
        svg = removeSpacers(svg);
    }
    return checkSvg(svg);
}
