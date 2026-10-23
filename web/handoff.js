import { h } from "../extension/dom.js";
import { childrenOf, live, newDraft, newNote, newProject } from "../core/suite/model.js";
import { wordCount } from "../core/suite/drafting.js";
import { app, empty, field, go, persist, projects, section, setStatus, plural } from "./ui.js";
/**
 * Text sent from the Inkling Chrome extension ("Send to Inkling Suite"). The extension puts it in this tab's own
 * session storage (never in the address bar, never through a server) and opens #/handoff; nothing is saved until the
 * writer chooses where it goes.
 */
export const HANDOFF_KEY = "inkling-suite.handoff";
export function readHandoff() {
    try {
        const v = JSON.parse(sessionStorage.getItem(HANDOFF_KEY) ?? "null");
        if (!v || typeof v.text !== "string" || !v.text.trim())
            return null;
        return { text: v.text.slice(0, 200_000), title: typeof v.title === "string" ? v.title.slice(0, 200) : "", url: typeof v.url === "string" && /^https?:\/\//.test(v.url) ? v.url.slice(0, 2000) : "", at: Number(v.at) || Date.now() };
    }
    catch {
        return null;
    }
}
const clearHandoff = () => { try {
    sessionStorage.removeItem(HANDOFF_KEY);
}
catch { /* nothing to clear */ } };
export function handoffPage() {
    const got = readHandoff();
    if (!got)
        return h("div", null, h("h1", null, "From the extension"), empty("Nothing has been sent. In Chrome, select text (or click into the box you are writing in), click the Inkling icon and choose “Send to Inkling Suite”."));
    const ps = projects().sort((a, b) => b.updatedAt - a.updatedAt);
    const project = h("select", { "aria-label": "Project" }, h("option", { value: "" }, "New project…"), ...ps.map((p) => h("option", { value: p.id }, p.title)));
    if (ps.length)
        project.value = ps[0].id;
    const newTitle = h("input", { type: "text", "aria-label": "New project title", placeholder: "Title of the new project", value: got.title });
    const what = h("select", { "aria-label": "What to do with it" }, h("option", { value: "draft" }, "Start a new draft with it"), h("option", { value: "append" }, "Add it to the end of a draft"), h("option", { value: "note" }, "Save it as a note"));
    const headline = h("input", { type: "text", "aria-label": "Draft headline", value: got.title || "Untitled draft" });
    const draftPick = h("select", { "aria-label": "Draft to add to" });
    const newBox = field("New project title", newTitle);
    const headBox = field("Headline", headline);
    const draftBox = field("Draft", draftPick);
    const sync = () => {
        newBox.hidden = !!project.value;
        const ds = project.value ? childrenOf([...app.store.records()], project.value).filter((r) => r.kind === "draft" && live(r)) : [];
        draftPick.replaceChildren(...ds.map((d) => h("option", { value: d.id }, d.title)));
        if (what.value === "append" && !ds.length)
            what.value = "draft";
        what.querySelector('option[value="append"]').disabled = !ds.length;
        headBox.hidden = what.value === "append";
        draftBox.hidden = what.value !== "append";
    };
    project.addEventListener("change", sync);
    what.addEventListener("change", sync);
    sync();
    const save = async () => {
        let p = ps.find((x) => x.id === project.value);
        const made = [];
        if (!p) {
            if (!newTitle.value.trim()) {
                newTitle.focus();
                setStatus("Give the new project a title.", "err");
                return;
            }
            p = newProject({ title: newTitle.value });
            made.push(p);
        }
        const from = got.url ? `\n\n(From ${got.url})` : "";
        if (what.value === "note") {
            const n = newNote(p.id, (got.title || "From the extension").slice(0, 200), got.text + from);
            made.push(n);
            if (await persist(() => app.store.save(...made), "Saved as a note", { rerender: false })) {
                clearHandoff();
                go(`#/note/${n.id}`);
            }
            return;
        }
        if (what.value === "append") {
            const d = app.store.get(draftPick.value);
            if (!d)
                return;
            const next = { ...d, body: d.body.trim() ? `${d.body.replace(/\s+$/, "")}\n\n${got.text.trim()}` : got.text.trim() };
            if (await persist(() => app.store.save(next), "Added to the draft", { rerender: false })) {
                clearHandoff();
                go(`#/draft/${d.id}`);
            }
            return;
        }
        const d = { ...newDraft(p.id, headline.value.trim() || "Untitled draft", "general"), body: got.text.trim() };
        made.push(d);
        if (await persist(() => app.store.save(...made), "Draft created", { rerender: false })) {
            clearHandoff();
            go(`#/draft/${d.id}`);
        }
    };
    const preview = got.text.length > 1200 ? got.text.slice(0, 1200) + "…" : got.text;
    return h("div", null, h("h1", null, "From the extension"), section("What was sent", h("p", { class: "meta" }, `${plural(wordCount(got.text), "word", "words")}`, got.title ? ` · from “${got.title}”` : ""), h("blockquote", { class: "handoff-text" }, preview)), section("Where should it go?", field("Project", project), newBox, field("Do this", what), headBox, draftBox, h("div", { class: "row" }, h("button", { type: "button", class: "primary", onClick: () => void save() }, "Save"), h("button", { type: "button", onClick: () => { clearHandoff(); go("#/"); } }, "Discard"))));
}
