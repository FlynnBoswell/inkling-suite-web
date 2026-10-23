import { IMAGE_DATA_URL, MAX_IMAGE_CHARS } from "../core/suite/model.js";
import { contrastIssue, cssFont, isLargeOnPhone, layout, measuredContrast } from "../core/suite/design.js";
/** Pixel's drawing: bundled fonts, rendering a design onto a canvas from its layout, photos. Used by the maker, Ripple and the Photoshop export. */
// ---------------------------------------------------------------- fonts
const FONT_FILES = [
    ["Bebas Neue", "bebas-neue", "400", "normal"], ["Alfa Slab One", "alfa-slab-one", "400", "normal"], ["Oswald", "oswald", "700", "normal"],
    ["Inter", "inter", "400", "normal"], ["Inter", "inter", "700", "normal"], ["Playfair Display", "playfair-display", "700", "italic"],
];
const LATIN = "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";
const LATIN_EXT = "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF";
let fontsReady = null;
/** Loads the bundled fonts once. A font that fails to load falls back to a system font (the canvas still works). */
export function loadFonts() {
    fontsReady ??= Promise.all(FONT_FILES.flatMap(([family, file, weight, style]) => [["latin", LATIN], ["latin-ext", LATIN_EXT]].map(async ([sub, range]) => {
        const f = new FontFace(family, `url(./fonts/${file}-${sub}-${weight}-${style}.woff2) format("woff2")`, { weight, style, unicodeRange: range, display: "block" });
        try {
            document.fonts.add(await f.load());
        }
        catch { /* fallback font */ }
    }))).then(() => undefined);
    return fontsReady;
}
// ---------------------------------------------------------------- rendering
const images = new Map();
export function imageFor(src) {
    let p = images.get(src);
    if (!p) {
        const img = new Image();
        img.src = src;
        p = img.decode().then(() => img);
        if (images.size > 4)
            images.clear();
        images.set(src, p);
    }
    return p;
}
const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
/** Up to ~4000 evenly spread RGBA samples from a region of the canvas. */
function sample(ctx, x, y, w, hh) {
    const W = ctx.canvas.width, H = ctx.canvas.height;
    const x0 = Math.max(0, Math.floor(x)), y0 = Math.max(0, Math.floor(y)), x1 = Math.min(W, Math.ceil(x + w)), y1 = Math.min(H, Math.ceil(y + hh));
    if (x1 <= x0 || y1 <= y0)
        return [];
    const d = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
    const n = (x1 - x0) * (y1 - y0);
    const step = Math.max(1, Math.floor(n / 4000));
    const out = [];
    for (let i = 0; i < n; i += step)
        out.push(d[i * 4], d[i * 4 + 1], d[i * 4 + 2], 255);
    return out;
}
export const brandMark = (b) => (b ? { logoWidth: b.logo ? b.logoWidth : 0, logoHeight: b.logo ? b.logoHeight : 0, position: b.logoPosition, handle: b.handle, sponsors: b.sponsors.map((sp) => ({ width: sp.width, height: sp.height })) } : null);
/** Draws the design onto the canvas at full size and returns what needs attention, including measured contrast. */
export async function render(canvas, d, presetId, brand = null, only) {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const measure = (text, font, ls) => { ctx.font = font; ctx.letterSpacing = `${ls}px`; return ctx.measureText(text).width; };
    const L = layout(d, presetId, measure, brandMark(brand));
    const photo = d.photo ? await imageFor(d.photo).catch(() => null) : null;
    const cutout = d.cutout ? await imageFor(d.cutout).catch(() => null) : null;
    const logo = brand?.logo ? await imageFor(brand.logo).catch(() => null) : null;
    canvas.width = L.width;
    canvas.height = L.height;
    const issues = [...L.issues];
    const seen = new Set();
    const extra = new Map();
    for (const o of L.ops)
        if (o.t === "image" && !extra.has(o.key)) {
            const src = o.key === "compLogo" ? d.compLogo : o.key.startsWith("sponsor:") ? brand?.sponsors[Number(o.key.slice(8))]?.logo ?? "" : "";
            extra.set(o.key, src ? await imageFor(src).catch(() => null) : null);
        }
    const fillImg = d.letterFill && L.ops.some((o) => o.t === "letters") ? await imageFor(d.letterFill).catch(() => null) : null;
    for (const o of L.ops) {
        if (only && !only(o))
            continue;
        if (o.t === "logo") {
            if (logo)
                ctx.drawImage(logo, o.x, o.y, o.w, o.h);
        }
        else if (o.t === "image") {
            const im = extra.get(o.key);
            if (im)
                ctx.drawImage(im, o.x, o.y, o.w, o.h);
        }
        else if (o.t === "letters")
            drawLetters(ctx, o, fillImg);
        else if (o.t === "cutout") {
            if (cutout)
                drawCover(ctx, cutout, o);
        }
        else
            draw(ctx, o, photo, issues, seen);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.filter = "none";
    ctx.letterSpacing = "0px";
    return issues;
}
/** Giant letters: plain ones in the text colour; the filled ones show the artwork through the letter shapes. */
function drawLetters(ctx, o, fill) {
    // Capitals sit on the baseline; their tops are about 0.72 of the size above it, which is where the line starts.
    const font = cssFont(o.font, o.size);
    const mid = o.y + o.size * 0.74;
    ctx.save();
    ctx.font = font;
    ctx.letterSpacing = "0px";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.globalAlpha = o.alpha;
    ctx.fillStyle = o.colour;
    for (const l of o.letters)
        if (!l.filled || !fill)
            ctx.fillText(l.ch, l.x, mid);
    ctx.restore();
    if (!fill || !o.fillBox)
        return;
    // Letters as a mask on their own canvas, then the artwork drawn only where the letters are.
    const b = o.fillBox;
    const pad = o.size * 0.2;
    const off = document.createElement("canvas");
    off.width = Math.ceil(b.w + pad * 2);
    off.height = Math.ceil(b.h + pad * 2);
    const oc = off.getContext("2d");
    oc.font = font;
    oc.textAlign = "left";
    oc.textBaseline = "alphabetic";
    oc.fillStyle = "#000";
    for (const l of o.letters)
        if (l.filled)
            oc.fillText(l.ch, l.x - b.x + pad, mid - b.y + pad);
    oc.globalCompositeOperation = "source-in";
    const s = Math.max(off.width / fill.naturalWidth, off.height / fill.naturalHeight);
    const dw = fill.naturalWidth * s, dh = fill.naturalHeight * s;
    oc.drawImage(fill, (off.width - dw) / 2, (off.height - dh) / 2, dw, dh);
    ctx.drawImage(off, b.x - pad, b.y - pad);
}
function draw(ctx, o, photo, issues, seen) {
    const W = ctx.canvas.width, H = ctx.canvas.height;
    if (o.t === "fill") {
        ctx.fillStyle = o.colour;
        ctx.fillRect(0, 0, W, H);
    }
    else if (o.t === "rect") {
        ctx.fillStyle = o.colour;
        ctx.beginPath();
        ctx.roundRect(o.x, o.y, o.w, o.h, o.radius ?? 0);
        ctx.fill();
    }
    else if (o.t === "photo" && photo)
        drawCover(ctx, photo, o);
    else if (o.t === "tint") {
        ctx.save();
        ctx.globalCompositeOperation = o.mode;
        ctx.globalAlpha = o.alpha;
        if (o.colour2) {
            const g = ctx.createLinearGradient(0, 0, 0, H);
            g.addColorStop(0, o.colour);
            g.addColorStop(1, o.colour2);
            ctx.fillStyle = g;
        }
        else
            ctx.fillStyle = o.colour;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
    }
    else if (o.t === "vignette") {
        const g = ctx.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.35, W / 2, H * 0.45, Math.hypot(W, H) * 0.62);
        g.addColorStop(0, "rgba(0,0,0,0)");
        g.addColorStop(1, `rgba(0,0,0,${o.strength})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
    }
    else if (o.t === "grain") {
        ctx.save();
        ctx.globalCompositeOperation = "overlay";
        ctx.globalAlpha = o.amount;
        ctx.fillStyle = ctx.createPattern(noise(), "repeat");
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
    }
    else if (o.t === "poly" && o.points.length > 2) {
        ctx.save();
        ctx.globalAlpha = o.alpha ?? 1;
        ctx.fillStyle = o.colour;
        ctx.beginPath();
        o.points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }
    else if (o.t === "shade") {
        const g = o.dir === "down" ? ctx.createLinearGradient(0, o.y, 0, o.y + o.h) : ctx.createLinearGradient(o.x, 0, o.x + o.w, 0);
        g.addColorStop(0, rgba(o.colour, o.a0));
        g.addColorStop(1, rgba(o.colour, o.a1));
        ctx.fillStyle = g;
        ctx.fillRect(o.x, o.y, o.w, o.h);
    }
    else if (o.t === "text" && o.lines.length) {
        ctx.font = cssFont(o.font, o.size);
        ctx.letterSpacing = `${(o.font.tracking ?? 0) * o.size}px`;
        ctx.textAlign = o.align;
        ctx.textBaseline = "middle";
        const lh = o.size * o.font.lineHeight;
        if (o.role !== "Quotation mark" && o.role !== "Ghost") {
            // Measure what is behind each line before drawing it.
            const px = [];
            o.lines.forEach((line, i) => { const lw = Math.min(o.w, ctx.measureText(line).width); const lx = o.align === "center" ? o.x + (o.w - lw) / 2 : o.align === "right" ? o.x + o.w - lw : o.x; px.push(...sample(ctx, lx, o.y + i * lh + lh * 0.15, lw, lh * 0.7)); });
            const issue = contrastIssue(o.role, measuredContrast(o.colour, px), isLargeOnPhone(o.size, W, o.font.weight >= 700));
            if (issue && !seen.has(o.role)) {
                seen.add(o.role);
                issues.push(issue);
            }
        }
        ctx.save();
        ctx.fillStyle = o.colour;
        ctx.strokeStyle = o.colour;
        ctx.globalAlpha = o.alpha ?? 1;
        if (o.shadow) {
            ctx.shadowColor = "rgba(0,0,0,0.55)";
            ctx.shadowBlur = o.shadow;
            ctx.shadowOffsetY = o.shadow * 0.25;
        }
        if (o.outline)
            ctx.lineWidth = o.outline;
        // Slanted type leans from its own baseline, so the block stays where the layout put it.
        const paint = (line, x, y) => {
            if (o.skew) {
                ctx.save();
                ctx.translate(x, y);
                ctx.transform(1, 0, Math.tan(o.skew), 1, 0, 0);
                ctx.translate(-x, -y);
            }
            if (o.outline)
                ctx.strokeText(line, x, y);
            else
                ctx.fillText(line, x, y);
            if (o.skew)
                ctx.restore();
        };
        // Lines in capitals are centred on their real cap height (the "middle" baseline sits too high for capitals,
        // which made stacked headlines look crowded); other lines use the font's middle.
        const capH = ctx.measureText("H").actualBoundingBoxAscent;
        o.lines.forEach((line, i) => {
            const x = o.align === "center" ? o.x + o.w / 2 : o.align === "right" ? o.x + o.w : o.x;
            if (o.role !== "Quotation mark" && line === line.toLocaleUpperCase("en-GB") && capH > 0) {
                ctx.textBaseline = "alphabetic";
                paint(line, x, o.y + i * lh + (lh + capH) / 2);
                ctx.textBaseline = "middle";
            }
            else
                paint(line, x, o.y + (i + 0.5) * lh);
        });
        ctx.restore();
    }
}
/** Draw an image covering a box, anchored at the focus point and zoomed (photo and its cut-out use the same framing). */
function drawCover(ctx, img, o) {
    const s = Math.max(o.w / img.naturalWidth, o.h / img.naturalHeight) * o.zoom;
    const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
    ctx.save();
    ctx.beginPath();
    ctx.rect(o.x, o.y, o.w, o.h);
    ctx.clip();
    ctx.filter = o.filter ?? "none";
    ctx.drawImage(img, o.x + (o.w - dw) * o.focusX, o.y + (o.h - dh) * o.focusY, dw, dh);
    ctx.restore();
}
/** A small tile of random grey noise for film grain, made once. */
let noiseTile = null;
export function noise() {
    if (noiseTile)
        return noiseTile;
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const x = c.getContext("2d");
    const im = x.createImageData(256, 256);
    for (let i = 0; i < im.data.length; i += 4) {
        const v = 128 + (Math.random() - 0.5) * 255;
        im.data[i] = im.data[i + 1] = im.data[i + 2] = v;
        im.data[i + 3] = 255;
    }
    x.putImageData(im, 0, 0);
    return (noiseTile = c);
}
// ---------------------------------------------------------------- photos
export function toBase64(bytes) {
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000)
        s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
}
export async function readPhoto(file) {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type))
        throw new Error("Use a PNG, JPEG or WebP photo.");
    if (file.size > 40_000_000)
        throw new Error("That photo is over 40 MB. Use a smaller copy.");
    const src = URL.createObjectURL(file);
    try {
        const img = new Image();
        img.src = src;
        await img.decode();
        const scale = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement("canvas");
        c.width = Math.round(img.naturalWidth * scale);
        c.height = Math.round(img.naturalHeight * scale);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        let url = c.toDataURL("image/jpeg", 0.88);
        if (url.length > MAX_IMAGE_CHARS)
            url = c.toDataURL("image/jpeg", 0.7);
        if (url.length > MAX_IMAGE_CHARS || !IMAGE_DATA_URL.test(url))
            throw new Error("The photo is too large to store.");
        return { url, width: c.width, height: c.height };
    }
    finally {
        URL.revokeObjectURL(src);
    }
}
