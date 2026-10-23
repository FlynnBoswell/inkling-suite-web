import { fnv1a, quoteSpans } from "../text.js";
/**
 * Optional deep grammar checking through LanguageTool (open source, LGPL) running on this computer.
 * Inkling sends text only to the address the writer configured (default http://127.0.0.1:8081), never to
 * LanguageTool's public servers. This module is pure: it builds the request and maps the answer.
 */
export const DEFAULT_LT_ENDPOINT = "http://127.0.0.1:8081";
export const MAX_LT_CHARS = 20_000;
/**
 * Rules switched off: spelling (Inkling's own dictionary check is tuned not to flag names and football terms),
 * and checks that clash with British journalism conventions or Inkling's own style rules.
 */
export const LT_DISABLED_RULES = [
    "MORFOLOGIK_RULE_EN_GB", "MORFOLOGIK_RULE_EN_US", "MORFOLOGIK_RULE_EN_AU", "MORFOLOGIK_RULE_EN_CA",
    "EN_QUOTES", "DASH_RULE", "WHITESPACE_RULE", "PUNCTUATION_PARAGRAPH_END", "UPPERCASE_SENTENCE_START", "EN_UNPAIRED_QUOTES",
    "OXFORD_SPELLING_Z_NOT_S", "OXFORD_SPELLING_ISATION_NOUNS", "OXFORD_SPELLING_ISE_VERBS",
];
export function ltRequestBody(text, language) {
    return new URLSearchParams({ text: text.slice(0, MAX_LT_CHARS), language: language === "en-US" ? "en-US" : "en-GB", disabledRules: LT_DISABLED_RULES.join(","), level: "default" });
}
const CATEGORY = {
    TYPOS: "spelling", GRAMMAR: "grammar", PUNCTUATION: "punctuation", TYPOGRAPHY: "punctuation", CASING: "grammar",
    CONFUSED_WORDS: "word-choice", COLLOCATIONS: "word-choice", SEMANTICS: "clarity", REDUNDANCY: "wordiness",
    STYLE: "style", PLAIN_ENGLISH: "wordiness", REPETITIONS_STYLE: "repetition", MISC: "grammar", NONSTANDARD_PHRASES: "word-choice", BRITISH_ENGLISH: "spelling",
};
const ERROR_CATEGORIES = new Set(["TYPOS", "GRAMMAR", "PUNCTUATION", "CASING", "CONFUSED_WORDS", "COLLOCATIONS", "NONSTANDARD_PHRASES"]);
/**
 * Turn a LanguageTool reply into Inkling suggestions for exactly this text and document version.
 * Anything malformed is dropped. Quoted speech is never touched (a speaker's words are theirs).
 */
export function ltToSuggestions(reply, text, version, dictionary = []) {
    const matches = reply?.matches;
    if (!Array.isArray(matches))
        return [];
    const quotes = quoteSpans(text);
    const dict = new Set(dictionary.map((w) => w.toLowerCase()));
    const out = [];
    for (const m of matches) {
        const start = m.offset, len = m.length;
        if (typeof start !== "number" || typeof len !== "number" || len <= 0 || start < 0 || start + len > text.length)
            continue;
        const end = start + len;
        const original = text.slice(start, end);
        if (quotes.some((q) => start >= q.start && end <= q.end))
            continue;
        if (dict.has(original.toLowerCase()))
            continue;
        const catId = typeof m.rule?.category?.id === "string" ? m.rule.category.id : "MISC";
        const ruleId = typeof m.rule?.id === "string" ? m.rule.id : "UNKNOWN";
        const reps = Array.isArray(m.replacements) ? m.replacements.map((r) => r?.value).filter((v) => typeof v === "string") : [];
        const message = typeof m.message === "string" ? m.message : "Possible problem.";
        const title = typeof m.shortMessage === "string" && m.shortMessage ? m.shortMessage : typeof m.rule?.description === "string" ? m.rule.description : "Grammar";
        const severity = ERROR_CATEGORIES.has(catId) ? "error" : "advice";
        const alt = reps.length > 1 ? ` Other options: ${reps.slice(1, 4).map((r) => `“${r}”`).join(", ")}.` : "";
        out.push({
            id: `lt.${ruleId}:${start}-${end}:${fnv1a(original)}`, ruleId: `lt.${ruleId}`, category: CATEGORY[catId] ?? "grammar", severity,
            start, end, original, replacement: reps[0] ?? null, title: title.slice(0, 80), explanation: (message.replace(/[‘’]/g, "’") + alt).slice(0, 400),
            basis: "grammar-rule", docVersion: version,
        });
    }
    return out;
}
/**
 * Combine Inkling's own suggestions with LanguageTool's. Where they overlap, Inkling's own wins (it knows
 * football conventions and the writer's preferences), unless LanguageTool reports an error where Inkling only advises.
 */
export function mergeSuggestions(own, extra) {
    const kept = [...own];
    for (const s of extra) {
        const clash = kept.findIndex((k) => s.start < k.end && s.end > k.start);
        if (clash < 0) {
            kept.push(s);
            continue;
        }
        const k = kept[clash];
        if (s.severity === "error" && k.severity === "advice" && !(k.end - k.start > 60))
            kept.splice(clash, 1, s); // block-level advice (long spans) stays alongside
        else if (k.end - k.start > 60)
            kept.push(s);
    }
    return kept.sort((a, b) => a.start - b.start || a.end - b.end);
}
