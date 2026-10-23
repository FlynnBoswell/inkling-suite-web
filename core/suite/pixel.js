export const PLATFORM_PRESETS = [
    { id: "ig-portrait", label: "Instagram post, portrait (4:5)", width: 1080, height: 1350, note: "Profile grids crop to the centre; keep key content away from the top and bottom edges." },
    { id: "ig-square", label: "Instagram post, square (1:1)", width: 1080, height: 1080, note: "" },
    { id: "story", label: "Story or reel cover (9:16)", width: 1080, height: 1920, note: "The app's own buttons cover roughly the top 250 px and bottom 340 px; keep text clear of them." },
    { id: "x-feed", label: "X / Twitter in-feed (16:9)", width: 1600, height: 900, note: "" },
    { id: "link-preview", label: "Link preview / Facebook (1.91:1)", width: 1200, height: 630, note: "Used when an article link is shared." },
    { id: "yt-thumb", label: "YouTube thumbnail (16:9)", width: 1280, height: 720, note: "The video length badge covers the bottom-right corner." },
    { id: "article-header", label: "Article header (16:9)", width: 1600, height: 900, note: "Check your own site's header size; this is a common default." },
];
export const presetById = (id) => PLATFORM_PRESETS.find((p) => p.id === id);
export const PURPOSE_LABEL = {
    matchday: "Matchday graphic", "player-announcement": "Player announcement", "interview-thumbnail": "Interview thumbnail",
    "article-header": "Article header image", "quote-card": "Quote card", social: "Social graphic", feature: "Feature illustration or layout",
};
// ----- colour contrast (WCAG 2.x relative luminance) -----
function channel(c) { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }
export function luminance(hex) {
    const n = parseInt(hex.slice(1), 16);
    return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}
export function contrastRatio(a, b) {
    const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
}
/**
 * Prioritised notes for a graphic: problems that will visibly fail first (wrong size, unreadable text),
 * then improvements. `stats` come from the uploaded preview, if any.
 */
