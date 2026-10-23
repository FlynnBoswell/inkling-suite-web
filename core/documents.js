import { WRITING_MODES } from "./types.js";
export const MAX_DOCS = 200;
export const MAX_DOC_CHARS = 100_000;
export const emptyDocStore = () => ({ schema: 1, docs: [], templates: [] });
const MODES = WRITING_MODES.map((m) => m.id);
const isMode = (m) => MODES.includes(m);
export function parseDocStore(raw) {
    const out = emptyDocStore();
    if (typeof raw !== "object" || raw === null || raw.schema !== 1)
        return out;
    const o = raw;
    for (const d of Array.isArray(o.docs) ? o.docs : [])
        if (d && typeof d.id === "string" && typeof d.title === "string" && typeof d.text === "string" && isMode(d.mode))
            out.docs.push({ id: d.id, title: d.title.slice(0, 120), mode: d.mode, text: d.text.slice(0, MAX_DOC_CHARS), createdAt: Number(d.createdAt) || 0, updatedAt: Number(d.updatedAt) || 0 });
    for (const t of Array.isArray(o.templates) ? o.templates : [])
        if (t && typeof t.id === "string" && typeof t.title === "string" && typeof t.text === "string" && isMode(t.mode))
            out.templates.push({ id: t.id, title: t.title.slice(0, 120), mode: t.mode, text: t.text.slice(0, MAX_DOC_CHARS) });
    out.docs = out.docs.slice(0, MAX_DOCS);
    return out;
}
export function newId(prefix) { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
export function saveDoc(store, doc, now = Date.now()) {
    const title = doc.title.trim() || "Untitled draft";
    if (doc.text.length > MAX_DOC_CHARS)
        return { ok: false, error: `This draft is longer than ${MAX_DOC_CHARS.toLocaleString("en-GB")} characters, so it was not saved.` };
    const existing = doc.id ? store.docs.find((d) => d.id === doc.id) : undefined;
    if (!existing && store.docs.length >= MAX_DOCS)
        return { ok: false, error: `You already have ${MAX_DOCS} saved drafts. Delete some first.` };
    const rec = existing ? { ...existing, title, mode: doc.mode, text: doc.text, updatedAt: now } : { id: newId("doc"), title, mode: doc.mode, text: doc.text, createdAt: now, updatedAt: now };
    return { ok: true, store: { ...store, docs: [rec, ...store.docs.filter((d) => d.id !== rec.id)] } };
}
export const deleteDoc = (s, id) => ({ ...s, docs: s.docs.filter((d) => d.id !== id) });
export function saveTemplate(s, t) {
    if (!t.text.trim())
        return { ok: false, error: "A template needs some text." };
    return { ok: true, store: { ...s, templates: [...s.templates, { id: newId("tpl"), title: t.title.trim() || "My template", mode: t.mode, text: t.text.slice(0, MAX_DOC_CHARS) }] } };
}
export const deleteTemplate = (s, id) => ({ ...s, templates: s.templates.filter((t) => t.id !== id) });
/** Starting structures only. Square brackets mark what the writer must supply. Nothing here states a fact. */
export const BUILT_IN_TEMPLATES = [
    { id: "tpl-report", mode: "match-report", title: "Match report", builtIn: true, text: "[HOME] [score]-[score] [AWAY]: [one-line story of the match]\n\n[Opening: the result, the competition, and the main storyline.]\n\n[Key moments in order: who, which minute, what happened. Check each against your notes or the official record.]\n\n[The turning point, and why it mattered.]\n\n[Manager and player quotes: only words actually said, each with the speaker named.]\n\n[What it means: league position, and the next fixture.]" },
    { id: "tpl-preview", mode: "match-preview", title: "Match preview", builtIn: true, text: "[HOME] v [AWAY]: [the storyline that makes this fixture matter]\n\n[Fixture details: competition, date, kick-off, venue.]\n\n[First storyline, with the evidence: form, injuries, history.]\n\n[Second storyline.]\n\n[Key players or managers to watch, and why.]\n\n[Expectation: clearly your own view, not stated as fact.]" },
    { id: "tpl-reaction", mode: "post-match-reaction", title: "Post-match reaction", builtIn: true, text: "[Result in one line.]\n\n[First main talking point.]\n\n[Manager reaction: quote with speaker and setting, or a clearly marked paraphrase.]\n\n[Player reaction: quote with speaker.]\n\n[Your analysis, kept visibly separate from the quotes.]\n\n[What happens next.]" },
    { id: "tpl-feature", mode: "player-feature", title: "Player feature / interview", builtIn: true, text: "[Opening scene or striking moment.]\n\n[Who they are and why the reader should care now.]\n\n[Career so far, in order, from verified sources.]\n\n[Their own words: quotations attributed, saved for voice and feeling.]\n\n[Where they are now, and what is next.]" },
    { id: "tpl-news", mode: "football-news", title: "Football news story", builtIn: true, text: "[What has happened, in one sentence, with the source named.]\n\n[Who confirmed it, and how: statement, interview, named report.]\n\n[Key details, each attributed. Mark anything unconfirmed as unconfirmed.]\n\n[Relevant background in two or three sentences.]\n\n[What is expected next.]" },
    { id: "tpl-tactics", mode: "tactical-analysis", title: "Tactical analysis", builtIn: true, text: "[The one tactical idea this piece explains.]\n\n[Setup: shapes and key roles, defined for general readers.]\n\n[First example from the match: when it happened and what it showed.]\n\n[Evidence: numbers or patterns, with their source.]\n\n[Counterpoint or uncertainty.]\n\n[Conclusion, marked as your judgement.]" },
    { id: "tpl-blog", mode: "football-blog", title: "Opinion blog post", builtIn: true, text: "[Your take, stated plainly.]\n\n[Why you think it: the strongest evidence first.]\n\n[The best argument against your view, answered fairly.]\n\n[Where this leaves your club or the sport.]" },
];
