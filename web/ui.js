import { h } from "../extension/dom.js";
import { isoDay, live } from "../core/suite/model.js";
/** Shared state and small UI helpers used by every tool's views. */
export const app = {
    store: undefined,
    /** Saves whatever is being typed (set by an editor view, cleared on navigation). */
    flush: null,
    render: () => { },
};
const channel = "BroadcastChannel" in self ? new BroadcastChannel("inkling-suite") : null;
export function onOtherTabChange(fn) { channel?.addEventListener("message", fn); }
export const today = () => isoDay(new Date());
export const fmtDate = (iso) => (iso ? new Date(iso + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "");
export const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" }); };
export const projectOf = (r) => app.store.get(r.projectId);
export const projects = () => app.store.records().filter((r) => r.kind === "project" && live(r));
export function setStatus(text, kind = "ok") {
    const el = document.getElementById("save-status");
    el.textContent = text;
    el.className = "save-status " + kind;
    el.setAttribute("role", kind === "err" ? "alert" : "status");
}
/** Every write goes through here so the writer always sees whether it really saved. */
export async function persist(work, done = "All changes saved", opts = {}) {
    setStatus("Saving…", "busy");
    try {
        const r = await work();
        setStatus(done);
        channel?.postMessage("changed");
        if (opts.rerender !== false)
            app.render(); // refresh the page; autosaves pass rerender:false so typing is never interrupted
        return r;
    }
    catch (e) {
        const full = /quota|storage may be full|QuotaExceeded/i.test(`${e?.name} ${e?.message}`);
        setStatus(full ? "Not saved: this browser's storage is full. Open Settings › Storage and shrink photos, then try again." : "Not saved: " + (e?.message ?? String(e)), "err");
        return undefined;
    }
}
export function go(hash) { if (location.hash === hash)
    app.render();
else
    location.hash = hash; }
export const link = (hash, ...kids) => h("a", { href: hash }, ...kids);
/** A link to an outside web page: new tab, no referrer, no access back to this app. */
export const extLink = (url, text) => h("a", { href: url, target: "_blank", rel: "noopener noreferrer" }, text);
export const section = (title, ...kids) => h("section", { class: "panel" }, h("h2", null, title), ...kids);
export const empty = (text, action) => h("div", { class: "empty" }, h("p", null, text), action ?? null);
export const field = (label, input, hint) => { const id = "f-" + Math.random().toString(36).slice(2, 8); input.id = id; return h("div", { class: "field" }, h("label", { for: id }, label), input, hint ? h("p", { class: "hint" }, hint) : null); };
export const listText = (v) => v.split(",").map((x) => x.trim()).filter(Boolean);
/** Offer text as a file download. */
export function download(name, text, type = "text/plain") {
    const a = h("a", { href: URL.createObjectURL(new Blob([text], { type })), download: name });
    document.body.append(a);
    a.click();
    a.remove();
}
/** "1 source", "2 sources": a number with its noun, singular when it is one. */
export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
