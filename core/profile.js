import { RULE_META } from "./engine.js";
import { splitParagraphs, splitSentences, words } from "./text.js";
export const MIN_EVIDENCE = 3;
export const MIN_SAMPLE_WORDS = 300;
export function emptyContext() {
    return { evidence: {}, explicit: { disabledRules: [], forcedRules: [] }, learned: null };
}
export function emptyProfile(now = Date.now()) {
    return { schema: 1, personalisationEnabled: true, contexts: {}, updatedAt: now };
}
function ctxOf(p, c) {
    return (p.contexts[c] ??= emptyContext());
}
/** Defensive parse: corrupted stored data must never break the extension. */
export function parseProfile(raw) {
    const base = emptyProfile(0);
    if (typeof raw !== "object" || raw === null)
        return base;
    const o = raw;
    if (o.schema !== 1)
        return base;
    const out = { schema: 1, personalisationEnabled: o.personalisationEnabled !== false, contexts: {}, updatedAt: Number(o.updatedAt) || 0 };
    if (o.contexts && typeof o.contexts === "object") {
        for (const [k, v] of Object.entries(o.contexts)) {
            if (!v || typeof v !== "object")
                continue;
            const c = emptyContext();
            for (const [rid, e] of Object.entries(v.evidence ?? {})) {
                if (!e || typeof e !== "object")
                    continue;
                c.evidence[rid] = { accepted: Math.max(0, Number(e.accepted) || 0), dismissed: Math.max(0, Number(e.dismissed) || 0), ignored: Math.max(0, Number(e.ignored) || 0), manual: Math.max(0, Number(e.manual) || 0), lastAt: Number(e.lastAt) || 0 };
            }
            const ex = v.explicit ?? {};
            c.explicit = {
                disabledRules: Array.isArray(ex.disabledRules) ? ex.disabledRules.filter((x) => typeof x === "string") : [],
                forcedRules: Array.isArray(ex.forcedRules) ? ex.forcedRules.filter((x) => typeof x === "string") : [],
                tone: typeof ex.tone === "string" ? ex.tone : undefined,
                maxSentenceWords: typeof ex.maxSentenceWords === "number" ? ex.maxSentenceWords : undefined,
            };
            if (v.learned && typeof v.learned === "object")
                c.learned = v.learned;
            out.contexts[k] = c;
        }
    }
    return out;
}
/** Record one decision. Nothing is recorded when personalisation is off. */
export function recordFeedback(p, context, ruleId, action, now = Date.now()) {
    if (!p.personalisationEnabled || !RULE_META[ruleId])
        return p;
    const c = ctxOf(p, context);
    const e = (c.evidence[ruleId] ??= { accepted: 0, dismissed: 0, ignored: 0, manual: 0, lastAt: 0 });
    e[action] += 1;
    e.lastAt = now;
    p.updatedAt = now;
    return p;
}
/**
 * Turn evidence into preferences.
 * - Hide an *advice* rule after repeated rejection with no acceptance.
 * - Promote a rule that is accepted again and again.
 * - Spelling and grammar errors are never hidden by learning.
 * - Explicit choices always beat learned ones.
 */
