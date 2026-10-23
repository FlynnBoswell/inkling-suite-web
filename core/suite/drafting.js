/** Text inside quotation marks (curly or straight double quotes). */
export function quotedPassages(body) {
    const out = [];
    const re = /“([^”]{3,})”|"([^"]{3,})"/g;
    let m;
    while ((m = re.exec(body)))
        out.push({ text: (m[1] ?? m[2]), start: m.index });
    return out;
}
const norm = (s) => s.replace(/\s+/g, " ").trim();
export function draftChecks(d, quotes, claims) {
    const out = [];
    const body = norm(d.body);
    for (const id of d.quoteIds) {
        const q = quotes.get(id);
        if (!q || q.deletedAt) {
            out.push({ level: "problem", text: "A linked quote has been deleted. Check the quotation still has a source.", refId: id });
            continue;
        }
        if (q.supersededBy)
            out.push({ level: "problem", text: `This quote's wording was corrected after you used it: “${q.title}”. Use the corrected version.`, refId: id });
        else if (!body.includes(norm(q.title)))
            out.push({ level: "problem", text: `The words of this quote no longer appear exactly in the article: “${q.title}” (${q.speaker}). If you shortened it, mark the cut with an ellipsis and check it keeps the meaning.`, refId: id });
        if (q.uncertain)
            out.push({ level: "caution", text: `${q.speaker}'s quote is marked as uncertain wording. Check it against the recording.`, refId: id });
    }
    // Quotation marks around words that are not one of the saved quotes.
    const saved = [...quotes.values()].filter((q) => !q.deletedAt && !q.supersededBy).map((q) => norm(q.title));
    for (const p of quotedPassages(d.body)) {
        const t = norm(p.text);
        if (t.split(" ").length < 4)
            continue; // short phrases in quote marks are usually titles or terms
        if (!saved.some((s) => s.includes(t) || t.includes(s)))
            out.push({ level: "caution", text: `“${t.length > 80 ? t.slice(0, 80) + "…" : t}” is in quotation marks but is not a saved quote. Check it is verbatim and record where it came from.` });
    }
    for (const id of d.claimIds) {
        const c = claims.get(id);
        if (!c || c.deletedAt) {
            out.push({ level: "problem", text: "A linked research claim has been deleted.", refId: id });
            continue;
        }
        if (c.status === "unverified")
            out.push({ level: "problem", text: `Relies on an unverified claim: “${c.title}”. Verify it or remove it.`, refId: id });
        else if (c.status === "disputed")
            out.push({ level: "problem", text: `Relies on a disputed claim: “${c.title}”. Report the disagreement or leave it out.`, refId: id });
        else if (c.status === "attributed")
            out.push({ level: "caution", text: `“${c.title}” is attributed, not confirmed. Present it as the source's claim, saying who made it.`, refId: id });
    }
    return out;
}
/** Plain checks on a headline; the engine handles the body. */
export function headlineChecks(h) {
    const out = [];
    const t = h.trim();
    if (!t)
        return [{ level: "problem", text: "The article has no headline." }];
    if (t.length > 75)
        out.push({ level: "caution", text: `The headline is ${t.length} characters. Around 55-70 fits most sites and search results.` });
    if (/[.]$/.test(t))
        out.push({ level: "caution", text: "Headlines do not usually end with a full stop." });
    if (t.length > 8 && t === t.toUpperCase())
        out.push({ level: "caution", text: "An all-capitals headline reads as shouting." });
    if (t.split(/\s+/).length < 3)
        out.push({ level: "caution", text: "A very short headline may not tell readers what the story is." });
    return out;
}
export const wordCount = (s) => (s.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length;
/** Insert at a position, adding spaces so words do not run together. */
export function insertAt(body, at, text) {
    const i = Math.max(0, Math.min(at, body.length));
    const before = body.slice(0, i), after = body.slice(i);
    const pre = before && !/\s$/.test(before) ? " " : "";
    const post = after && !/^[\s.,;:!?]/.test(after) ? " " : "";
    const ins = pre + text + post;
    return { body: before + ins + after, caret: i + ins.length - post.length };
}
/** The article as Markdown, with a source list built from the linked claims' evidence and the quotes used. */
export function draftMarkdown(d, p, quotes, claims, sources) {
    const L = [`# ${d.title}`, ""];
    if (d.standfirst)
        L.push(`*${d.standfirst}*`, "");
    L.push(d.body.trim(), "", "---", "", `Project: ${p.title}`, "");
    const srcIds = new Set(d.claimIds.flatMap((id) => claims.get(id)?.evidence.filter((e) => e.stance === "supports").map((e) => e.sourceId) ?? []));
    const srcs = [...srcIds].map((id) => sources.get(id)).filter((s) => !!s && !s.deletedAt);
    if (srcs.length) {
        L.push("Sources:");
        for (const s of srcs)
            L.push(`- ${[s.publisher, s.title].filter(Boolean).join(", ")}${s.url ? " " + s.url : ""}${s.published ? ` (published ${s.published})` : ""}`);
        L.push("");
    }
    const qs = d.quoteIds.map((id) => quotes.get(id)).filter((q) => !!q && !q.deletedAt);
    if (qs.length) {
        L.push("Quotes used:");
        for (const q of qs)
            L.push(`- ${q.speaker}${q.date ? ", " + q.date : ""}${q.origin ? ", " + q.origin : ""}`);
        L.push("");
    }
    return L.join("\n");
}
/** A rough syllable count (vowel groups, minus a silent final "e"), good enough for a readability score. */
function syllables(word) {
    const w = word.toLowerCase().replace(/[^a-z]/g, "");
    if (!w)
        return 0;
    if (w.length <= 3)
        return 1;
    const groups = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "").match(/[aeiouy]{1,2}/g);
    return Math.max(1, groups?.length ?? 1);
}
/**
 * How easy the article is to read: average sentence length, long sentences (over 30 words) and paragraphs (over 70),
 * and the Flesch reading-ease score (higher is easier; most news writing sits around 50 to 70).
 */
export function readingStats(body) {
    const paras = body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    const sentences = paras.flatMap((p) => p.split(/(?<=[.!?]["”’)]?)\s+(?=["“‘(]?[\p{Lu}\d])/u)).map((s) => s.trim()).filter((s) => wordCount(s) > 0);
    const words = wordCount(body);
    const syl = (body.match(/[\p{L}][\p{L}'’-]*/gu) ?? []).reduce((n, w) => n + syllables(w), 0);
    const avgSentence = sentences.length ? words / sentences.length : 0;
    const ease = words ? Math.round(Math.max(0, Math.min(100, 206.835 - 1.015 * avgSentence - 84.6 * (syl / words)))) : 0;
    const easeLabel = !words ? "" : ease >= 70 ? "easy to read" : ease >= 50 ? "plain English" : ease >= 30 ? "fairly hard" : "hard to read";
    return { words, sentences: sentences.length, paragraphs: paras.length, avgSentence: Math.round(avgSentence * 10) / 10, longSentences: sentences.filter((s) => wordCount(s) > 30).length,
        longParagraphs: paras.filter((p) => wordCount(p) > 70).length, ease, easeLabel, minutes: Math.max(1, Math.round(words / 230)) };
}
