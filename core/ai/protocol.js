export const REWRITE_STYLES = ["clearer", "concise", "natural", "formal", "conversational", "alternative", "flow", "structure"];
export const MAX_AI_TEXT = 6000;
const MODES = ["general", "match-preview", "match-report", "post-match-reaction", "player-feature", "football-news", "tactical-analysis", "football-blog"];
export function validateAiRequest(x) {
    if (typeof x !== "object" || x === null)
        return { ok: false, error: "Body must be a JSON object." };
    const o = x;
    if (!REWRITE_STYLES.includes(o.style))
        return { ok: false, error: "Unknown rewrite style." };
    if (typeof o.text !== "string" || o.text.trim().length === 0)
        return { ok: false, error: "text is required." };
    if (o.text.length > MAX_AI_TEXT)
        return { ok: false, error: `text is longer than ${MAX_AI_TEXT} characters.` };
    if (!MODES.includes(o.mode))
        return { ok: false, error: "Unknown mode." };
    if (typeof o.language !== "string" || o.language.length > 12)
        return { ok: false, error: "Invalid language." };
    const notes = Array.isArray(o.profileNotes) ? o.profileNotes.filter((n) => typeof n === "string").slice(0, 8).map((n) => n.slice(0, 200)) : [];
    return { ok: true, req: { style: o.style, text: o.text, mode: o.mode, language: o.language, profileNotes: notes } };
}
export function validateAiResponse(x) {
    if (typeof x !== "object" || x === null)
        return { ok: false, error: "Response is not an object." };
    const o = x;
    if (typeof o.rewrite !== "string" || o.rewrite.trim().length === 0)
        return { ok: false, error: "Response has no rewrite." };
    if (o.rewrite.length > MAX_AI_TEXT * 2)
        return { ok: false, error: "Rewrite is too long." };
    const list = (v) => (Array.isArray(v) ? v.filter((n) => typeof n === "string").slice(0, 8).map((n) => n.slice(0, 400)) : []);
    return { ok: true, res: { rewrite: o.rewrite, notes: list(o.notes), risks: list(o.risks) } };
}
/** Extract JSON from model output that may be wrapped in a code fence or prose. */
export function parseModelJson(s) {
    const t = s.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    try {
        return JSON.parse(t);
    }
    catch { /* try to find an object */ }
    const a = t.indexOf("{"), b = t.lastIndexOf("}");
    if (a >= 0 && b > a) {
        try {
            return JSON.parse(t.slice(a, b + 1));
        }
        catch {
            return null;
        }
    }
    return null;
}
/**
 * Compare original and rewrite and report anything that factual accuracy depends on:
 * numbers, quoted speech, and capitalised names. Used to warn, never to silently accept.
 */
export function checkPreserved(original, rewrite) {
    const risks = [];
    const nums = (s) => (s.match(/\d+(?:[.,:\-–]\d+)*/g) ?? []).map((n) => n.replace(/–/g, "-"));
    const rn = new Set(nums(rewrite));
    const lostNums = [...new Set(nums(original))].filter((n) => !rn.has(n));
    if (lostNums.length)
        risks.push(`Numbers changed or removed: ${lostNums.join(", ")}. Check scores, minutes, dates and fees.`);
    const addedNums = [...new Set(nums(rewrite))].filter((n) => !new Set(nums(original)).has(n));
    if (addedNums.length)
        risks.push(`New numbers appear that were not in your text: ${addedNums.join(", ")}.`);
    const quotes = (s) => (s.match(/[“"][^”"]{3,}[”"]/g) ?? []).map((q) => q.slice(1, -1).trim());
    const lostQuotes = quotes(original).filter((q) => !rewrite.includes(q));
    if (lostQuotes.length)
        risks.push("A quotation was altered or removed. Quotations must stay word for word.");
    const names = (s) => [...new Set((s.match(/(?<![.!?]\s)(?<!^)\b[A-Z][a-z]{2,}\b/g) ?? []))];
    const lostNames = names(original).filter((n) => !rewrite.includes(n));
    if (lostNames.length)
        risks.push(`Names missing from the rewrite: ${lostNames.slice(0, 5).join(", ")}.`);
    return risks;
}
