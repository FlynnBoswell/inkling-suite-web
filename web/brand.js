import { h } from "../extension/dom.js";
import { DESIGN_FONTS, IMAGE_DATA_URL, live, LOGO_POSITIONS, MAX_LOGO_CHARS, MAX_SPONSOR_CHARS, newBrand } from "../core/suite/model.js";
import { DISPLAY_FONTS } from "../core/suite/design.js";
import { contrastRatio } from "../core/suite/pixel.js";
import { app, empty, field, go, link, persist, section, setStatus } from "./ui.js";
/** Brand kits: an outlet's (or a club's) colours, font, logo and handle, applied to graphics in Pixel's maker. */
export const brands = () => app.store.records().filter((r) => r.kind === "brand" && live(r)).sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.title.localeCompare(b.title));
export const defaultBrand = () => brands().find((b) => b.isDefault) ?? null;
const POSITION_LABEL = { "top-right": "Top right", "top-left": "Top left", "bottom-right": "Bottom right", none: "Do not show the logo" };
/** The brand kits section on Pixel's home page. */
export function brandsSection() {
    const bs = brands();
    const name = h("input", { type: "text", placeholder: "e.g. Shots Weekly, or Aldershot Town colours", "aria-label": "Brand kit name" });
    return section("Brand kits", h("p", { class: "hint" }, "Save your colours, font, logo and handle once. Pixel's maker applies them, and checks your uploads against them."), bs.length ? h("ul", { class: "items" }, ...bs.map((b) => h("li", null, h("span", { class: "swatches", "aria-hidden": "true" }, ...[b.bg, b.accent, b.text, ...b.palette].map((c) => (() => { const sw = h("span", { class: "swatch" }); sw.style.background = c; return sw; })())), link(`#/brand/${b.id}`, b.title), h("span", { class: "meta" }, [b.isDefault && "default", b.logo && "logo", b.handle].filter(Boolean).join(" · "))))) : empty("No brand kits yet."), h("form", { class: "row", onSubmit: async (e) => {
            e.preventDefault();
            if (!name.value.trim()) {
                name.focus();
                return;
            }
            const b = { ...newBrand(name.value), isDefault: !bs.length };
            if (await persist(() => app.store.save(b), "Brand kit created", { rerender: false }))
                go(`#/brand/${b.id}`);
        } }, name, h("button", { type: "submit" }, "Create brand kit")));
}
async function readLogo(file, maxChars = MAX_LOGO_CHARS) {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type))
        throw new Error("Use a PNG (best, keeps transparency), WebP or JPEG logo.");
    if (file.size > 10_000_000)
        throw new Error("That logo file is over 10 MB. Use a smaller copy.");
    const src = URL.createObjectURL(file);
    try {
        const img = new Image();
        img.src = src;
        await img.decode();
        for (const side of [800, 600, 400]) {
            const scale = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
            const c = document.createElement("canvas");
            c.width = Math.max(1, Math.round(img.naturalWidth * scale));
            c.height = Math.max(1, Math.round(img.naturalHeight * scale));
            c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
            const url = file.type === "image/jpeg" ? c.toDataURL("image/jpeg", 0.9) : c.toDataURL("image/png");
            if (url.length <= maxChars && IMAGE_DATA_URL.test(url))
                return { url, width: c.width, height: c.height };
        }
        throw new Error("The logo is too detailed to store. Use a simpler or smaller file.");
    }
    finally {
        URL.revokeObjectURL(src);
    }
}
export function brandPage(b0) {
    const fresh = () => app.store.get(b0.id);
    const save = (patch, msg = "Brand kit saved") => persist(async () => {
        const saves = [{ ...fresh(), ...patch }];
        // Only one kit is the default.
        if (patch.isDefault)
            for (const o of brands())
                if (o.id !== b0.id && o.isDefault)
                    saves.push({ ...o, isDefault: false });
        await app.store.save(...saves);
    }, msg);
    const title = h("input", { type: "text", value: b0.title, required: true });
    const colour = (v) => h("input", { type: "color", value: v });
    const bg = colour(b0.bg), accent = colour(b0.accent), text = colour(b0.text);
    const palette = [0, 1, 2, 3].map((i) => colour(b0.palette[i] ?? "#000000"));
    const usePalette = [0, 1, 2, 3].map((i) => h("input", { type: "checkbox", checked: i < b0.palette.length, "aria-label": `Use extra colour ${i + 1}` }));
    palette.forEach((p, i) => p.addEventListener("input", () => { usePalette[i].checked = true; }));
    const font = h("select", null, ...DESIGN_FONTS.map((f) => h("option", { value: f, selected: b0.font === f }, DISPLAY_FONTS[f].label)));
    const handle = h("input", { type: "text", value: b0.handle, maxLength: 60, placeholder: "e.g. @shotsweekly or shotsweekly.co.uk" });
    const position = h("select", null, ...LOGO_POSITIONS.map((p) => h("option", { value: p, selected: b0.logoPosition === p }, POSITION_LABEL[p])));
    const isDefault = h("input", { type: "checkbox", checked: b0.isDefault });
    const contrast = h("p", { class: "meta" });
    const showContrast = () => { const r = contrastRatio(text.value, bg.value); contrast.textContent = `Text on background: ${r.toFixed(1)}:1${r < 4.5 ? " (low: small text needs 4.5:1)" : ""}`; };
    for (const el of [bg, text])
        el.addEventListener("input", showContrast);
    showContrast();
    const logoFile = h("input", { type: "file", accept: "image/png,image/webp,image/jpeg", "aria-label": "Choose a logo" });
    const logoBox = h("div", { class: "logo-preview" }, b0.logo ? h("img", { src: b0.logo, alt: `${b0.title} logo` }) : h("p", { class: "hint" }, "No logo."));
    logoFile.addEventListener("change", async () => {
        const f = logoFile.files?.[0];
        if (!f)
            return;
        try {
            const r = await readLogo(f);
            await save({ logo: r.url, logoWidth: r.width, logoHeight: r.height }, "Logo saved");
        }
        catch (e) {
            setStatus(e.message, "err");
        }
    });
    return h("div", null, h("p", { class: "crumbs" }, link("#/tool/pixel", "Pixel"), " / Brand kits"), h("div", { class: "page-head" }, h("h1", null, b0.title), h("button", { class: "danger", type: "button", onClick: async () => { if (!confirm("Move this brand kit to the Trash? Graphics that use it keep their colours but lose the logo."))
            return; if (await persist(() => app.store.trash(b0.id).then(() => true), "Brand kit moved to Trash"))
            go("#/tool/pixel"); } }, "Delete")), h("div", { class: "grid" }, section("Colours, font and handle", h("form", { onSubmit: async (e) => {
            e.preventDefault();
            await save({ title: title.value.trim() || b0.title, bg: bg.value, accent: accent.value, text: text.value, palette: palette.filter((_, i) => usePalette[i].checked).map((p) => p.value),
                font: font.value, handle: handle.value.trim(), logoPosition: position.value, isDefault: isDefault.checked });
        } }, field("Name", title), h("div", { class: "row" }, h("label", { class: "colour" }, bg, " Background"), h("label", { class: "colour" }, accent, " Accent"), h("label", { class: "colour" }, text, " Text")), contrast, h("p", { class: "field-label" }, "Other brand colours (optional)"), h("div", { class: "row" }, ...palette.map((p, i) => h("label", { class: "colour" }, usePalette[i], p))), field("Main font", font), field("Handle or site name", handle, "Shown small on graphics."), field("Logo position", position), h("label", { class: "check" }, isDefault, h("span", null, "Use this kit for new graphics")), h("button", { class: "primary", type: "submit" }, "Save brand kit"))), section("Logo", logoBox, h("div", { class: "row" }, logoFile), b0.logo ? h("button", { type: "button", class: "small", onClick: () => void save({ logo: "", logoWidth: 0, logoHeight: 0 }, "Logo removed") }, "Remove logo") : null, h("p", { class: "hint" }, "A PNG with a transparent background works best. Only use logos you have permission to use; club crests usually need the club's permission. Stored only in this browser."))), sponsorsSection(b0, save));
}
/** Sponsor logos for the strip along the bottom of big-letter matchday graphics. */
function sponsorsSection(b0, save) {
    const list = b0.sponsors;
    const files = h("input", { type: "file", multiple: true, accept: "image/png,image/webp,image/jpeg", "aria-label": "Add sponsor logos" });
    files.addEventListener("change", async () => {
        const add = [];
        for (const f of [...(files.files ?? [])].slice(0, 10 - list.length)) {
            try {
                const r = await readLogo(f, MAX_SPONSOR_CHARS);
                add.push({ logo: r.url, width: r.width, height: r.height, name: f.name.replace(/\.[a-z]+$/i, "") });
            }
            catch (e) {
                setStatus(`${f.name}: ${e.message}`, "err");
            }
        }
        if (add.length)
            await save({ sponsors: [...list, ...add].slice(0, 10) }, `${add.length} sponsor logo(s) added`);
    });
    const move = (i, by) => { const next = [...list]; const [x] = next.splice(i, 1); next.splice(i + by, 0, x); void save({ sponsors: next }, "Order saved"); };
    return section(`Sponsor logos (${list.length}/10)`, list.length ? h("ul", { class: "items sponsors" }, ...list.map((sp, i) => h("li", null, h("img", { src: sp.logo, alt: sp.name || `Sponsor ${i + 1}`, class: "thumb" }), h("span", null, sp.name || `Sponsor ${i + 1}`), h("div", { class: "row" }, i > 0 ? h("button", { type: "button", class: "small", onClick: () => move(i, -1) }, "Move left") : null, h("button", { type: "button", class: "small", onClick: () => void save({ sponsors: list.filter((_, j) => j !== i) }, "Sponsor logo removed") }, "Remove"))))) : h("p", { class: "hint" }, "No sponsor logos yet."), h("div", { class: "row" }, files), h("p", { class: "hint" }, "Shown left to right along the bottom of big-letter matchday graphics. White or light logos with transparent backgrounds look best on photos. Use only logos your club has permission to show."));
}
