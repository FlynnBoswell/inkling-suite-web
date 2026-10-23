import { h } from "../extension/dom.js";
import { timelineNotes } from "../core/suite/match.js";
import { wordCount } from "../core/suite/drafting.js";
import { checkPreserved } from "../core/ai/protocol.js";
import { setStatus } from "./ui.js";
import { ai, aiBox, runAi } from "./ai.js";
/** Held back (a name, number or quote not in the material) or flagged by the meaning check. */
const flag = (x, held = "Not usable") => x.withheld ? h("span", { class: "status err" }, ` ${held}: ${x.problem}.`) : x.caution ? h("span", { class: "status caution" }, ` Check: ${x.caution.replace(/\.$/, "")}.`) : null;
const meaningNote = (checked) => h("p", { class: "hint" }, checked ? "A second AI check compared each line's meaning with your material and flagged lines that may say more than it does (amber). It is right about 9 times in 10 in our tests, so read every line yourself." : "The meaning check could not run this time, so read every line against your material.");
export function aiEditor(e) {
    const { body, headline, standfirst, save, selectRange, insertText } = e;
    const fresh = e.draft;
    const runChecks = e.recheck;
    const { quotes: pQuotes, claims: pClaims, notes: pNotes, interviews: pInterviews, matches: pMatches } = e.material;
    const out = h("div");
    const selectText = (excerpt) => { const i = body.value.indexOf(excerpt); if (i >= 0)
        selectRange(i, i + excerpt.length); };
    const fb = h("button", { type: "button" }, "Get AI feedback");
    fb.addEventListener("click", () => {
        if (!body.value.trim()) {
            setStatus("Write something first.", "err");
            return;
        }
        save();
        void runAi(fb, out, () => ai("/v1/inkling/feedback", { headline: headline.value, body: body.value, mode: fresh().mode }), (r) => aiBox("Editor’s notes", h("p", null, r.overall), h("h4", null, "Headline"), h("p", null, r.headline.verdict), r.headline.alternatives.length ? h("ul", null, ...r.headline.alternatives.map((a) => h("li", null, a, " ", h("button", { type: "button", class: "small", onClick: () => useHeadline(a) }, "Use")))) : null, h("h4", null, "Opening"), h("p", null, r.opening.verdict), r.opening.suggestion ? h("p", { class: "hint" }, r.opening.suggestion) : null, r.structure.length ? h("div", null, h("h4", null, "Structure"), h("ul", null, ...r.structure.map((s) => h("li", null, s)))) : null, r.clarity.length ? h("div", null, h("h4", null, "Clarity"), h("ul", null, ...r.clarity.map((c) => h("li", null, h("button", { type: "button", class: "linklike", onClick: () => selectText(c.excerpt) }, `“${c.excerpt}”`), ` ${c.issue} `, h("span", { class: "hint" }, c.suggestion))))) : null, r.factsToCheck.length ? h("div", null, h("h4", null, "Facts to check"), h("ul", null, ...r.factsToCheck.map((c) => h("li", null, h("button", { type: "button", class: "linklike", onClick: () => selectText(c.excerpt) }, `“${c.excerpt}”`), ` ${c.why}`)))) : null));
    });
    const instruction = h("select", { "aria-label": "How to rewrite" }, ...["Make it clearer and more concise.", "Tighten it: cut repetition and filler.", "Make the opening more compelling without adding facts.", "Improve the flow between sentences.", "Make the tone more formal.", "Make the tone more conversational.", "Split long sentences into shorter ones."].map((t) => h("option", { value: t }, t)));
    const rw = h("button", { type: "button" }, "Rewrite selection");
    rw.addEventListener("click", () => {
        const a = body.selectionStart ?? 0, b = body.selectionEnd ?? 0;
        const original = body.value.slice(a, b);
        if (original.trim().length < 10) {
            setStatus("Select a sentence or paragraph in the article first.", "err");
            return;
        }
        const snapshot = body.value;
        void runAi(rw, out, () => ai("/v1/inkling/rewrite", { text: original, instruction: instruction.value }), (r) => {
            const risks = checkPreserved(original, r.rewrite);
            return aiBox("Suggested rewrite", h("p", { class: "rewrite" }, r.rewrite), ...r.notes.map((n) => h("p", { class: "hint" }, n)), risks.length ? h("ul", { class: "checks" }, ...risks.map((x) => h("li", { class: "problem" }, x))) : null, h("div", { class: "row" }, h("button", { type: "button", class: "small primary", onClick: () => {
                    if (body.value !== snapshot) {
                        setStatus("The article changed while the rewrite was prepared, so it was not applied.", "err");
                        return;
                    }
                    body.focus();
                    body.setSelectionRange(a, b);
                    if (!document.execCommand?.("insertText", false, r.rewrite))
                        body.setRangeText(r.rewrite, a, b, "end");
                    e.edited();
                    out.replaceChildren(h("p", { class: "status ok" }, "Rewrite applied. Ctrl+Z undoes it."));
                } }, "Replace selection"), h("button", { type: "button", class: "small", onClick: () => out.replaceChildren() }, "Discard")));
        });
    });
    const useHeadline = (t) => { headline.value = t; save(); runChecks(); setStatus("Headline updated"); };
    const hl = h("button", { type: "button" }, "Headlines and standfirst");
    hl.addEventListener("click", () => {
        if (wordCount(body.value) < 15) {
            setStatus("Write a little more first: at least the main facts.", "err");
            return;
        }
        save();
        void runAi(hl, out, () => ai("/v1/inkling/headlines", { headline: headline.value, body: body.value, mode: fresh().mode }), (r) => aiBox("Headlines and standfirsts", h("ul", { class: "items" }, ...r.headlines.map((x) => h("li", null, h("span", { class: x.withheld ? "withheld" : "" }, h("strong", null, `${x.style}: `), x.text, h("span", { class: "meta" }, ` ${x.text.length} characters`), flag(x)), x.withheld ? null : h("button", { type: "button", class: "small", onClick: () => useHeadline(x.text) }, "Use")))), r.standfirsts.length ? h("h4", null, "Standfirsts") : null, h("ul", { class: "items" }, ...r.standfirsts.map((x) => h("li", null, h("span", { class: x.withheld ? "withheld" : "" }, x.text, flag(x)), x.withheld ? null : h("button", { type: "button", class: "small", onClick: () => { standfirst.value = x.text; save(); setStatus("Standfirst updated"); } }, "Use")))), h("p", { class: "hint" }, "Search headlines put the club and key fact first, as readers would type them. Any option that adds a name or number the article does not have is held back."), meaningNote(r.meaningChecked)));
    });
    const words = h("select", { "aria-label": "Length of the first draft" }, ...[["300", "Short (about 300 words)"], ["500", "Standard (about 500 words)"], ["800", "Long (about 800 words)"]].map(([v, t]) => h("option", { value: v, selected: v === "500" }, t)));
    const fd = h("button", { type: "button" }, "Write a first draft from my notes");
    fd.addEventListener("click", () => {
        const facts = pClaims.filter((c) => c.status === "confirmed" || c.status === "attributed").map((c) => c.status === "attributed" ? `${c.title} (attributed: report it as the source's claim)` : c.title);
        const quotes = pQuotes.filter((q) => !q.uncertain).map((q) => `${q.title} (${q.speaker})`);
        const notes = [...pMatches.map((m) => `Match log (what the reporter saw):\n${timelineNotes(m)}`), ...pNotes.map((n) => `${n.title}\n${n.body}`), ...pInterviews.filter((i) => i.notes.trim()).map((i) => `Interview notes, ${i.interviewee}:\n${i.notes}`), body.value.trim() ? `The writer's draft so far:\n${body.value}` : ""].filter(Boolean).join("\n\n");
        if (!facts.length && !quotes.length && !notes.trim()) {
            setStatus("Add notes, saved quotes, checked research or a Whistle match log to the project first.", "err");
            return;
        }
        save();
        void runAi(fd, out, () => ai("/v1/inkling/firstdraft", { headline: headline.value, mode: fresh().mode, notes, quotes, facts, words: Number(words.value) }), (r) => {
            const ticks = r.paragraphs.map((x) => h("input", { type: "checkbox", checked: !x.withheld && !x.caution, disabled: x.withheld, "aria-label": `Use: ${x.text.slice(0, 60)}` }));
            const usable = r.paragraphs.some((x) => !x.withheld);
            return aiBox("First draft (from your material only)", h("p", { class: "hint" }, `Built from ${facts.length} checked fact${facts.length === 1 ? "" : "s"}, ${quotes.length} saved quote${quotes.length === 1 ? "" : "s"} and your notes. Unverified and disputed research was left out. Paragraphs that add anything not in your material are held back.`), r.headline.text ? h("p", null, h("strong", null, r.headline.text), flag(r.headline)) : null, r.standfirst.text ? h("p", { class: "hint" }, r.standfirst.text, flag(r.standfirst)) : null, h("p", { class: "hint" }, "Tick the paragraphs to use. Flagged ones start unticked."), h("ul", { class: "pick-paras" }, ...r.paragraphs.map((x, i) => h("li", { class: x.withheld ? "withheld" : "" }, h("label", null, ticks[i], " ", x.text, flag(x, "Held back"))))), meaningNote(r.meaningChecked), usable ? h("div", { class: "row" }, h("button", { type: "button", class: "small primary", onClick: () => {
                    const chosen = r.paragraphs.filter((x, i) => !x.withheld && ticks[i].checked).map((x) => x.text).join("\n\n");
                    if (!chosen) {
                        setStatus("Tick at least one paragraph.", "err");
                        return;
                    }
                    if (body.value.trim() && !confirm("Add the ticked paragraphs at the cursor? Your own text stays."))
                        return;
                    insertText(chosen);
                    if (!headline.value.trim() && !r.headline.withheld && !r.headline.caution)
                        headline.value = r.headline.text;
                    if (!standfirst.value.trim() && !r.standfirst.withheld && !r.standfirst.caution)
                        standfirst.value = r.standfirst.text;
                    save();
                    runChecks();
                    out.replaceChildren(h("p", { class: "status ok" }, "Draft added. Now make it yours: check every line against your notes."));
                } }, body.value.trim() ? "Add ticked paragraphs at the cursor" : "Use the ticked paragraphs"), h("button", { type: "button", class: "small", onClick: () => out.replaceChildren() }, "Discard")) : null);
        });
    });
    return h("div", null, h("p", { class: "hint" }, "Uses the AI on your laptop (Start Inkling). Your text is sent only when you press a button, and nothing changes until you choose."), h("h3", null, "Improve what you have"), h("div", { class: "row" }, fb, hl), h("div", { class: "row" }, instruction, rw), h("h3", null, "Start from your material"), h("div", { class: "row" }, words, fd), out);
}
