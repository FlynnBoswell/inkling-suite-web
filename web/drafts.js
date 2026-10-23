import { h } from "../extension/dom.js";
import { analyse } from "../core/engine.js";
import { applySuggestion, changedRegion } from "../core/apply.js";
import { DEFAULT_LT_ENDPOINT, ltRequestBody, ltToSuggestions, mergeSuggestions } from "../core/grammar/languagetool.js";
import { dict, loadDictionary } from "./dictionary.js";
import { WRITING_MODES } from "../core/types.js";
import { childrenOf, cleanUrl, DRAFT_MODES, live, newDraft } from "../core/suite/model.js";
import { draftChecks, draftMarkdown, headlineChecks, insertAt, readingStats, wordCount } from "../core/suite/drafting.js";
import { factGaps, setWordCheck, withScorelines } from "../core/suite/facts.js";
import { timelineNotes } from "../core/suite/match.js";
import { isCommonWord } from "../core/lexicon.js";
import { ago, app, download, empty, extLink, field, go, link, persist, projects, section, setStatus, plural } from "./ui.js";
import { STATUS_LABEL } from "./sleuth.js";
import { aiEditor } from "./draft-ai.js";
import { addWord, checkDepth as depth, myWords, setCheckDepth } from "./prefs.js";
/**
 * Inkling in the Suite: a drafting workspace. Proofreading runs on this device with the same engine as the
 * Chrome extension, with mistakes underlined in the text. Nothing is rewritten without the writer pressing a button.
 */
const MODE_LABEL = Object.fromEntries(WRITING_MODES.map((m) => [m.id, m.label]));
const draftsOf = (p) => childrenOf([...app.store.records()], p.id).filter((r) => r.kind === "draft" && live(r)).sort((a, b) => b.updatedAt - a.updatedAt);
const byKind = (k) => new Map(app.store.records().filter((r) => r.kind === k).map((r) => [r.id, r]));
/**
 * Deep grammar through LanguageTool on this computer, if it is running. Text goes only to 127.0.0.1.
 * "unknown" until the first try; "off" after a failed connection, so nothing is retried on every keystroke.
 */
let grammarState = "unknown";
let grammarFailedAt = 0;
async function checkGrammar(text) {
    if (!text.trim())
        return [];
    if (grammarState === "off" && Date.now() - grammarFailedAt < 30_000)
        return null; // retry now and then, in case it was started later
    try {
        const r = await fetch(DEFAULT_LT_ENDPOINT + "/v2/check", { method: "POST", body: ltRequestBody(text, "en-GB"), signal: AbortSignal.timeout(10_000) });
        if (!r.ok)
            throw new Error(String(r.status));
        grammarState = "on";
        return ltToSuggestions(await r.json(), text, 0);
    }
    catch {
        grammarState = "off";
        grammarFailedAt = Date.now();
        return null;
    }
}
/**
 * Deeper-grammar (LanguageTool) fixes safe enough for "Fix all": each has one certain answer. Spelling is left out
 * (it would "correct" names), and so are agreement fixes with more than one possible answer ("go" → goes or went).
 */