export function designNotes(g, quoteText, stats) {
    const out = [];
    const p = presetById(g.preset);
    if (!g.rightsConfirmed)
        out.push({ level: "fix", text: "Confirm you have the right to use every photo, logo and font on this graphic.", how: "Club crests and agency photos usually need permission. Note the photographer for a credit." });
    if (g.purpose === "quote-card") {
        if (!g.quoteId)
            out.push({ level: "fix", text: "Link the saved quote this card uses, so its wording can be checked." });
        else if (quoteText === null)
            out.push({ level: "fix", text: "The linked quote is missing or was corrected. Relink the current version." });
        else if (g.headline.trim() && !g.headline.replace(/[“”"]/g, "").replace(/\s+/g, " ").includes(quoteText.replace(/\s+/g, " ").replace(/[“”"]/g, "").trim()))
            out.push({ level: "fix", text: "The words on the card do not match the saved quote exactly.", how: "Copy the quote from Quill. If you shorten it, use an ellipsis (…) and keep the meaning." });
    }
    const ratio = contrastRatio(g.textColour, g.backgroundColour);
    if (ratio < 3)
        out.push({ level: "fix", text: `Text and background contrast is ${ratio.toFixed(1)}:1. Large text needs at least 3:1, small text 4.5:1.`, how: "Darken the background behind the text (a gradient or a solid band) or change the text colour." });
    else if (ratio < 4.5)
        out.push({ level: "consider", text: `Contrast is ${ratio.toFixed(1)}:1: fine for large headline text, too low for small text such as dates or credits.` });
    else
        out.push({ level: "good", text: `Text contrast is ${ratio.toFixed(1)}:1, comfortably readable.` });
    const words = g.headline.trim().split(/\s+/).filter(Boolean).length;
    if (words > 12 && g.purpose !== "quote-card")
        out.push({ level: "consider", text: `The main text is ${words} words. Social graphics are read in a second or two; aim for about 8 or fewer.` });
    if (g.purpose === "quote-card" && words > 35)
        out.push({ level: "consider", text: "That is a long quote for a card. Choose the strongest sentence." });
    if (g.image && p) {
        const want = p.width / p.height, got = g.imageWidth / g.imageHeight;
        if (Math.abs(want - got) / want > 0.02)
            out.push({ level: "fix", text: `The preview is ${g.imageWidth}×${g.imageHeight} (${got.toFixed(2)}:1) but ${p.label} needs ${p.width}×${p.height} (${want.toFixed(2)}:1). The platform will crop it.`, how: `In Photoshop: Image › Canvas Size, or start again with File › New at ${p.width}×${p.height} px.` });
        else if (g.imageWidth < p.width * 0.9)
            out.push({ level: "fix", text: `The preview is only ${g.imageWidth} px wide; ${p.label} displays at ${p.width} px, so it will look soft.`, how: "Export at the full size. Do not enlarge a small image; start from a bigger original." });
        else
            out.push({ level: "good", text: `Size matches ${p.label}.` });
    }
    if (stats) {
        if (stats.darkClipped > 0.25)
            out.push({ level: "consider", text: `About ${Math.round(stats.darkClipped * 100)}% of the image is near-black. Detail may be lost, especially on phones outdoors.`, how: "Try Image › Adjustments › Levels and move the left (black) slider in slightly, or lift shadows with Camera Raw." });
        if (stats.brightClipped > 0.25)
            out.push({ level: "consider", text: `About ${Math.round(stats.brightClipped * 100)}% of the image is near-white. Highlights may be blown out.`, how: "Pull the highlights down with Camera Raw (Filter › Camera Raw Filter › Highlights)." });
        if (stats.meanSaturation > 0.6)
            out.push({ level: "consider", text: "Colours are very saturated overall. Text may compete with the background.", how: "Add a Hue/Saturation adjustment layer under the text and reduce saturation slightly." });
    }
    if (p?.note)
        out.push({ level: "consider", text: p.note });
    const order = { fix: 0, consider: 1, good: 2 };
    return out.sort((a, b) => order[a.level] - order[b.level]);
}
// ----- Photoshop coaching -----
export function photoshopSteps(g) {
    const p = presetById(g.preset);
    const steps = [
        p ? `File › New: ${p.width} × ${p.height} pixels, 72 pixels/inch, RGB colour, sRGB profile.` : "File › New: set the size your platform needs (pick a preset above).",
        "View › Guides › New Guide Layout: add a margin of about 60 px on every side. Keep all text inside it.",
        "Place the main photo (File › Place Embedded) so you can resize without losing quality. Right-click the layer › Convert to Smart Object if it is not one.",
        "Decide the reading order: one main element (the player, the score or the quote), one supporting line, then small details. Make the main element clearly the biggest.",
        "Add the text with the Type tool. Use at most two typefaces. Set the main line large and bold; keep small text at least about 28 px tall on a 1080 px-wide graphic.",
        `If text sits over the photo, add a layer below it filled with your background colour (${g.backgroundColour}) and use a Gradient (G) or lower its opacity so the text stays readable.`,
        "Align with the Move tool (V): select layers and use the align buttons in the options bar, or snap to your guides.",
        "Check it small: View › Zoom Out until it is the size of a phone feed post. If the main message is not clear at that size, simplify.",
        "Export: File › Export › Export As. JPEG at quality 80-90 for photos, PNG for flat graphics with sharp text. Tick 'Convert to sRGB'.",
    ];
    if (g.purpose === "quote-card")
        steps.splice(4, 0, "Paste the quote exactly as saved in Quill, with curly quotation marks. Credit the speaker underneath in smaller type.");
    if (g.purpose === "matchday")
        steps.splice(4, 0, "Include the essentials only: teams, competition, kick-off time, venue. Check every detail against the official fixture.");
    if (g.purpose === "interview-thumbnail" || g.purpose === "article-header")
        steps.splice(4, 0, "Leave room for the headline or the play button; faces looking into the frame work better than faces looking out of it.");
    return steps;
}
export const CHECKLIST = [
    "Names, dates, scores and kick-off times checked against an official source",
    "Spelling checked (player and club names especially)",
    "Quote matches the saved wording exactly",
    "Readable at phone size",
    "Text kept inside the safe margins",
    "Photo, logo and font rights confirmed; photographer credited if required",
    "Exported at the right size and in sRGB",
    "Alt text written for the post",
];
// ----- brand consistency (measured colours) -----
/**
 * The main colours of an image: pixels are grouped into coarse colour buckets and the biggest groups returned,
 * with the share of the image each covers. `pixels` are RGBA.
 */
