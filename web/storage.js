import { h } from "../extension/dom.js";
import { IMAGE_DATA_URL } from "../core/suite/model.js";
import { app, persist, section, setStatus } from "./ui.js";
/**
 * Storage: everything lives in this browser, and photos (with their cut-outs) are by far the biggest part.
 * This shows how full it is, warns before it fills up, and can shrink stored photos to free space.
 */
const MB = 1024 * 1024;
const fmt = (b) => (b >= 1024 * MB ? `${(b / 1024 / MB).toFixed(1)} GB` : `${Math.max(0.1, b / MB).toFixed(1)} MB`);
/** Approximate bytes used by images in the Suite's records (data URLs are stored as text). */
export function imageBytes() {
    let graphics = 0, brands = 0;
    for (const r of app.store.records()) {
        if (r.kind === "graphic") {
            const d = r.design;
            graphics += r.image.length + (d ? d.photo.length + d.cutout.length + d.letterFill.length + d.compLogo.length : 0);
        }
        if (r.kind === "brand")
            brands += r.logo.length + r.sponsors.reduce((t, s) => t + s.logo.length, 0);
    }
    return { graphics: graphics * 2, brands: brands * 2, total: (graphics + brands) * 2 }; // the browser keeps text as UTF-16
}
export async function storageEstimate() {
    try {
        const est = await navigator.storage?.estimate?.();
        const persisted = !!(await navigator.storage?.persisted?.());
        if (!est?.quota)
            return null;
        return { usage: est.usage ?? 0, quota: est.quota, share: (est.usage ?? 0) / est.quota, persisted };
    }
    catch {
        return null;
    }
}
/** Ask once, quietly, for the browser to keep this data when space is low (no prompt in Chrome). */
export function askToKeepData() { void navigator.storage?.persist?.().catch(() => false); }
async function reencode(url, maxSide, type, quality) {
    if (!url || !IMAGE_DATA_URL.test(url))
        return { url, scale: 1 };
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.naturalWidth * scale));
    c.height = Math.max(1, Math.round(img.naturalHeight * scale));
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    const out = c.toDataURL(type, quality);
    return out.length < url.length ? { url: out, scale } : { url, scale: 1 };
}
/**
 * Shrink the photos stored with graphics: design photos to 1400 px (the largest export is 1920 px tall, so this is
 * still sharp for most sizes), cut-outs to match, previews to 1200 px. `onlyFinished` limits it to graphics marked done.
 */
export async function shrinkPhotos(onlyFinished) {
    const before = imageBytes().graphics;
    const changed = [];
    for (const g of app.store.records().filter((r) => r.kind === "graphic" && !r.deletedAt && (!onlyFinished || r.status === "done"))) {
        let next = g;
        if (g.design?.photo) {
            const p = await reencode(g.design.photo, 1400, "image/jpeg", 0.82);
            if (p.url !== g.design.photo) {
                // The cut-out must keep exactly the photo's proportions so it still lines up.
                const c = g.design.cutout ? await reencode(g.design.cutout, Math.round(Math.max(g.design.photoWidth, g.design.photoHeight) * p.scale), "image/webp", 0.82) : { url: "", scale: 1 };
                next = { ...next, design: { ...g.design, photo: p.url, photoWidth: Math.round(g.design.photoWidth * p.scale), photoHeight: Math.round(g.design.photoHeight * p.scale), cutout: c.url } };
            }
        }
        if (g.image) {
            const p = await reencode(g.image, 1200, "image/jpeg", 0.78);
            if (p.url !== g.image)
                next = { ...next, image: p.url };
        } // imageWidth/Height stay the export's real size
        if (next !== g)
            changed.push(next);
    }
    if (changed.length)
        await persist(() => app.store.save(...changed), `Shrank photos in ${changed.length} graphics`, { rerender: false });
    return { graphics: changed.length, saved: Math.max(0, before - imageBytes().graphics) };
}
/** A warning when storage is getting full, with what to do. Empty when all is well. */
export function storageWarning() {
    const box = h("div");
    void storageEstimate().then((e) => {
        if (!e || e.share < 0.7)
            return;
        box.replaceChildren(section("Storage is getting full", h("p", null, `This browser is using ${fmt(e.usage)} of about ${fmt(e.quota)} (${Math.round(e.share * 100)}%). If it fills up, new work cannot be saved. Shrink stored photos or export a backup and delete old projects.`), h("a", { href: "#/settings", class: "button primary" }, "Open storage settings")));
        box.firstElementChild?.classList.add("warn");
    });
    return box;
}
/** Settings › Storage: the meter, what takes the space, and the shrink buttons. */
export function storageSection() {
    const meter = h("div", { class: "meter", role: "img", "aria-label": "Storage used" }, h("span"));
    const info = h("p", { class: "hint" }, "Checking storage…");
    const out = h("p", { "aria-live": "polite" });
    const refresh = async () => {
        const e = await storageEstimate();
        const im = imageBytes();
        if (e) {
            meter.firstElementChild.style.width = `${Math.min(100, Math.max(1, e.share * 100))}%`;
            meter.classList.toggle("high", e.share >= 0.7);
            meter.setAttribute("aria-label", `Storage ${Math.round(e.share * 100)}% used`);
        }
        info.textContent = `${e ? `Using ${fmt(e.usage)} of about ${fmt(e.quota)} (${Math.round(e.share * 100)}%). ` : ""}Photos in graphics take about ${fmt(im.graphics)}; brand kit logos about ${fmt(im.brands)}. ${e?.persisted ? "The browser has agreed to keep this data when space is low." : "The browser may clear this data if the device runs short of space: keep exports as backups."}`;
    };
    const shrink = (only) => async (ev) => {
        const b = ev.target;
        b.disabled = true;
        out.textContent = "Shrinking photos…";
        try {
            const r = await shrinkPhotos(only);
            out.textContent = r.graphics ? `Shrank photos in ${r.graphics} graphics and freed about ${fmt(r.saved)}.` : "Nothing to shrink: the photos are already small.";
        }
        catch {
            setStatus("Could not shrink the photos.", "err");
            out.textContent = "";
        }
        finally {
            b.disabled = false;
            void refresh();
        }
    };
    void refresh();
    return section("Storage", meter, info, h("div", { class: "row" }, h("button", { type: "button", onClick: shrink(true) }, "Shrink photos in finished graphics"), h("button", { type: "button", onClick: shrink(false) }, "Shrink all photos")), out, h("p", { class: "hint" }, "Shrinking keeps every graphic usable and exports stay sharp for most sizes; very large photos lose some detail. It cannot be undone, so export a backup first if you are unsure."));
}
export const isQuotaError = (e) => /quota|storage may be full|QuotaExceeded/i.test(String(e?.name) + " " + String(e?.message));