const LT_SAFE = new Set(["UPPERCASE_SENTENCE_START", "EN_A_VS_AN", "ENGLISH_WORD_REPEAT_RULE", "COMMA_PARENTHESIS_WHITESPACE", "I_LOWERCASE", "SENTENCE_WHITESPACE", "WHITESPACE_RULE", "DOUBLE_PUNCTUATION", "EN_CONTRACTION_SPELLING", "THEIR_IS"].map((id) => "lt." + id));
/** What an underline means: a clear mistake, a style or clarity point, or a football or fact convention. */
const kindOf = (s) => (s.severity === "error" ? "err" : s.category === "football" || s.basis === "verify-fact" ? "fact" : "style");
const KIND_LABEL = { err: "Corrections", style: "Clarity and style", fact: "Football and facts" };
export function inklingHome() {
    const ps = projects().sort((a, b) => b.updatedAt - a.updatedAt);
    const recent = app.store.records().filter((r) => r.kind === "draft" && live(r)).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8);
    return h("div", null, h("h1", null, "Inkling"), h("p", { class: "lead" }, "Write and revise articles with mistakes underlined as you type, football-aware advice, readability, and checks against your saved quotes and research. Your words stay yours: every change waits for you."), section("Recent drafts", recent.length ? h("ul", { class: "items" }, ...recent.map((d) => h("li", null, link(`#/draft/${d.id}`, d.title || "Untitled draft"), h("span", { class: "meta" }, `${d.status} · ${plural(wordCount(d.body), "word", "words")} · ${ago(d.updatedAt)}`)))) : empty("No drafts yet.")), ps.length ? section("Choose a project", h("ul", { class: "items" }, ...ps.map((p) => h("li", null, link(`#/drafts/${p.id}`, p.title), h("span", { class: "meta" }, `${plural(draftsOf(p).length, "draft", "drafts")}`)))))
        : empty("Create a project first.", h("button", { class: "primary", type: "button", onClick: () => go("#/project/new") }, "Create a project")), section("Also available", h("p", null, "The Inkling Chrome extension underlines mistakes in text boxes on sites you switch it on for, including Word for the web. With Start Inkling running on your laptop, deeper grammar checking and the AI editor (feedback, rewrites, headlines and a first draft from your notes) work here too.")));
}
export function draftsProject(p) {
    const ds = draftsOf(p);
    const title = h("input", { type: "text", placeholder: "Working headline", "aria-label": "Working headline" });
    const mode = h("select", { "aria-label": "Type of article" }, ...DRAFT_MODES.map((m) => h("option", { value: m }, MODE_LABEL[m])));
    return h("div", null, h("p", { class: "crumbs" }, link("#/tool/inkling", "Inkling"), " / ", link(`#/project/${p.id}`, p.title)), h("h1", null, `Drafts: ${p.title}`), section("Start a draft", h("form", { class: "row", onSubmit: async (e) => {
            e.preventDefault();
            if (!title.value.trim()) {
                title.focus();
                return;
            }
            const s = await persist(() => app.store.save(newDraft(p.id, title.value, mode.value)), "Draft created");
            if (s)
                go(`#/draft/${s[0].id}`);
        } }, title, mode, h("button", { class: "primary", type: "submit" }, "Create draft"))), section(`Drafts (${ds.length})`, ds.length ? h("ul", { class: "items" }, ...ds.map((d) => h("li", null, link(`#/draft/${d.id}`, d.title), h("span", { class: "meta" }, `${MODE_LABEL[d.mode]} · ${d.status} · ${plural(wordCount(d.body), "word", "words")}`)))) : empty("No drafts yet.")));
}
/** Side-panel tabs, so the writing help is one click away instead of a long scroll. */
function tabs(items, start = 0) {
    const buttons = items.map((t, i) => h("button", { type: "button", role: "tab", id: `tab-${t.id}`, "aria-controls": `panel-${t.id}`, "aria-selected": String(i === start), tabindex: i === start ? "0" : "-1" }, h("span", { class: "tab-label" }, t.label), h("span", { class: "tab-count" })));
    const panels = items.map((t, i) => h("div", { role: "tabpanel", id: `panel-${t.id}`, "aria-labelledby": `tab-${t.id}`, class: "tab-panel", hidden: i !== start }, t.body));
    const select = (i, focus = false) => { buttons.forEach((b, j) => { b.setAttribute("aria-selected", String(i === j)); b.tabIndex = i === j ? 0 : -1; panels[j].hidden = i !== j; }); if (focus)
        buttons[i].focus(); };
    buttons.forEach((b, i) => {
        b.addEventListener("click", () => select(i));
        b.addEventListener("keydown", (e) => { const k = e.key; if (k === "ArrowRight" || k === "ArrowLeft") {
            e.preventDefault();
            select((i + (k === "ArrowRight" ? 1 : items.length - 1)) % items.length, true);
        } });
    });
    const count = (id, n) => { const b = buttons[items.findIndex((t) => t.id === id)]; if (b)
        b.querySelector(".tab-count").textContent = n === 0 || n === "" ? "" : String(n); };
    return { node: h("div", { class: "side-tabs" }, h("div", { role: "tablist", "aria-label": "Writing help", class: "tablist" }, ...buttons), ...panels), select: (id) => select(items.findIndex((t) => t.id === id)), count };
}
export function draftEditor(d0) {
    const p = app.store.get(d0.projectId);
    if (!p)
        return empty("This draft's project is missing.");
    const fresh = () => app.store.get(d0.id);
    const kids = childrenOf([...app.store.records()], p.id);
    const pQuotes = kids.filter((r) => r.kind === "quote" && live(r) && !r.supersededBy);
    const pClaims = kids.filter((r) => r.kind === "claim" && live(r));
    const pNotes = kids.filter((r) => r.kind === "note" && live(r));
    const pInterviews = kids.filter((r) => r.kind === "interview" && live(r));
    const pSources = kids.filter((r) => r.kind === "source" && live(r));
    const pMatches = kids.filter((r) => r.kind === "match" && live(r));
    // Everything the project knows, for "is this name or number in my research?"
    const material = withScorelines([p.title, p.description, ...p.clubs, ...p.people, ...pQuotes.map((q) => `${q.title} ${q.speaker}`), ...pClaims.map((c) => `${c.title} ${c.notes}`),
        ...pNotes.map((n) => `${n.title} ${n.body}`), ...pInterviews.map((i) => `${i.interviewee} ${i.notes} ${i.transcriptEdited || i.transcriptOriginal}`), ...pSources.map((s) => `${s.title} ${s.publisher}`), ...pMatches.map((m) => `${timelineNotes(m)}\n${[...m.homeSquad, ...m.awaySquad].join(", ")}`)].join("\n")); // "Aldershot 2 Woking 1" also covers "2-1"
    const hasMaterial = pQuotes.length + pClaims.length + pNotes.length + pInterviews.length + pSources.length + pMatches.length > 0;
    document.title = `${d0.title || "Draft"} · Inkling Suite`;
    const headline = h("textarea", { rows: 1, value: d0.title, "aria-label": "Headline", class: "title-input", placeholder: "Headline" });
    headline.addEventListener("keydown", (e) => { if (e.key === "Enter") {
        e.preventDefault();
        standfirst.focus();
    } }); // a headline is one line
    const standfirst = h("textarea", { rows: 2, value: d0.standfirst, "aria-label": "Standfirst (summary under the headline)", class: "standfirst", placeholder: "Standfirst: one or two sentences under the headline that add the key detail" });
    const body = h("textarea", { rows: 22, value: d0.body, "aria-label": "Article text", class: "draft-body", placeholder: "Start writing. Mistakes are underlined as you go: click an underlined word to see the fix." });
    body.spellcheck = false; // Inkling checks spelling itself; two sets of underlines would conflict
    const backdrop = h("div", { class: "ink-backdrop", "aria-hidden": "true" });
    const pop = h("div", { class: "ink-pop", role: "dialog", "aria-label": "Suggestion", hidden: true });
    const wrap = h("div", { class: "ink-editor" }, backdrop, body, pop);
    const counter = h("span", { class: "meta", "aria-live": "polite" });
    const updateCount = () => { const w = wordCount(body.value); counter.textContent = `${plural(w, "word", "words")} · about ${Math.max(1, Math.round(w / 230))} min read`; };
    updateCount();
    // ---- the text box grows with the article (the page scrolls, not the box), and the underline layer copies its type
    const COPY = ["fontFamily", "fontSize", "fontWeight", "fontStyle", "lineHeight", "letterSpacing", "wordSpacing", "textIndent", "tabSize", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth", "boxSizing"];
    const syncLayer = () => { const cs = getComputedStyle(body); for (const k of COPY)
        backdrop.style[k] = cs[k]; };
    const grow = (el) => { el.style.height = "auto"; el.style.height = `${el.scrollHeight + 2}px`; };
    const autosize = () => { const y = window.scrollY; grow(body); grow(headline); grow(standfirst); window.scrollTo({ top: y }); };
    for (const el of [headline, standfirst])
        el.addEventListener("input", () => grow(el));
    requestAnimationFrame(() => { syncLayer(); autosize(); drawMarks(); });
    // Page-wide listeners stop themselves once the writer has left this draft.
    const gone = new AbortController();
    const alive = () => { if (wrap.isConnected)
        return true; gone.abort(); return false; };
    window.addEventListener("resize", () => { if (alive()) {
        syncLayer();
        autosize();
    } }, { signal: gone.signal });
    // ---- autosave (never re-renders, so typing is never interrupted)
    let timer;
    const save = () => {
        window.clearTimeout(timer);
        timer = undefined;
        const cur = fresh();
        const next = { ...cur, title: headline.value.trim() || "Untitled draft", standfirst: standfirst.value, body: body.value };
        if (next.title === cur.title && next.standfirst === cur.standfirst && next.body === cur.body)
            return;
        void persist(() => app.store.save(next), "Draft saved", { rerender: false });
    };
    const later = () => { setStatus("Unsaved changes…", "busy"); window.clearTimeout(timer); timer = window.setTimeout(save, 800); };
    for (const el of [headline, standfirst, body]) {
        el.addEventListener("input", later);
        el.addEventListener("blur", save);
    }
    app.flush = save;
    // ---- proofreading: underlines in the text, a card at the word, and the full list in the side panel
    let version = 0;
    let result = [];
    const dismissed = new Set();
    let lt = null;
    let ltTimer;
    let gaps = [];
    let gapsOn = false;
    let marks = [];
    let lastText = body.value;
    const sugBox = h("div", { "aria-live": "polite" });
    const checkBox = h("div");
    const statsBox = h("div", { class: "read-stats" });
    const gapBox = h("div");
    const summary = h("div", { class: "ink-summary" });
    const ltNote = h("p", { class: "hint" }, grammarState === "on" ? "Deeper grammar: on (LanguageTool on this computer)." : "Deeper grammar: off. Double-click “Start Inkling” on your laptop to add deeper grammar and punctuation checks.");
    const drawMarks = () => {
        const t = body.value;
        const out = [];
        let at = 0;
        for (const s of [...marks].sort((a, b) => a.start - b.start)) {
            if (s.start < at || s.end > t.length || s.end - s.start > 120)
                continue; // long, sentence-level advice is listed, not underlined
            out.push(t.slice(at, s.start), h("mark", { class: `u u-${s.ruleId === "fact-gap" ? "gap" : kindOf(s)}`, "data-id": s.id }, t.slice(s.start, s.end)));
            at = s.end;
        }
        out.push(t.slice(at) + "\n");
        backdrop.replaceChildren(...out);
    };
    // While typing, keep the underlines that the edit did not touch (moved along with the text) until the checks re-run.
    body.addEventListener("input", () => {
        const r = changedRegion(lastText, body.value);
        const delta = r.newEnd - r.oldEnd;
        lastText = body.value;
        marks = marks.flatMap((s) => (s.end <= r.start ? [s] : s.start >= r.oldEnd ? [{ ...s, start: s.start + delta, end: s.end + delta }] : []));
        hidePop();
        autosize();
        drawMarks();
    });
    const runChecks = (fromLt = false) => {
        if (!fromLt)
            version++;
        const cur = { ...fresh(), title: headline.value, body: body.value };
        const own = analyse(body.value, version, { mode: cur.mode, intensity: depth(), dictionary: myWords(), lexicon: dict.lexicon, commonWords: dict.common }).suggestions;
        const words = new Set(myWords().map((w) => w.toLowerCase()));
        result = (lt && lt.version === version ? mergeSuggestions(own, lt.list) : own).filter((s) => !dismissed.has(s.id) && !(s.category === "spelling" && words.has(s.original.toLowerCase())));
        if (!fromLt) {
            window.clearTimeout(ltTimer);
            const v = version, text = body.value;
            ltTimer = window.setTimeout(() => void checkGrammar(text).then((list) => { if (list && v === version && body.value === text) {
                lt = { version: v, list: list.map((s) => ({ ...s, docVersion: v })) };
                ltNote.textContent = "Deeper grammar: on (LanguageTool on this computer).";
                runChecks(true);
            } }), 700);
        }
        gaps = gapsOn && hasMaterial ? factGaps(body.value, material).flatMap((g) => g.missing.flatMap((tok) => {
            const i = body.value.indexOf(tok, g.start);
            if (i < 0 || i >= g.end)
                return [];
            return [{ id: `gap:${i}:${tok}`, ruleId: "fact-gap", category: "football", severity: "advice", start: i, end: i + tok.length, original: tok, replacement: null, title: "Not in your research", explanation: `“${tok}” is not in this project's notes, quotes, interviews or research. If you saw it yourself, fine; otherwise check it before publishing.`, basis: "verify-fact", docVersion: version }];
        })).filter((s) => !dismissed.has(s.id)) : [];
        marks = [...result, ...gaps.filter((g) => !result.some((s) => g.start < s.end && g.end > s.start))];
        lastText = body.value;
        drawMarks();
        // Side panel: the list, the evidence checks and readability.
        const checks = [...headlineChecks(headline.value), ...draftChecks(cur, byKind("quote"), byKind("claim"))];
        checkBox.replaceChildren(checks.length ? h("ul", { class: "checks" }, ...checks.map((c) => h("li", { class: c.level }, c.text))) : h("p", { class: "status ok" }, "Headline, quotes and linked research all check out."));
        const kinds = { err: result.filter((s) => kindOf(s) === "err"), style: result.filter((s) => kindOf(s) === "style"), fact: result.filter((s) => kindOf(s) === "fact") };
        sugBox.replaceChildren(!result.length ? h("p", { class: "status ok" }, dict.lexicon ? "No writing suggestions." : "Loading the dictionary…")
            : h("div", null, ...Object.keys(kinds).filter((k) => kinds[k].length).map((k) => h("div", null, h("h3", { class: `sug-head sug-${k}` }, `${KIND_LABEL[k]} (${kinds[k].length})`), h("ul", { class: "suggestions" }, ...kinds[k].slice(0, 60).map((s) => suggestionCard(s)))))));
        const fixable = autoFixable();
        summary.replaceChildren(...Object.keys(kinds).map((k) => h("button", { type: "button", class: `chip chip-${k}`, title: `Show ${KIND_LABEL[k].toLowerCase()}`, onClick: () => side.select("suggestions") }, h("strong", null, String(kinds[k].length)), ` ${KIND_LABEL[k].toLowerCase()}`)), ...(fixable.length ? [h("button", { type: "button", class: "small primary", onClick: () => void fixAll() }, `Fix ${fixable.length} clear mistake${fixable.length === 1 ? "" : "s"}`)] : []));
        side.count("suggestions", result.length);
        side.count("checks", checks.filter((c) => c.level === "problem").length);
        const st = readingStats(body.value);
        statsBox.replaceChildren(!st.words ? h("p", { class: "hint" }, "Readability appears once you start writing.") : h("dl", { class: "stats" }, h("div", null, h("dt", null, "Reading ease"), h("dd", null, h("strong", null, String(st.ease)), ` ${st.easeLabel}`)), h("div", null, h("dt", null, "Average sentence"), h("dd", null, `${st.avgSentence} words`)), h("div", null, h("dt", null, "Long sentences"), h("dd", { class: st.longSentences ? "warn" : "" }, String(st.longSentences))), h("div", null, h("dt", null, "Long paragraphs"), h("dd", { class: st.longParagraphs ? "warn" : "" }, String(st.longParagraphs)))), ...(st.words ? [h("p", { class: "hint" }, "Most news writing scores 50 to 70. Shorter sentences and paragraphs raise it; online readers skim, so one idea per paragraph.")] : []));
        gapBox.replaceChildren(!gapsOn ? h("p", { class: "hint" }, "Underline names and numbers that are not in this project's notes, quotes, interviews or research, so nothing slips in unchecked.")
            : !hasMaterial ? h("p", { class: "hint" }, "This project has no notes, quotes, interviews or research yet, so there is nothing to match against. Add some in Sleuth or Quill first.")
                : gaps.length ? h("ul", { class: "checks" }, ...gaps.map((g) => h("li", { class: "caution" }, h("button", { type: "button", class: "linklike", onClick: () => selectRange(g.start, g.end) }, `“${g.original}”`), " is not in your research.")))
                    : h("p", { class: "status ok" }, "Every name and number is in your research."));
    };
    const suggestionCard = (s, inPop = false) => h(inPop ? "div" : "li", { class: s.severity }, h("strong", null, s.title), " ", h("span", { class: "meta" }, s.ruleId.startsWith("lt.") ? `${s.category} · LanguageTool` : s.category), h("p", null, s.replacement !== null ? h("span", null, h("del", null, s.original), " → ", h("ins", null, s.replacement || "(remove)")) : h("span", null, `“${s.original.length > 80 ? s.original.slice(0, 80) + "…" : s.original}”`)), h("p", { class: "hint" }, s.explanation), h("div", { class: "row" }, s.replacement !== null ? h("button", { type: "button", class: "small primary", onClick: () => accept(s) }, "Accept") : null, inPop ? null : h("button", { type: "button", class: "small", onClick: () => { selectRange(s.start, s.end); showPop(s); } }, "Show"), s.category === "spelling" && /^[\p{L}'’-]+$/u.test(s.original) ? h("button", { type: "button", class: "small", onClick: () => { addWord(s.original); hidePop(); setStatus(`“${s.original}” added to your dictionary`); runChecks(); } }, "Add to dictionary") : null, h("button", { type: "button", class: "small", onClick: () => { dismissed.add(s.id); hidePop(); runChecks(); } }, "Dismiss")));
    const selectRange = (a, b) => { body.focus(); body.setSelectionRange(a, b); const m = backdrop.querySelector(`mark[data-id="${CSS.escape(marks.find((s) => s.start === a)?.id ?? "")}"]`); (m ?? body).scrollIntoView({ block: "center", behavior: "smooth" }); };
    const accept = (s) => {
        const r = applySuggestion(body.value, version, s);
        if (!r.ok) {
            setStatus("The text changed since that suggestion, so nothing was replaced. Suggestions have been refreshed.", "err");
            runChecks();
            return;
        }
        hidePop();
        body.focus();
        body.setSelectionRange(s.start, s.end);
        if (!document.execCommand?.("insertText", false, s.replacement ?? ""))
            body.setRangeText(s.replacement ?? "", s.start, s.end, "end"); // keeps Ctrl+Z working where supported
        if (body.value !== r.text)
            body.value = r.text; // the browser refused; fall back to the verified result
        lastText = body.value;
        updateCount();
        autosize();
        save();
        runChecks();
    };
    // "Fix all": only Inkling's own clear mistakes with one certain fix (never style advice), and a copy is kept first.
    const autoFixable = () => result.filter((s) => s.replacement !== null && s.docVersion === version && (s.ruleId.startsWith("lt.") ? LT_SAFE.has(s.ruleId) : s.severity === "error"));
    const fixAll = async () => {
        const list = autoFixable().sort((a, b) => b.start - a.start);
        if (!list.length)
            return;
        save();
        const d = fresh();
        let t = body.value;
        let n = 0;
        let floor = Infinity; // from the end backwards, never two fixes on the same words
        for (const s of list)
            if (s.end <= floor && t.slice(s.start, s.end) === s.original) {
                t = t.slice(0, s.start) + s.replacement + t.slice(s.end);
                n++;
                floor = s.start;
            }
        body.focus();
        body.select();
        if (!document.execCommand?.("insertText", false, t))
            body.value = t; // one Ctrl+Z undoes them all where supported
        if (body.value !== t)
            body.value = t;
        lastText = body.value;
        updateCount();
        autosize();
        const keep = { at: Date.now(), title: d.title, standfirst: d.standfirst, body: d.body, note: `before fixing ${n} mistake${n === 1 ? "" : "s"}` };
        await persist(() => app.store.save({ ...fresh(), title: headline.value.trim() || d.title, standfirst: standfirst.value, body: body.value, revisions: [...fresh().revisions, keep].slice(-30) }), `Fixed ${n} mistake${n === 1 ? "" : "s"}. The text before is kept in Revisions.`, { rerender: false });
        drawRevisions();
        runChecks();
    };
    // The card at the word: opens when the cursor lands in an underlined word.
    let popFor = "";
    const hidePop = () => { pop.hidden = true; popFor = ""; backdrop.querySelector("mark.active")?.classList.remove("active"); };
    const showPop = (s) => {
        const m = backdrop.querySelector(`mark[data-id="${CSS.escape(s.id)}"]`);
        if (!m) {
            hidePop();
            return;
        }
        backdrop.querySelector("mark.active")?.classList.remove("active");
        m.classList.add("active");
        popFor = s.id;
        pop.replaceChildren(suggestionCard(s, true), h("p", { class: "keys" }, s.replacement !== null ? "Alt+Enter accepts · " : "", "Alt+↓ next · Alt+↑ previous · Esc closes"));
        pop.hidden = false;
        const wr = wrap.getBoundingClientRect(), mr = m.getBoundingClientRect();
        pop.style.top = `${mr.bottom - wr.top + 8}px`;
        pop.style.left = `${Math.max(0, Math.min(mr.left - wr.left - 12, wrap.clientWidth - pop.offsetWidth))}px`;
    };
    const atCaret = () => {
        if (body.selectionStart !== body.selectionEnd)
            return hidePop();
        const c = body.selectionStart;
        const s = marks.find((x) => x.start <= c && c <= x.end && x.end - x.start <= 120);
        if (!s)
            return hidePop();
        if (s.id !== popFor)
            showPop(s);
    };
    body.addEventListener("click", atCaret);
    // Keyboard proofreading: Alt+↓ / Alt+↑ go to the next or previous underline, Alt+Enter accepts its fix and moves on.
    const underlined = () => marks.filter((x) => x.end - x.start <= 120).sort((a, b) => a.start - b.start);
    const jump = (dir) => {
        const list = underlined();
        if (!list.length) {
            hidePop();
            setStatus("Nothing underlined.");
            return;
        }
        const c = body.selectionStart;
        const cur = list.find((x) => x.id === popFor);
        const next = dir === 1 ? list.find((x) => x.start > (cur ? cur.start : c - 1)) ?? list[0] : [...list].reverse().find((x) => x.start < (cur ? cur.start : c)) ?? list[list.length - 1];
        body.focus();
        body.setSelectionRange(next.start, next.start); // the cursor in the word, so the card stays open
        backdrop.querySelector(`mark[data-id="${CSS.escape(next.id)}"]`)?.scrollIntoView({ block: "center" });
        showPop(next);
    };
    body.addEventListener("keydown", (e) => {
        const k = e;
        if (!k.altKey || k.ctrlKey || k.metaKey)
            return;
        if (k.key === "ArrowDown" || k.key === "ArrowUp") {
            e.preventDefault();
            jump(k.key === "ArrowDown" ? 1 : -1);
        }
        else if (k.key === "Enter") {
            e.preventDefault(); // never a new line
            const sug = result.find((x) => x.id === popFor);
            if (sug && sug.replacement !== null) {
                const at = sug.start;
                accept(sug);
                body.setSelectionRange(at, at);
                jump(1);
            }
        }
    });
    body.addEventListener("keyup", (e) => { const k = e.key; if (k === "Escape")
        hidePop();
    else if (/^(Arrow|Home|End|Page)/.test(k))
        atCaret(); });
    document.addEventListener("click", (e) => { if (alive() && !wrap.contains(e.target))
        hidePop(); }, { signal: gone.signal });
    let checkTimer;
    for (const el of [headline, body])
        el.addEventListener("input", () => { updateCount(); window.clearTimeout(checkTimer); checkTimer = window.setTimeout(runChecks, 600); });
    // ---- quotes and research
    const quotePick = h("select", { "aria-label": "Quote to insert" }, h("option", { value: "" }, pQuotes.length ? "Choose a saved quote…" : "No saved quotes in this project"), ...pQuotes.map((q) => h("option", { value: q.id }, `${q.speaker}: “${q.title.length > 70 ? q.title.slice(0, 70) + "…" : q.title}”`)));
    const claimPick = h("select", { "aria-label": "Research claim to link" }, h("option", { value: "" }, pClaims.length ? "Choose a claim…" : "No claims in this project"), ...pClaims.map((c) => h("option", { value: c.id }, `[${c.status}] ${c.title}`)));
    const linked = h("ul", { class: "items" });
    const drawLinked = () => {
        const d = fresh();
        const qm = byKind("quote");
        const cm = byKind("claim");
        linked.replaceChildren(...d.quoteIds.map((id) => {
            const q = qm.get(id);
            return h("li", null, h("span", null, "Quote: ", q ? link(`#/quote/${q.id}`, `${q.speaker}: “${q.title.slice(0, 60)}${q.title.length > 60 ? "…" : ""}”`) : "(deleted)"), h("button", { type: "button", class: "small", "aria-label": "Unlink quote", onClick: () => void unlink("quoteIds", id) }, "Unlink"));
        }), ...d.claimIds.map((id) => {
            const c = cm.get(id);
            return h("li", null, h("span", null, "Fact: ", c ? link(`#/claim/${c.id}`, c.title) : "(deleted)", c ? h("span", { class: `pill status-${c.status}` }, STATUS_LABEL[c.status].split(" (")[0]) : null), h("button", { type: "button", class: "small", "aria-label": "Unlink claim", onClick: () => void unlink("claimIds", id) }, "Unlink"));
        }));
        if (!d.quoteIds.length && !d.claimIds.length)
            linked.replaceChildren(h("li", { class: "empty" }, "Nothing linked yet."));
    };
    const unlink = async (key, id) => { save(); await persist(() => app.store.save({ ...fresh(), [key]: fresh()[key].filter((x) => x !== id) }), "Unlinked", { rerender: false }); drawLinked(); runChecks(); };
    drawLinked();
    const insertText = (text) => {
        const r = insertAt(body.value, body.selectionStart ?? body.value.length, text);
        body.value = r.body;
        body.focus();
        body.setSelectionRange(r.caret, r.caret);
        lastText = body.value;
        updateCount();
        autosize();
    };
    const insertQuote = async () => {
        const q = pQuotes.find((x) => x.id === quotePick.value);
        if (!q) {
            setStatus("Choose a quote first.", "err");
            return;
        }
        insertText(`“${q.title}”`); // exact words, untouched
        const d = fresh();
        await persist(() => app.store.save({ ...d, title: headline.value.trim() || d.title, standfirst: standfirst.value, body: body.value, quoteIds: d.quoteIds.includes(q.id) ? d.quoteIds : [...d.quoteIds, q.id] }), "Quote inserted", { rerender: false });
        drawLinked();
        runChecks();
    };
    const linkClaim = async () => {
        const c = pClaims.find((x) => x.id === claimPick.value);
        if (!c) {
            setStatus("Choose a claim first.", "err");
            return;
        }
        save();
        const d = fresh();
        if (d.claimIds.includes(c.id)) {
            setStatus("Already linked.");
            return;
        }
        await persist(() => app.store.save({ ...d, claimIds: [...d.claimIds, c.id] }), "Fact linked", { rerender: false });
        drawLinked();
        runChecks();
    };
    // ---- article settings, revisions, export
    const mode = h("select", { "aria-label": "Type of article", onChange: async () => { save(); await persist(() => app.store.save({ ...fresh(), mode: mode.value }), "Article type saved", { rerender: false }); runChecks(); } }, ...DRAFT_MODES.map((m) => h("option", { value: m, selected: d0.mode === m }, MODE_LABEL[m])));
    const status = h("select", { "aria-label": "Draft status" }, h("option", { value: "drafting", selected: d0.status === "drafting" }, "Drafting"), h("option", { value: "ready", selected: d0.status === "ready" }, "Ready"), h("option", { value: "published", selected: d0.status === "published" }, "Published"));
    const pubUrl = h("input", { type: "url", value: d0.publishedUrl, placeholder: "https://… (only once it is really published)", "aria-label": "Published link" });
    const revNote = h("input", { type: "text", placeholder: "Optional note, e.g. 'before subbing'", "aria-label": "Revision note" });
    const revList = h("div");
    const drawRevisions = () => {
        const revs = fresh().revisions;
        revList.replaceChildren(revs.length ? h("ul", { class: "items" }, ...[...revs].reverse().map((r) => h("li", null, h("span", null, new Date(r.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }), r.note ? ` · ${r.note}` : "", h("span", { class: "meta" }, ` · ${plural(wordCount(r.body), "word", "words")}`)), h("button", { type: "button", class: "small", onClick: async () => {
                if (!confirm("Restore this version? Your current text is kept as a revision first."))
                    return;
                save();
                const d = fresh();
                const keep = { at: Date.now(), title: d.title, standfirst: d.standfirst, body: d.body, note: "before restoring an earlier version" };
                await persist(() => app.store.save({ ...d, title: r.title, standfirst: r.standfirst, body: r.body, revisions: [...d.revisions, keep].slice(-30) }), "Earlier version restored");
            } }, "Restore")))) : empty("Keep a version before big edits so you can go back."));
    };
    drawRevisions();
    const depthPick = h("select", { "aria-label": "How thorough", onChange: () => { setCheckDepth(depthPick.value); runChecks(); } }, ...[["minimal", "Mistakes only"], ["balanced", "Standard"], ["thorough", "Thorough (style too)"]].map(([v, t]) => h("option", { value: v, selected: depth() === v }, t)));
    const page = h("div", { class: "draft-page" });
    const focusBtn = h("button", { type: "button", class: "small", "aria-pressed": "false", onClick: () => { const on = page.classList.toggle("focus"); focusBtn.setAttribute("aria-pressed", String(on)); focusBtn.textContent = on ? "Exit focus" : "Focus mode"; requestAnimationFrame(() => { syncLayer(); autosize(); drawMarks(); }); } }, "Focus mode");
    const gapBtn = h("button", { type: "button", class: "small", onClick: () => { gapsOn = !gapsOn; gapBtn.textContent = gapsOn ? "Stop checking names and numbers" : "Check names and numbers against my research"; runChecks(); } }, "Check names and numbers against my research");
    const side = tabs([
        { id: "suggestions", label: "Fixes", body: h("div", null, h("div", { class: "row" }, field("Checks", depthPick)), h("p", { class: "hint" }, "Click an underlined word in the article, or use the list. Keyboard: Alt+↓ goes to the next underline, Alt+Enter accepts its fix. Ctrl+Z undoes any change."), sugBox, ltNote) },
        { id: "checks", label: "Checks", body: h("div", null, h("h3", null, "Readability"), statsBox, h("h3", null, "Headline, quotes and research"), checkBox, h("h3", null, "Names and numbers"), gapBtn, gapBox) },
        { id: "ai", label: "AI", body: aiEditor({ body, headline, standfirst, draft: fresh, save, recheck: () => runChecks(), edited: () => { lastText = body.value; updateCount(); autosize(); save(); runChecks(); }, selectRange, insertText, material: { quotes: pQuotes, claims: pClaims, notes: pNotes, interviews: pInterviews, matches: pMatches } }) },
        { id: "material", label: "Quotes", body: h("div", null, h("div", { class: "row" }, quotePick, h("button", { type: "button", onClick: () => void insertQuote() }, "Insert quote")), h("div", { class: "row" }, claimPick, h("button", { type: "button", onClick: () => void linkClaim() }, "Link fact")), linked) },
        { id: "article", label: "Article", body: h("div", null, field("Type", mode), field("Status", status), field("Published link", pubUrl, "Mark as published only when it is live."), h("button", { type: "button", onClick: async () => {
                    save();
                    if (status.value === "published" && !pubUrl.value.trim()) {
                        setStatus("Add the published link before marking it as published.", "err");
                        return;
                    }
                    const u = cleanUrl(pubUrl.value);
                    if (u === null) {
                        setStatus("The published link must be a web address.", "err");
                        return;
                    }
                    await persist(() => app.store.save({ ...fresh(), status: status.value, publishedUrl: u }), "Article details saved", { rerender: false });
                } }, "Save article details"), d0.publishedUrl ? h("p", null, extLink(d0.publishedUrl, "Open published article")) : null, h("h3", null, "Revisions"), h("div", { class: "row" }, revNote, h("button", { type: "button", onClick: async () => {
                    save();
                    const d = fresh();
                    const rev = { at: Date.now(), title: d.title, standfirst: d.standfirst, body: d.body, note: revNote.value.trim() };
                    await persist(() => app.store.save({ ...d, revisions: [...d.revisions, rev].slice(-30) }), "Revision kept", { rerender: false });
                    revNote.value = "";
                    drawRevisions();
                } }, "Keep this version")), revList, h("h3", null, "Export"), h("div", { class: "row" }, h("button", { type: "button", onClick: () => { save(); download(`${(fresh().title || "draft").replace(/[^\w-]+/g, "-").toLowerCase()}.md`, draftMarkdown(fresh(), p, byKind("quote"), byKind("claim"), byKind("source"))); setStatus("Article file created"); } }, "Export article"), h("button", { type: "button", onClick: () => { save(); const d = fresh(); void navigator.clipboard.writeText([d.title, d.standfirst, d.body].filter((x) => x.trim()).join("\n\n")).then(() => setStatus("Article copied: paste it into your CMS"), () => setStatus("Copy blocked by the browser: select the text and press Ctrl+C.", "err")); } }, "Copy article"), h("button", { class: "danger", type: "button", onClick: async () => { if (!confirm("Move this draft to the Trash?"))
                    return; app.flush = null; window.clearTimeout(timer); if (await persist(() => app.store.trash(d0.id).then(() => true), "Draft moved to Trash"))
                    go(`#/drafts/${p.id}`); } }, "Delete draft"))) },
    ]);
    void loadDictionary().then(() => { if (dict.common) {
        const common = dict.common;
        setWordCheck((w) => isCommonWord(common, w));
    } runChecks(); });
    runChecks();
    page.append(h("h1", { class: "sr-only" }, d0.title || "Untitled draft"), h("p", { class: "crumbs" }, link("#/tool/inkling", "Inkling"), " / ", link(`#/drafts/${p.id}`, p.title)), h("div", { class: "editor-layout" }, h("div", { class: "editor-main" }, h("div", { class: "ink-toolbar" }, summary, h("span", { class: "spacer" }), focusBtn), headline, standfirst, wrap, h("div", { class: "row editor-foot" }, counter, h("span", { class: "hint" }, "Saved automatically on this device. Proofreading runs here; nothing is sent anywhere."))), h("aside", { class: "editor-side", "aria-label": "Writing help" }, side.node)));
    return page;
}
