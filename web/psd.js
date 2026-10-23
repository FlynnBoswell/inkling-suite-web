import { layout } from "../core/suite/design.js";
import { brandMark, loadFonts, render, noise } from "./render.js";
// ---------------------------------------------------------------- Photoshop export
let agPsd = null;
/** ag-psd (MIT), served with the app, loaded only when someone exports. */
function loadPsdWriter() {
    agPsd ??= new Promise((resolve, reject) => {
        const sc = document.createElement("script");
        sc.src = "vendor/ag-psd.js";
        sc.onload = () => (window.agPsd ? resolve(window.agPsd) : reject(new Error("The Photoshop writer did not load.")));
        sc.onerror = () => { agPsd = null; reject(new Error("The Photoshop writer could not be loaded. Check the connection and try again.")); };
        document.head.append(sc);
    });
    return agPsd;
}
/**
 * A layered Photoshop file of the design: background and graded photo, accents, ghost word, big letters, the cut-out
 * player, film grain (as an Overlay layer), and each piece of text, shape and logo on its own layer, in the same order
 * as in Pixel. Text comes in as pixels (not editable type), at the platform's exact size.
 */
export async function exportPsd(d, presetId, brand) {
    const ag = await loadPsdWriter();
    await loadFonts();
    const ctx = document.createElement("canvas").getContext("2d");
    const measure = (text, font, ls) => { ctx.font = font; ctx.letterSpacing = `${ls}px`; return ctx.measureText(text).width; };
    const L = layout(d, presetId, measure, brandMark(brand));
    // Group the drawing steps into named layers, keeping their order.
    const groups = [];
    const add = (name, o, merge) => { const last = groups.at(-1); if (merge && last?.name === name)
        last.ops.add(o);
    else
        groups.push({ name, ops: new Set([o]) }); };
    let shapes = 0;
    for (const o of L.ops) {
        if (o.t === "fill" || o.t === "photo" || o.t === "shade" || o.t === "tint" || o.t === "vignette")
            add("Background and photo", o, true);
        else if (o.t === "poly")
            add("Accents", o, true);
        else if (o.t === "letters")
            add("Big letters", o, true);
        else if (o.t === "cutout")
            add("Player cut-out", o, false);
        else if (o.t === "grain")
            groups.push({ name: "Film grain", ops: new Set(), blend: "overlay", opacity: 1, grain: o.amount });
        else if (o.t === "text")
            add(o.role === "Ghost" ? "Ghost word" : `Text: ${o.role}`, o, false);
        else if (o.t === "rect")
            add(`Shape ${++shapes}`, o, false);
        else if (o.t === "image")
            add(o.key === "compLogo" ? "Competition logo" : `Sponsor ${Number(o.key.slice(8)) + 1}`, o, false);
        else if (o.t === "logo")
            add("Brand logo", o, false);
    }
    const children = [];
    for (const g of groups) {
        const c = document.createElement("canvas");
        c.width = L.width;
        c.height = L.height;
        if (g.grain !== undefined) {
            const x = c.getContext("2d");
            x.fillStyle = x.createPattern(noise(), "repeat");
            x.fillRect(0, 0, c.width, c.height);
        }
        else
            await render(c, d, presetId, brand, (o) => g.ops.has(o));
        children.push({ name: g.name, canvas: c, ...(g.blend ? { blendMode: g.blend, opacity: g.grain ?? 1 } : {}) });
    }
    const composite = document.createElement("canvas");
    await render(composite, d, presetId, brand);
    const buf = ag.writePsd({ width: L.width, height: L.height, children, canvas: composite }, { generateThumbnail: true });
    return new Blob([buf], { type: "image/vnd.adobe.photoshop" });
}
