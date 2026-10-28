// A credit line (such as an address and a licence) under a diagram's
// bottom-right corner, right-aligned with the content. It adds a little
// height but no width, unless the diagram is narrower than the line.
//
// D2 can't place it there itself: `near: bottom-right` puts a label
// diagonally outside the corner, which widens the diagram. So the line is
// rendered once as a diagram of its own (renderCredit), and its text and font
// are added to each SVG afterwards (addCredit). D2 embeds only the glyphs a
// diagram uses, so the line carries its own font subset (a few KB).

import {d2Options} from "./style.js";

export const CREDIT_ID = "patchbook-credit";
const FONT_SIZE = 13;
// The credit sits GAP below the content, with BOTTOM under it.
const GAP = 8, BOTTOM = 10;
// D2's viewBox is the content's bounding box grown by pad + MARGIN on each side.
const MARGIN = 1;

const INNER_SVG_RE = /<svg class="[^"]*\bd2-svg\b[^"]*"[^>]*\bviewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"[^>]*>/;
const BACKGROUND_RE = /<rect x="[-\d.]+" y="[-\d.]+" width="[\d.]+" height="[\d.]+"/;
const FONT_RE = /@font-face \{\s*font-family: d2-\d+-font-regular;\s*src: url\("([^"]+)"\);/;
const TEXT_RE = /<text x="([\d.]+)" y="([\d.]+)"[^>]*>/;

// Rounded, so the numbers in the SVG stay short.
const num = value => Math.round(value * 1000) / 1000;

function escapeXml(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function innerViewBox(svg) {
    const inner = svg.match(INNER_SVG_RE);
    if (!inner) {
        throw new Error("D2's SVG has no inner <svg> with a viewBox, so the credit can't be added.");
    }
    return inner;
}

// left, top, width and height of the content in D2's SVG.
function contentBox(svg, pad) {
    const [minX, minY, width, height] = innerViewBox(svg).slice(1).map(Number);
    const margin = pad + MARGIN;
    return [minX + margin, minY + margin, width - 2 * margin, height - 2 * margin];
}

// The credit line, rendered on its own: {text, colour, font, width, height, baseline}.
export async function renderCredit(d2, text, style) {
    const options = d2Options(style);
    const compiled = await d2.compile(`${CREDIT_ID}: ${JSON.stringify(text)} {\n  shape: text\n  style.font-size: ${FONT_SIZE}\n}\n`, options);
    const svg = await d2.render(compiled.diagram, {...compiled.renderOptions, ...options});
    const font = svg.match(FONT_RE), textPos = svg.match(TEXT_RE);
    if (!font || !textPos) {
        throw new Error("Unexpected SVG from D2 for the credit.");
    }
    const [, top, width, height] = contentBox(svg, options.pad);
    return {text, colour: style.palette.dim, font: font[1], width, height, baseline: Number(textPos[2]) - top};
}

// svg (from D2, rendered with this pad) with the credit added under the content.
export function addCredit(svg, credit, pad) {
    const inner = innerViewBox(svg);
    const [minX, minY, width, height] = inner.slice(1).map(Number);
    const margin = pad + MARGIN;
    const [left, contentTop, contentWidth, contentHeight] = contentBox(svg, pad);
    const right = num(Math.max(left + contentWidth, left + credit.width));
    const top = contentTop + contentHeight + GAP;
    const newWidth = num(right + margin - minX);
    const newHeight = num(Math.max(height, top + credit.height + BOTTOM - minY));

    // The outer <svg> and D2's own one share width, height and viewBox size;
    // the first <rect> inside D2's <svg> is its background, of the same size.
    const innerEnd = inner.index + inner[0].length;
    let head = svg.slice(0, innerEnd), body = svg.slice(innerEnd);
    head = head.replaceAll(`${width} ${height}"`, `${newWidth} ${newHeight}"`)
        .replaceAll(`width="${width}" height="${height}"`, `width="${newWidth}" height="${newHeight}"`);
    body = body.replace(BACKGROUND_RE, `<rect x="${minX}" y="${minY}" width="${newWidth}" height="${newHeight}"`);

    const label = `<g id="${CREDIT_ID}"><style type="text/css"><![CDATA[@font-face { font-family: ${CREDIT_ID}-font; ` +
        `src: url("${credit.font}"); }]]></style><text x="${right}" y="${num(top + credit.baseline)}" fill="${credit.colour}" ` +
        `style="font-family:${CREDIT_ID}-font;font-size:${FONT_SIZE}px;text-anchor:end">${escapeXml(credit.text)}</text></g>`;
    // D2's <svg> closes just before the outer one, at the very end.
    const end = body.lastIndexOf("</svg>", body.lastIndexOf("</svg>") - 1);
    return head + body.slice(0, end) + label + body.slice(end);
}
