import { h } from "../extension/dom.js";
import { childrenOf, GRAPHIC_PURPOSES, IMAGE_DATA_URL, live, MAX_IMAGE_CHARS, newGraphic, newPost } from "../core/suite/model.js";
import { safeArea } from "../core/suite/design.js";
import { brandNotes, regionContrast, CHECKLIST, contrastRatio, designNotes, dominantColours, photoshopSteps, PLATFORM_PRESETS, presetById, PURPOSE_LABEL } from "../core/suite/pixel.js";
import { brandsSection, defaultBrand } from "./brand.js";
import { bulkMatchday } from "./bulk.js";
import { storageWarning } from "./storage.js";
import { app, empty, field, go, link, persist, projects, section, setStatus, plural } from "./ui.js";
import { ai, aiBox, runAi } from "./ai.js";
import { blueskyAccount } from "./bluesky.js";
import { graphicTextChecks } from "../core/suite/graphictext.js";
import { dict, loadDictionary } from "./dictionary.js";
/**
 * Pixel: design coaching for football graphics. It measures what can be measured (size, contrast, exposure)
 * and coaches the rest; it does not open or edit Photoshop files. Uploaded previews stay on this device.
 */
const graphicsOf = (p) => childrenOf([...app.store.records()], p.id).filter((r) => r.kind === "graphic" && live(r)).sort((a, b) => b.updatedAt - a.updatedAt);
export function pixelHome() {
    const ps = projects().sort((a, b) => b.updatedAt - a.updatedAt);
    return h("div", null, storageWarning(), h("h1", null, "Pixel"), h("p", { class: "lead" }, "Make matchday graphics, results, announcements, quote cards and headers at each platform's exact size, filled from your project's quotes, fixtures and drafts. Or upload a Photoshop export for measured feedback and step-by-step Photoshop instructions."), ps.length ? section("Choose a project", h("ul", { class: "items" }, ...ps.map((p) => h("li", null, link(`#/graphics/${p.id}`, p.title), h("span", { class: "meta" }, `${plural(graphicsOf(p).length, "graphic", "graphics")}`)))))
        : empty("Create a project first.", h("button", { class: "primary", type: "button", onClick: () => go("#/project/new") }, "Create a project")), brandsSection(), section("What Pixel cannot do", h("p", null, "It cannot open .psd files or control Photoshop. Its checks are measurements (size, contrast, brightness) of the graphic itself; the optional AI review is a second opinion, not a measurement. It cannot check that names, dates or scores are right: check those against an official source.")));
}
export function graphicsProject(p) {
    const gs = graphicsOf(p);
    const title = h("input", { type: "text", placeholder: "e.g. Matchday: Shots v Woking", "aria-label": "Graphic name" });
    const purpose = h("select", { "aria-label": "What is it for?" }, ...GRAPHIC_PURPOSES.map((x) => h("option", { value: x }, PURPOSE_LABEL[x])));
    const preset = h("select", { "aria-label": "Where will it appear?" }, ...PLATFORM_PRESETS.map((x) => h("option", { value: x.id }, x.label)));
    return h("div", null, h("p", { class: "crumbs" }, link("#/tool/pixel", "Pixel"), " / ", link(`#/project/${p.id}`, p.title)), h("h1", null, `Graphics: ${p.title}`), section("Plan a graphic", h("form", { class: "row", onSubmit: async (e) => {
            e.preventDefault();
            if (!title.value.trim()) {
                title.focus();
                return;
            }
            const s = await persist(() => app.store.save(newGraphic(p.id, title.value, purpose.value, preset.value)), "Graphic created");
            if (s)
                go(`#/graphic/${s[0].id}`);
        } }, title, purpose, preset, h("button", { class: "primary", type: "submit" }, "Create"))), bulkMatchday(p), section(`Graphics (${gs.length})`, gs.length ? h("ul", { class: "items" }, ...gs.map((g) => h("li", null, link(`#/graphic/${g.id}`, g.title), h("span", { class: "meta" }, `${PURPOSE_LABEL[g.purpose]} · ${presetById(g.preset)?.label ?? "no size"} · ${g.status}`)))) : empty("No graphics yet.")));
}
/** Brightness and colour statistics from the preview, sampled on a small canvas. */
function measure(img) {
    const c = document.createElement("canvas");
    const scale = Math.min(1, 200 / Math.max(img.naturalWidth, img.naturalHeight));
    c.width = Math.max(1, Math.round(img.naturalWidth * scale));
    c.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let lum = 0, dark = 0, bright = 0, sat = 0;
    const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) {
        const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
        const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        lum += L;
        if (L < 0.04)
            dark++;
        if (L > 0.96)
            bright++;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        sat += mx === 0 ? 0 : (mx - mn) / mx;
    }
    return { meanLuminance: lum / n, darkClipped: dark / n, brightClipped: bright / n, meanSaturation: sat / n, colours: dominantColours(d) };
}
/** Downscale an uploaded file to a preview (longest side 1600 px) and keep its real dimensions. */
async function readPreview(file) {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type))
        throw new Error("Use a PNG, JPEG or WebP export.");
    if (file.size > 25_000_000)
        throw new Error("That file is over 25 MB. Export a smaller preview.");
    const src = URL.createObjectURL(file);
    try {
        const img = new Image();
        img.src = src;
        await img.decode();
        const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement("canvas");
        c.width = Math.round(img.naturalWidth * scale);
        c.height = Math.round(img.naturalHeight * scale);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        let url = c.toDataURL("image/jpeg", 0.85);
        if (url.length > MAX_IMAGE_CHARS)
            url = c.toDataURL("image/jpeg", 0.6);
        if (url.length > MAX_IMAGE_CHARS || !IMAGE_DATA_URL.test(url))
            throw new Error("The preview is too large to store.");
        return { url, width: img.naturalWidth, height: img.naturalHeight };
    }
    finally {
        URL.revokeObjectURL(src);
    }
}
/**
 * Read the words on an uploaded graphic (free text recognition on this laptop) and check their spelling and names,
 * like graphics made in Pixel. Two versions are read, the second with light and dark swapped, because the reader
 * works best on dark text on a light background.
 */