export function dominantColours(pixels, max = 6) {
    const buckets = new Map();
    let total = 0;
    for (let i = 0; i + 3 < pixels.length; i += 4) {
        if (pixels[i + 3] < 128)
            continue; // transparent
        const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
        const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
        const e = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
        e.n++;
        e.r += r;
        e.g += g;
        e.b += b;
        buckets.set(key, e);
        total++;
    }
    const hex = (e) => "#" + [e.r, e.g, e.b].map((c) => Math.round(c / e.n).toString(16).padStart(2, "0")).join("");
    return [...buckets.values()].sort((a, b) => b.n - a.n).slice(0, max).map((e) => ({ hex: hex(e), share: e.n / Math.max(1, total) }));
}
/** Distance between two colours, weighted for how the eye sees them (a "redmean" approximation). 0 = identical, ~765 = black v white. */
export function colourDistance(a, b) {
    const p = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
    const [r1, g1, b1] = p(a), [r2, g2, b2] = p(b);
    const rm = (r1 + r2) / 2;
    return Math.sqrt((2 + rm / 256) * (r1 - r2) ** 2 + 4 * (g1 - g2) ** 2 + (2 + (255 - rm) / 256) * (b1 - b2) ** 2);
}
/** Whether a graphic's main colours belong to a brand. Only colours covering at least 4% of the image count. */
export function brandNotes(brand, colours) {
    const brandCols = [brand.bg, brand.accent, brand.text, ...brand.palette];
    const main = colours.filter((c) => c.share >= 0.04);
    const near = (c) => brandCols.some((b) => colourDistance(b, c) < 90);
    const neutral = (c) => { const n = parseInt(c.slice(1), 16); const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255; return Math.max(r, g, b) - Math.min(r, g, b) < 24; };
    const off = main.filter((c) => !near(c.hex) && !neutral(c.hex));
    const out = [];
    if (!main.some((c) => colourDistance(c.hex, brand.accent) < 90))
        out.push({ level: "consider", text: `${brand.title}'s accent colour (${brand.accent}) does not appear as a main colour. Using it for a label or the key word helps people recognise your graphics.` });
    const offShare = off.reduce((s, c) => s + c.share, 0);
    if (offShare > 0.25)
        out.push({ level: "consider", text: `About ${Math.round(offShare * 100)}% of the graphic is in colours outside ${brand.title}'s kit (${off.slice(0, 3).map((c) => c.hex).join(", ")}). Fine for a photo; for flat backgrounds, use the kit's colours.` });
    if (!out.length)
        out.push({ level: "good", text: `Colours match ${brand.title}'s brand kit.` });
    return out;
}
/**
 * Estimated contrast of text inside a box the writer draws over it. The pixels are split into light and dark
 * groups (Otsu's method); the colour of each group is taken from its clearest half, so the soft edges of letters
 * do not drag the estimate down. Returns null when the box holds only one colour.
 */
export function regionContrast(pixels) {
    const lum = [];
    const rgb = [];
    for (let i = 0; i + 3 < pixels.length; i += 4) {
        const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
        rgb.push([r, g, b]);
        lum.push(Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b));
    }
    const n = lum.length;
    if (n < 20)
        return null;
    const hist = new Array(256).fill(0);
    for (const l of lum)
        hist[l]++;
    let sum = 0;
    for (let t = 0; t < 256; t++)
        sum += t * hist[t];
    let sumB = 0, wB = 0, best = -1, threshold = 127;
    for (let t = 0; t < 256; t++) {
        wB += hist[t];
        if (!wB)
            continue;
        const wF = n - wB;
        if (!wF)
            break;
        sumB += t * hist[t];
        const between = wB * wF * (sumB / wB - (sum - sumB) / wF) ** 2;
        if (between > best) {
            best = between;
            threshold = t;
        }
    }
    const dark = lum.map((l, i) => [l, i]).filter(([l]) => l <= threshold), light = lum.map((l, i) => [l, i]).filter(([l]) => l > threshold);
    if (dark.length < n * 0.03 || light.length < n * 0.03)
        return null;
    const core = (group, away) => {
        const sorted = [...group].sort((a, b) => (a[0] - b[0]) * away);
        const keep = sorted.slice(Math.floor(sorted.length / 2));
        const m = [0, 1, 2].map((k) => Math.round(keep.reduce((s, [, i]) => s + rgb[i][k], 0) / keep.length));
        return "#" + m.map((c) => c.toString(16).padStart(2, "0")).join("");
    };
    const lightHex = core(light, 1), darkHex = core(dark, -1);
    return { ratio: contrastRatio(lightHex, darkHex), light: lightHex, dark: darkHex };
}
