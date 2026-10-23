import { analyse } from "../engine.js";
/** Edit distance with adjacent swaps (Damerau-Levenshtein, optimal string alignment). */
export function editDistance(a, b) {
    const m = a.length, n = b.length;
    const d = Array.from({ length: m + 1 }, (_, i) => [i, ...new Array(n).fill(0)]);
    for (let j = 1; j <= n; j++)
        d[0][j] = j;
    for (let i = 1; i <= m; i++)
        for (let j = 1; j <= n; j++) {
            const c = a[i - 1] === b[j - 1] ? 0 : 1;
            d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
            if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
                d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
        }
    return d[m][n];
}
const fold = (s) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const WORD = /\p{L}[\p{L}'’-]*/gu;
/**
 * Words on the graphic that look like a misspelt project name: close to a name part (e.g. "Smyth" v "Smith",
 * "Aldershott" v "Aldershot") but not the same, and not a normal dictionary word.
 */
export function nameIssues(fields, names, lexicon) {
    const parts = new Map(); // folded part → the name it belongs to
    for (const n of names)
        for (const p of n.match(WORD) ?? [])
            if (p.length >= 4)
                parts.set(fold(p), n);
    const out = [];
    const seen = new Set();
    for (const f of fields)
        for (const m of f.text.matchAll(WORD)) {
            const w = m[0];
            const fw = fold(w).replace(/['’]s$/, "");
            if (w.length < 4 || !/^\p{Lu}/u.test(w) || parts.has(fw) || seen.has(fw))
                continue;
            if (lexicon?.has(fw))
                continue; // an ordinary word, e.g. "Smith" the trade is fine anyway
            let best = null;
            let bestD = 99;
            for (const [p, name] of parts) {
                const d = editDistance(fw, p);
                const allowed = p.length >= 8 ? 2 : 1;
                if (d > 0 && d <= allowed && d < bestD) {
                    best = [p, name];
                    bestD = d;
                }
            }
            if (best) {
                seen.add(fw);
                const right = (best[1].match(WORD) ?? []).find((x) => fold(x) === best[0]) ?? best[0];
                out.push({ level: "fix", field: f.label, text: `“${w}” looks like a misspelling of “${right}” (${best[1]} in this project).`, ...(f.quote ? {} : { from: w, to: right, start: m.index, end: m.index + w.length }) });
            }
        }
    return out;
}
/** Spelling, grammar and punctuation for each field, plus the name check. */
export function graphicTextChecks(fields, opts) {
    const dictionary = [...new Set(opts.names.flatMap((n) => n.match(WORD) ?? []))];
    const out = [];
    for (const f of fields) {
        if (!f.text.trim())
            continue;
        const res = analyse(f.text, 0, { mode: "football-news", lexicon: opts.lexicon, commonWords: opts.common, dictionary });
        for (const s of res.suggestions) {
            // Graphics are not prose: skip style advice (sentence length, passive voice...) and keep real errors.
            if (!["spelling", "grammar", "punctuation"].includes(s.category))
                continue;
            if (s.ruleId === "sentence-start-capital" || /full stop|missing.*period|end with/i.test(s.title))
                continue; // headlines often have no full stop
            const where = `“${s.original}”${s.replacement !== null ? ` → “${s.replacement}”` : ""}`;
            out.push(f.quote
                ? { level: "consider", field: f.label, text: `${f.label}: ${s.title} (${where}). This is a quotation: check it against the saved quote or recording, do not just change it.` }
                : { level: s.category === "spelling" ? "fix" : "consider", field: f.label, text: `${f.label}: ${s.title} (${where}).`, ...(s.replacement !== null ? { from: s.original, to: s.replacement, start: s.start, end: s.end } : {}) });
        }
    }
    return [...out, ...nameIssues(fields, opts.names, opts.lexicon).filter((n) => !out.some((o) => o.from === n.from && o.field === n.field))];
}