export function derivePreferences(p, context) {
    const c = p.contexts[context];
    const out = { disabledRules: [], promotedRules: [], learnedNotes: [] };
    if (!c)
        return out;
    out.disabledRules.push(...c.explicit.disabledRules);
    out.tone = c.explicit.tone;
    out.maxSentenceWords = c.explicit.maxSentenceWords;
    if (p.personalisationEnabled) {
        for (const [rid, e] of Object.entries(c.evidence)) {
            const meta = RULE_META[rid];
            if (!meta)
                continue;
            if (c.explicit.forcedRules.includes(rid) || c.explicit.disabledRules.includes(rid))
                continue;
            const agreed = e.accepted + e.manual; // fixing it by hand shows agreement just like pressing Accept
            const rejected = e.dismissed + e.ignored;
            const total = rejected + agreed;
            if (meta.severity === "advice" && rejected >= MIN_EVIDENCE && (agreed === 0 || (total >= 5 && rejected / total >= 0.8))) {
                out.disabledRules.push(rid);
                out.learnedNotes.push({ ruleId: rid, evidence: total, text: `You have rejected “${meta.title}” ${rejected} time${rejected === 1 ? "" : "s"} and agreed with it ${agreed} time${agreed === 1 ? "" : "s"}, so Inkling now hides it here.` });
            }
            else if (agreed >= MIN_EVIDENCE && agreed / total >= 0.75) {
                out.promotedRules.push(rid);
                out.learnedNotes.push({ ruleId: rid, evidence: total, text: `You usually act on “${meta.title}” (${agreed} of ${total}, counting fixes you made by hand), so Inkling shows it even on the lighter settings.` });
            }
        }
        const l = c.learned;
        if (l && l.sampleWords >= MIN_SAMPLE_WORDS) {
            if (out.maxSentenceWords === undefined) {
                out.maxSentenceWords = Math.min(60, Math.max(25, Math.round(l.p90SentenceWords * 1.15)));
                out.learnedNotes.push({ evidence: l.sampleWords, text: `Your samples average ${l.avgSentenceWords.toFixed(0)} words a sentence (90% are ${l.p90SentenceWords} or shorter), so Inkling only flags sentences longer than ${out.maxSentenceWords} words.` });
            }
        }
    }
    out.disabledRules = [...new Set(out.disabledRules)];
    return out;
}
export function analyseSample(text) {
    const sents = splitSentences(text).map((s) => words(s.text).length).filter((n) => n > 0).sort((a, b) => a - b);
    const paras = splitParagraphs(text).map((s) => words(s.text).length);
    const total = words(text).length || 1;
    const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
    const contractions = (text.match(/\b\w+['’](?:t|re|ve|ll|d|m)\b/gi) ?? []).length;
    const passive = (text.match(/\b(?:was|were|is|are|been|being)\s+\w{3,}(?:ed|en)\s+by\b/gi) ?? []).length;
    const transitions = {};
    for (const s of splitSentences(text)) {
        const w = /^([A-Za-z]+)/.exec(s.text)?.[1]?.toLowerCase();
        if (w && ["however", "meanwhile", "moreover", "furthermore", "overall", "still", "instead", "then", "later", "earlier", "yet", "but", "although", "despite"].includes(w))
            transitions[w] = (transitions[w] ?? 0) + 1;
    }
    return {
        sampleWords: total,
        avgSentenceWords: avg(sents),
        p90SentenceWords: sents.length ? sents[Math.min(sents.length - 1, Math.floor(sents.length * 0.9))] : 0,
        avgParagraphWords: avg(paras),
        contractionRate: (contractions / total) * 100,
        passiveRate: (passive / total) * 100,
        transitions,
    };
}
/** Merge a writing sample into the context's statistics. The text itself is discarded. */
export function addSample(p, context, text, now = Date.now()) {
    if (!p.personalisationEnabled)
        return p;
    const s = analyseSample(text);
    if (s.sampleWords < 20)
        return p;
    const c = ctxOf(p, context);
    const prev = c.learned;
    if (!prev)
        c.learned = { sampleCount: 1, ...s };
    else {
        const w0 = prev.sampleWords, w1 = s.sampleWords, t = w0 + w1;
        const mix = (a, b) => (a * w0 + b * w1) / t;
        const tr = { ...prev.transitions };
        for (const [k, v] of Object.entries(s.transitions))
            tr[k] = (tr[k] ?? 0) + v;
        c.learned = {
            sampleCount: prev.sampleCount + 1, sampleWords: t,
            avgSentenceWords: mix(prev.avgSentenceWords, s.avgSentenceWords), p90SentenceWords: Math.round(mix(prev.p90SentenceWords, s.p90SentenceWords)),
            avgParagraphWords: mix(prev.avgParagraphWords, s.avgParagraphWords), contractionRate: mix(prev.contractionRate, s.contractionRate), passiveRate: mix(prev.passiveRate, s.passiveRate), transitions: tr,
        };
    }
    p.updatedAt = now;
    return p;
}
// ----- Manual controls (explicit choices) -----
export function setRuleEnabled(p, context, ruleId, enabled) {
    const c = ctxOf(p, context);
    c.explicit.disabledRules = c.explicit.disabledRules.filter((r) => r !== ruleId);
    c.explicit.forcedRules = c.explicit.forcedRules.filter((r) => r !== ruleId);
    if (enabled)
        c.explicit.forcedRules.push(ruleId);
    else
        c.explicit.disabledRules.push(ruleId);
    p.updatedAt = Date.now();
    return p;
}
export function setExplicit(p, context, patch) {
    Object.assign(ctxOf(p, context).explicit, patch);
    p.updatedAt = Date.now();
    return p;
}
/** Forget everything learned for a context (evidence + samples) but keep explicit choices. */
export function resetLearned(p, context) {
    const c = p.contexts[context];
    if (c) {
        c.evidence = {};
        c.learned = null;
    }
    p.updatedAt = Date.now();
    return p;
}
export function deleteProfile() { return emptyProfile(); }
/** Plain-English description of everything Inkling currently knows. */
export function describeProfile(p) {
    const out = [];
    for (const context of Object.keys(p.contexts)) {
        const d = derivePreferences(p, context);
        const c = p.contexts[context];
        const lines = d.learnedNotes.map((n) => n.text);
        if (c.explicit.disabledRules.length)
            lines.push(`You switched off: ${c.explicit.disabledRules.map((r) => RULE_META[r]?.title ?? r).join(", ")}.`);
        if (c.explicit.tone)
            lines.push(`Tone for this context: ${c.explicit.tone}.`);
        if (c.learned)
            lines.push(`Based on ${c.learned.sampleCount} writing sample${c.learned.sampleCount === 1 ? "" : "s"} (${c.learned.sampleWords} words): ${c.learned.avgSentenceWords.toFixed(0)} words per sentence, ${c.learned.avgParagraphWords.toFixed(0)} words per paragraph, ${c.learned.contractionRate.toFixed(1)} contractions per 100 words.`);
        if (!lines.length)
            lines.push("Nothing learned yet. Inkling needs a few repeated decisions before it adapts.");
        out.push({ context, lines });
    }
    return out;
}