function readText(g, p, speakers) {
    const out = h("div");
    const btn = h("button", { type: "button" }, "Read and check the words on it");
    btn.addEventListener("click", () => {
        const cur = app.store.get(g.id);
        if (!cur.image) {
            out.replaceChildren(h("p", { class: "status err" }, "Upload a preview of your export first."));
            return;
        }
        void runAi(btn, out, async () => {
            const img = new Image();
            img.src = cur.image;
            await img.decode();
            const scale = Math.max(1, Math.min(3, 2000 / img.naturalWidth));
            const versions = [false, true].map((invert) => {
                const c = document.createElement("canvas");
                c.width = Math.round(img.naturalWidth * scale);
                c.height = Math.round(img.naturalHeight * scale);
                const x = c.getContext("2d");
                x.filter = `grayscale(1) contrast(1.4)${invert ? " invert(1)" : ""}`;
                x.drawImage(img, 0, 0, c.width, c.height);
                return c.toDataURL("image/jpeg", 0.92);
            });
            await loadDictionary();
            return ai("/v1/pixel/read", { images: versions });
        }, (r) => {
            const names = [...p.people, ...p.clubs, ...speakers].filter(Boolean);
            const issues = graphicTextChecks(r.lines.map((l, i) => ({ label: `Line ${i + 1}`, text: l.text, quote: latest().purpose === "quote-card" })), { names, lexicon: dict.lexicon, common: dict.common });
            return h("div", { class: "data-box" }, h("h3", null, "Words found on the graphic"), r.lines.length ? h("ol", null, ...r.lines.map((l) => h("li", null, l.text, h("span", { class: "meta" }, ` (${l.confidence}% sure)`)))) : h("p", null, "No words could be read. Very stylised lettering, outlined text or text over busy photos is hard to read automatically."), r.lines.length ? (issues.length ? h("ol", { class: "design-notes" }, ...issues.map((i) => h("li", { class: i.level }, h("strong", null, i.level === "fix" ? "Check: " : "Consider: "), i.text))) : h("p", { class: "status ok" }, "No spelling or name problems in the words that were read.")) : null, h("p", { class: "hint" }, "Text recognition can misread words, especially small or decorative ones. Treat these as prompts to look again, and check names, dates and scores yourself."));
        });
    });
    const latest = () => app.store.get(g.id);
    return h("div", { class: "ai-inline" }, h("p", { class: "hint" }, "Reads the words on your uploaded graphic on this laptop (needs Start Inkling) and checks spelling and names."), btn, out);
}
/** A designer's eye on the uploaded preview (AI vision). It looks at the image only; it cannot open the .psd. */
const reviewBody = (r) => [
    h("p", null, r.summary),
    h("ol", { class: "design-notes" }, ...r.priorities.map((x) => h("li", { class: x.level }, h("strong", null, x.level === "fix" ? "Fix: " : "Consider: "), x.issue, h("span", { class: "how" }, x.how)))),
    r.strengths.length ? h("div", null, h("h4", null, "Working well"), h("ul", null, ...r.strengths.map((s) => h("li", null, s)))) : null,
    r.photoshop.length ? h("div", null, h("h4", null, "In Photoshop"), h("ol", { class: "steps" }, ...r.photoshop.map((s) => h("li", null, s)))) : null,
];
const when = (t) => new Date(t).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
/** A designer's eye on the uploaded preview (AI vision). Each review is kept, so versions can be compared. */
function aiReview(g) {
    const out = h("div");
    const btn = h("button", { type: "button" }, "AI design review");
    const history = (gr) => gr.reviews.length ? h("details", { class: "reviews" }, h("summary", null, `Saved reviews (${gr.reviews.length})`), ...[...gr.reviews].reverse().map((r) => h("div", { class: "review" }, h("h4", null, `Review of ${when(r.at)}`), ...reviewBody(r)))) : null;
    const hist = h("div", null, history(g));
    btn.addEventListener("click", () => {
        const cur = app.store.get(g.id);
        if (!cur.image) {
            out.replaceChildren(h("p", { class: "status err" }, "Upload a preview of your export first."));
            return;
        }
        void runAi(btn, out, async () => {
            const r = await ai("/v1/pixel/review", { image: cur.image, purpose: PURPOSE_LABEL[cur.purpose], platform: presetById(cur.preset)?.label ?? "", brief: [cur.brief, cur.headline && `Main text: ${cur.headline}`].filter(Boolean).join("\n") });
            const latest = app.store.get(g.id);
            const saved = { ...latest, reviews: [...latest.reviews, { at: Date.now(), summary: r.summary, priorities: r.priorities, strengths: r.strengths, photoshop: r.photoshop }].slice(-10) };
            await persist(() => app.store.save(saved), "Review saved", { rerender: false });
            hist.replaceChildren(history(saved) ?? "");
            return r;
        }, (r) => aiBox("Design review", ...reviewBody(r)));
    });
    return h("div", { class: "ai-inline" }, h("p", { class: "hint" }, "Sends the uploaded preview to your Inkling AI server for a designer’s critique. Reviews are saved with the graphic."), btn, out, hist);
}
export function graphicPage(g) {
    const p = app.store.get(g.projectId);
    if (!p)
        return empty("This graphic's project is missing.");
    const fresh = () => app.store.get(g.id);
    const quotes = childrenOf([...app.store.records()], p.id).filter((r) => r.kind === "quote" && live(r) && !r.supersededBy);
    const linkedQuote = g.quoteId ? app.store.get(g.quoteId) : undefined;
    const quoteText = g.quoteId ? (linkedQuote && live(linkedQuote) && !linkedQuote.supersededBy ? linkedQuote.title : null) : null;
    const title = h("input", { type: "text", value: g.title });
    const purpose = h("select", null, ...GRAPHIC_PURPOSES.map((x) => h("option", { value: x, selected: g.purpose === x }, PURPOSE_LABEL[x])));
    const preset = h("select", null, ...PLATFORM_PRESETS.map((x) => h("option", { value: x.id, selected: g.preset === x.id }, `${x.label}: ${x.width}×${x.height}`)));
    const status = h("select", null, ...[["planning", "Planning"], ["in-progress", "In progress"], ["done", "Done"]].map(([v, l]) => h("option", { value: v, selected: g.status === v }, l)));
    const headline = h("textarea", { rows: 2, value: g.headline });
    const quote = h("select", null, h("option", { value: "" }, quotes.length ? "No quote" : "No saved quotes in this project"), ...quotes.map((q) => h("option", { value: q.id, selected: g.quoteId === q.id }, `${q.speaker}: “${q.title.slice(0, 60)}${q.title.length > 60 ? "…" : ""}”`)));
    const textColour = h("input", { type: "color", value: g.textColour });
    const bgColour = h("input", { type: "color", value: g.backgroundColour });
    const ratio = h("span", { class: "meta" });
    const showRatio = () => { ratio.textContent = `Contrast ${contrastRatio(textColour.value, bgColour.value).toFixed(1)}:1`; };
    showRatio();
    textColour.addEventListener("input", showRatio);
    bgColour.addEventListener("input", showRatio);
    const brief = h("textarea", { rows: 3, value: g.brief });
    const alt = h("textarea", { rows: 3, value: g.altText || g.design?.altText || "", maxLength: 2000 });
    const rights = h("input", { type: "checkbox", checked: g.rightsConfirmed });
    const form = h("form", { onSubmit: async (e) => {
            e.preventDefault();
            await persist(() => app.store.save({ ...fresh(), title: title.value.trim() || g.title, purpose: purpose.value, preset: preset.value, status: status.value, headline: headline.value, quoteId: quote.value, textColour: textColour.value, backgroundColour: bgColour.value, brief: brief.value, altText: alt.value.trim(), design: fresh().design ? { ...fresh().design, altText: alt.value.trim() } : null, rightsConfirmed: rights.checked }), "Graphic saved");
        } }, h("div", { class: "grid tight" }, field("Name", title), field("What is it for?", purpose), field("Where will it appear?", preset), field("Status", status)), field("Main text on the graphic", headline, "For quote cards, paste the quote exactly."), field("Saved quote used", quote), h("div", { class: "row" }, h("label", { class: "colour" }, textColour, " Text colour"), h("label", { class: "colour" }, bgColour, " Background behind text"), ratio), field("Brief", brief, "What the graphic must say and who it is for."), field("Alt text", alt, "Posted with the image so people using screen readers know what it says. Include every piece of text on the graphic."), h("label", { class: "check" }, rights, h("span", null, "I have the right to use every photo, logo and font on it")), h("button", { class: "primary", type: "submit" }, "Save and re-check"));
    // --- preview with safe-margin overlay and measured stats
    const fileInput = h("input", { type: "file", accept: "image/png,image/jpeg,image/webp", "aria-label": "Upload a preview of your export" });
    const notesBox = h("div");
    const kit = ((g.design?.brandId ? app.store.get(g.design.brandId) : undefined) ?? defaultBrand());
    let lastStats;
    const drawNotes = (stats) => {
        lastStats = stats ?? lastStats;
        stats = lastStats;
        const names = [...p.people, ...p.clubs, ...quotes.map((q) => q.speaker)].filter(Boolean);
        const words = fresh().design ? [] : graphicTextChecks([{ label: "Main text", text: fresh().headline, quote: fresh().purpose === "quote-card" }], { names, lexicon: dict.lexicon, common: dict.common }).map((t) => ({ level: t.level, text: t.text }));
        const notes = [...designNotes(fresh(), quoteText, stats), ...words, ...(stats && kit && live(kit) ? brandNotes(kit, stats.colours) : [])].sort((a, b) => ["fix", "consider", "good"].indexOf(a.level) - ["fix", "consider", "good"].indexOf(b.level));
        notesBox.replaceChildren(h("ol", { class: "design-notes" }, ...notes.map((n) => h("li", { class: n.level }, h("strong", null, n.level === "fix" ? "Fix: " : n.level === "consider" ? "Consider: " : "Good: "), n.text, n.how ? h("span", { class: "how" }, n.how) : null))));
    };
    const previewBox = h("div", { class: "preview" });
    if (g.image) {
        const img = h("img", { src: g.image, alt: `Preview of ${g.title}` });
        const pr = presetById(g.preset);
        const overlay = h("div", { class: "safe-zone", "aria-hidden": "true" });
        // The platform's safe area (including the parts its own buttons cover), as a share of the image.
        if (pr) {
            const S = safeArea(pr.id, pr.width, pr.height);
            overlay.style.inset = `${S.y / pr.height * 100}% ${(pr.width - S.x - S.w) / pr.width * 100}% ${(pr.height - S.y - S.h) / pr.height * 100}% ${S.x / pr.width * 100}%`;
        }
        // Draw a box over some text to measure its contrast from the pixels.
        const box = h("div", { class: "measure-box", hidden: true, "aria-hidden": "true" });
        const measured = h("p", { class: "hint", "aria-live": "polite" }, "To check a piece of text, drag a box over it on the preview.");
        const frame = h("div", { class: "frame measurable" }, img, overlay, box);
        let start = null;
        const at = (e) => { const r = img.getBoundingClientRect(); return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) }; };
        const place = (a, b) => { Object.assign(box.style, { left: `${Math.min(a.x, b.x) * 100}%`, top: `${Math.min(a.y, b.y) * 100}%`, width: `${Math.abs(a.x - b.x) * 100}%`, height: `${Math.abs(a.y - b.y) * 100}%` }); box.hidden = false; };
        frame.addEventListener("pointerdown", (e) => { e.preventDefault(); start = at(e); frame.setPointerCapture(e.pointerId); place(start, start); });
        frame.addEventListener("pointermove", (e) => { if (start)
            place(start, at(e)); });
        frame.addEventListener("pointerup", (e) => {
            if (!start)
                return;
            const end = at(e);
            const a0 = start;
            start = null;
            const x = Math.min(a0.x, end.x) * img.naturalWidth, y = Math.min(a0.y, end.y) * img.naturalHeight, w = Math.abs(a0.x - end.x) * img.naturalWidth, hh = Math.abs(a0.y - end.y) * img.naturalHeight;
            if (w < 4 || hh < 4) {
                box.hidden = true;
                return;
            }
            const c = document.createElement("canvas");
            c.width = Math.round(w);
            c.height = Math.round(hh);
            const ctx = c.getContext("2d");
            ctx.drawImage(img, x, y, w, hh, 0, 0, c.width, c.height);
            const r = regionContrast(ctx.getImageData(0, 0, c.width, c.height).data);
            measured.replaceChildren(r ? h("span", { class: r.ratio >= 4.5 ? "status ok" : r.ratio >= 3 ? "status warn" : "status err" }, `Text in the box: about ${r.ratio.toFixed(1)}:1 (${r.light} on ${r.dark}). ${r.ratio >= 4.5 ? "Readable at any size." : r.ratio >= 3 ? "Fine for large headline text, too low for small text (needs 4.5:1)." : "Too low even for large text (needs 3:1)."}`)
                : h("span", null, "The box holds only one colour. Draw it over some letters and the background around them."));
        });
        const phone = h("button", { type: "button", class: "small", "aria-pressed": "false", onClick: () => { const on = frame.classList.toggle("phone"); phone.setAttribute("aria-pressed", String(on)); phone.textContent = on ? "Full size view" : "See it at phone size"; } }, "See it at phone size");
        previewBox.replaceChildren(frame, h("p", { class: "hint" }, `Your export: ${g.imageWidth}×${g.imageHeight} px. The dashed box is ${pr ? `${pr.label}'s safe area` : "a safe margin"}: keep text inside it.`), measured, h("div", { class: "row" }, phone, h("button", { type: "button", class: "small", onClick: () => void persist(() => app.store.save({ ...fresh(), image: "", imageWidth: 0, imageHeight: 0 }), "Preview removed") }, "Remove preview")));
        img.decode().then(() => drawNotes(measure(img))).catch(() => drawNotes());
    }
    else
        drawNotes();
    void loadDictionary().then(() => drawNotes());
    return h("div", null, h("p", { class: "crumbs" }, link("#/tool/pixel", "Pixel"), " / ", link(`#/graphics/${p.id}`, p.title)), h("div", { class: "page-head" }, h("h1", null, g.title), h("div", { class: "row" }, h("button", { type: "button", onClick: async () => {
            // A fresh copy to reuse (e.g. next week's matchday): same design and settings, no reviews, ticks or preview history.
            const cur = fresh();
            const copy = { ...newGraphic(cur.projectId, `${cur.title} (copy)`, cur.purpose, cur.preset), headline: cur.headline, quoteId: cur.quoteId, textColour: cur.textColour, backgroundColour: cur.backgroundColour, brief: cur.brief, design: cur.design ? { ...cur.design } : null, altText: cur.altText, rightsConfirmed: cur.rightsConfirmed };
            if (await persist(() => app.store.save(copy), "Graphic duplicated", { rerender: false }))
                go(copy.design ? `#/make/${copy.id}` : `#/graphic/${copy.id}`);
        } }, "Duplicate"), h("button", { class: "danger", type: "button", onClick: async () => { if (!confirm("Move this graphic to the Trash?"))
            return; if (await persist(() => app.store.trash(g.id).then(() => true), "Graphic moved to Trash"))
            go(`#/graphics/${p.id}`); } }, "Delete"))), section("Make it in Pixel", h("p", null, g.design ? "This graphic has a design in Pixel's maker." : "Build this graphic here from a template, at the exact size, using this project's quotes, fixtures and drafts. No Photoshop needed."), h("button", { class: "primary", type: "button", onClick: () => go(`#/make/${g.id}`) }, g.design ? "Open the graphic maker" : "Make it in Pixel"), g.image ? h("button", { type: "button", onClick: async () => {
            const post = newPost(p.id, blueskyAccount() ? "bluesky" : "x", g.headline.trim(), { title: `Graphic: ${g.title}`.slice(0, 60), format: "graphic", graphicId: g.id });
            if (await persist(() => app.store.save(post), "Post drafted with this graphic", { rerender: false }))
                go(`#/post/${post.id}`);
        } }, "Post it with Ripple") : null), h("div", { class: "grid" }, section("Feedback, most important first", notesBox, readText(g, p, quotes.map((q) => q.speaker)), aiReview(g)), section("Preview", previewBox, h("div", { class: "row" }, fileInput, h("button", { type: "button", onClick: async () => {
            const f = fileInput.files?.[0];
            if (!f) {
                setStatus("Choose your exported image first.", "err");
                return;
            }
            try {
                const r = await readPreview(f);
                await persist(() => app.store.save({ ...fresh(), image: r.url, imageWidth: r.width, imageHeight: r.height }), "Preview saved");
            }
            catch (e) {
                setStatus(e.message, "err");
            }
        } }, "Upload preview")), h("p", { class: "hint" }, "Made it in Photoshop? Export it (File › Export › Export As) and upload it here. Made it in Pixel? Use “Check it in Pixel” in the maker. It is stored only in this browser."))), section("Brief and details", form), h("div", { class: "grid" }, section("Photoshop: step by step", h("ol", { class: "steps" }, ...photoshopSteps(fresh()).map((s) => h("li", null, s)))), section("Before you publish", h("ul", { class: "items checklist" }, ...CHECKLIST.map((item) => {
        const box = h("input", { type: "checkbox", checked: g.checklist.includes(item), onChange: () => { const cur = fresh(); void persist(() => app.store.save({ ...cur, checklist: box.checked ? [...new Set([...cur.checklist, item])] : cur.checklist.filter((x) => x !== item) }), "Checklist saved", { rerender: false }); } });
        return h("li", null, h("label", { class: "check" }, box, h("span", null, item)));
    })))));
}
