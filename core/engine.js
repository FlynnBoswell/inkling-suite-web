import { isAnalysable, languageInfo, unsupportedNotice } from "./languages.js";
import { FOOTBALL_RULES, FOOTBALL_TERMS } from "./rules-football.js";
import { GENERAL_RULES } from "./rules-general.js";
import { EXTRA_RULES } from "./rules-extra.js";
import { fnv1a, quoteSpans, splitParagraphs, splitSentences } from "./text.js";
import { MAX_ANALYSIS_CHARS, isFootballMode } from "./types.js";
export const ALL_RULES = [...GENERAL_RULES, ...EXTRA_RULES, ...FOOTBALL_RULES];
export const RULE_META = Object.fromEntries(ALL_RULES.map((r) => [r.meta.id, r.meta]));
export const DEFAULT_OPTIONS = { language: "en-GB", mode: "general", tone: "neutral", intensity: "balanced", dictionary: [] };
const RANK = { minimal: 0, balanced: 1, thorough: 2 };
function shown(meta, intensity, promoted) {
    if (meta.severity === "error")
        return true;
    if (promoted.has(meta.id))
        return true;
    return RANK[meta.minIntensity] <= RANK[intensity];
}
function applies(meta, opts) {
    const football = isFootballMode(opts.mode);
    if (meta.footballOnly && !football)
        return false;
    if (meta.modes && !meta.modes.includes(opts.mode))
        return false;
    if (meta.ukOnly && opts.language !== "en-GB")
        return false;
    return true;
}
/**
 * Analyse text synchronously and locally. No network, no AI.
 * Every suggestion carries the document `version` it was computed from so that
 * stale suggestions can never be applied (see apply.ts).
 */
export function analyse(input, version, options = {}) {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const notices = [];
    if (!isAnalysable(opts.language)) {
        return { version, language: opts.language, suggestions: [], notices: [unsupportedNotice(opts.language)], truncated: false };
    }
    if (languageInfo(opts.language)?.status === "partial")
        notices.push("US English support is partial: British-spelling and some UK football conventions are switched off.");
    let text = input;
    let truncated = false;
    if (text.length > MAX_ANALYSIS_CHARS) {
        text = text.slice(0, MAX_ANALYSIS_CHARS);
        truncated = true;
        notices.push(`Only the first ${MAX_ANALYSIS_CHARS.toLocaleString("en-GB")} characters were checked.`);
    }
    const dict = new Set([...opts.dictionary.map((w) => w.toLowerCase()), ...FOOTBALL_TERMS.map((t) => t.toLowerCase())]);
    const userDict = new Set(opts.dictionary.map((w) => w.toLowerCase()));
    const disabled = new Set(opts.disabledRules ?? []);
    const promoted = new Set(opts.promotedRules ?? []);
    const ctx = { text, opts, dict, sentences: splitSentences(text), paragraphs: splitParagraphs(text), quotes: quoteSpans(text), football: isFootballMode(opts.mode) };
    const found = [];
    for (const rule of ALL_RULES) {
        if (disabled.has(rule.meta.id) || !applies(rule.meta, opts) || !shown(rule.meta, opts.intensity, promoted))
            continue;
        let hits;
        try {
            hits = rule.run(ctx);
        }
        catch {
            notices.push(`Rule “${rule.meta.title}” failed and was skipped.`);
            continue;
        }
        for (const hit of hits) {
            if (hit.start < 0 || hit.end > text.length || hit.end <= hit.start)
                continue;
            const original = text.slice(hit.start, hit.end);
            if (userDict.has(original.toLowerCase()))
                continue; // the user's own dictionary always wins
            if (!rule.meta.allowInQuotes && ctx.quotes.some((q) => hit.start >= q.start && hit.end <= q.end))
                continue; // never touch quoted speech
            if (hit.replacement !== null && hit.replacement === original)
                continue;
            found.push({ meta: rule.meta, hit });
        }
    }
    // Resolve overlaps among inline suggestions: errors first, then earlier, then shorter.
    const inline = found.filter((f) => !f.meta.block).sort((a, b) => (a.meta.severity === b.meta.severity ? 0 : a.meta.severity === "error" ? -1 : 1) || a.hit.start - b.hit.start || a.hit.end - b.hit.end);
    const kept = [];
    for (const f of inline)
        if (!kept.some((k) => f.hit.start < k.hit.end && f.hit.end > k.hit.start))
            kept.push(f);
    const all = [...kept, ...found.filter((f) => f.meta.block)];
    const suggestions = all.map(({ meta, hit }) => {
        const original = text.slice(hit.start, hit.end);
        return {
            id: `${meta.id}:${hit.start}-${hit.end}:${fnv1a(original)}`,
            ruleId: meta.id, category: meta.category, severity: meta.severity, start: hit.start, end: hit.end, original,
            replacement: hit.replacement, title: hit.title ?? meta.title, explanation: hit.explanation, basis: meta.basis, kbRef: meta.kb, docVersion: version,
        };
    }).sort((a, b) => a.start - b.start || a.end - b.end);
    return { version, language: opts.language, suggestions, notices, truncated };
}
