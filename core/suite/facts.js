import { splitSentences } from "../text.js";
/**
 * Names and numbers checked against material: the shared guard that keeps AI output (and the writer's own copy, on
 * request) tied to what the sources actually say. Plain text matching, no AI.
 */
// Ordinary words that often open a sentence in a post (calls to action and linking words); never names.
const SENTENCE_WORDS = /^(link|read|watch|listen|share|save|follow|tell|vote|drop|comment|reply|swipe|tap|click|find|see|check|don't|do|did|has|have|had|its|for|from|with|without|after|over|under|full|more|plus|again|back|well|never|always|some|any|another|great|good|huge|massive|welcome|thanks|thank|congratulations|well|still|everything|nothing|something|nobody|everyone|let's|is|was|are|were|will|can|could|should|would|may|might|must|if|as|because|since|though|although|or|nor|yet|so|meanwhile|plus|instead|indeed|sadly|finally|together|ready|more)$/i;
const SKIP = new Set(["now", "then", "today", "tonight", "tomorrow", "yesterday", "here", "this", "these", "those", "we", "you", "i", "our", "your", "my", "me", "us", "them", "so", "yes", "no", "not", "just", "only", "still", "even", "more", "most", "why", "how", "where", "can", "could", "should", "would", "will", "is", "are", "was", "were", "big", "huge", "full", "new", "every", "all", "one", "two", "three", "time", "next", "last", "first", "what's", "here's", "i'm", "i've", "i'll", "i'd", "we're", "we've", "they're", "you're", "he's", "it's", "that's", "the", "a", "an", "he", "she", "they", "it", "his", "her", "their", "in", "on", "at", "after", "before", "and", "but", "this", "that", "there", "both", "according", "however", "also", "while", "when", "who", "which", "what", "fa", "cup",
    // Club-name endings: "Aldershot Town" is supported by a source that says "Aldershot".
    "town", "city", "united", "rovers", "athletic", "albion", "wanderers", "county", "fc", "afc", "borough", "rangers", "villa", "orient", "argyle", "alexandra"]);
/**
 * Names and numbers in `statement` (capitalised words other than the first, numbers, scores) that do not appear in
 * `evidence`. Used to hold back AI statements that say more than their cited words.
 */
/** Lets the guard tell ordinary words from names at the start of a sentence (set where a dictionary is loaded). */
let wordCheck = null;
export function setWordCheck(fn) { wordCheck = fn; }
export function unsupported(statement, evidence) {
    const fold = (s) => s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[‘’]/g, "'").replace(/[–—]/g, "-");
    const ev = fold(evidence);
    const out = new Set();
    for (const m of statement.matchAll(/(?<=^|[\s(“"'])([£$€]?\d[\d,.:%-]*\d(?:m|k|bn)?|[£$€]?\d(?:m|k|bn)?|\p{Lu}[\p{L}'’-]+)/gu)) {
        const tok = m[1].replace(/[.,:;!?]+$/, "").replace(/['’]s?$/, "").replace(/['’]$/, "");
        // "3 things:", "5 reasons": a list count, not a fact.
        if (/^\d{1,2}$/.test(tok) && /^\s+(?:things|reasons|ways|takeaways|talking points|questions|lessons|moments|stats)\b/i.test(statement.slice(m.index + m[0].length)))
            continue;
        // The first word of each sentence is capitalised anyway; later sentences only skip ordinary words, so a made-up name still shows.
        // With a dictionary, a first word that is not an ordinary word (like "Kenny") is still checked.
        // Curly or straight apostrophes alike; "You've", "They're", "I'd" are never names.
        const low = tok.toLowerCase().replace(/’/g, "'");
        const plain = SKIP.has(low) || /^(?:i|you|we|they|he|she|it|that|there|who|what|let)'(?:ve|re|ll|d|m|s)$/.test(low) || /^[a-z]+n't$/.test(low);
        if (!/\d/.test(tok) && m.index === 0 && (!wordCheck || wordCheck(low) || plain))
            continue;
        // At the start of a later sentence: ordinary words ("Raw and honest.") are skipped too, as for the first word.
        if (/[.!?…]["”’')]?\s+(?:\p{Extended_Pictographic}\uFE0F?\s*)*$/u.test(statement.slice(0, m.index)) && (SENTENCE_WORDS.test(tok.replace(/’/g, "'")) || (!/\d/.test(tok) && wordCheck?.(low))))
            continue;
        if (plain)
            continue;
        const numberWords = { "1": "one", "2": "two", "3": "three", "4": "four", "5": "five", "6": "six", "7": "seven", "8": "eight", "9": "nine", "10": "ten" };
        // Money written another way is the same figure (£500,000, £500k, £0.5m, 500,000 pounds).
        const money = moneyValue(tok);
        if (money !== null && moneyIn(evidence).some((v) => Math.abs(v - money) < 0.5))
            continue;
        // Numbers must match whole ("1" is not found inside "19").
        const found = /\d/.test(tok) ? new RegExp(`(^|[^\\d.,])${fold(tok).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\d]|[.,]\\d)`).test(ev) : ev.includes(fold(tok));
        if (!found && !(numberWords[tok] && ev.includes(numberWords[tok])))
            out.add(tok);
    }
    return [...out];
}
const CALENDAR = /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december)$/i;
/**
 * Sentences of an article whose names and numbers are not found anywhere in the project's material (saved quotes,
 * research, notes, sources). Not an error: the writer may have seen it themselves. A prompt to double-check.
 */
export function factGaps(article, material) {
    const out = [];
    for (const sp of splitSentences(article)) {
        const raw = article.slice(sp.start, sp.end);
        const sentence = raw.trim();
        if (sentence.length < 12)
            continue;
        // Only what could be a wrong fact: numbers, and names that are not ordinary words ("East Bank", "Stadium" are left alone).
        const missing = unsupported(sentence, material).filter((t) => !CALENDAR.test(t) && (/\d/.test(t) || !wordCheck?.(t.toLowerCase())));
        if (missing.length) {
            const start = sp.start + raw.indexOf(sentence);
            out.push({ start, end: start + sentence.length, sentence, missing });
        }
    }
    return out;
}
/**
 * Title Case to sentence case, the British newspaper style: a capitalised ordinary word is lowered unless the source
 * has it capitalised (then it is a name). Leaves text alone unless most words are capitalised.
 */
export function sentenceCase(text, source, isWord) {
    const words = text.match(/\p{L}[\p{L}'’-]*/gu) ?? [];
    const main = words.filter((w) => !/^(a|an|the|and|or|of|in|on|at|to|for|by|with|as|v|vs)$/i.test(w)); // small words are lower case even in Title Case
    if (main.length < 3 || main.filter((w) => /^\p{Lu}/u.test(w)).length / main.length < 0.75)
        return text;
    return text.replace(/\p{L}[\p{L}'’-]*/gu, (w, off) => {
        if (off === 0 || /(^|[:.!?]\s*["“‘]?|["“‘])$/.test(text.slice(0, off).trimEnd()) || !/^\p{Lu}\p{Ll}/u.test(w))
            return w; // first words and acronyms stay
        const base = w.replace(/['’]s?$/, "");
        if (new RegExp(`(^|[^\\p{L}])${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "u").test(source))
            return w; // capitalised in the source: a name
        return base.split("-").every((p) => isWord(p.toLowerCase())) ? w.toLowerCase() : w;
    });
}
/** "Aldershot Town 2 Woking 1" also supports "2-1" (and "1-2"): adds the scorelines a results line implies. */
export function withScorelines(text) {
    const scores = [...text.matchAll(/\p{Lu}[\p{L}'’.]*(?:\s+\p{Lu}[\p{L}'’.]*)*\s+(\d{1,2})\s*[,–-]?\s+\p{Lu}[\p{L}'’.]*(?:\s+\p{Lu}[\p{L}'’.]*)*\s+(\d{1,2})(?!\d)/gu)].map((m) => `${m[1]}-${m[2]} ${m[2]}-${m[1]}`);
    return scores.length ? `${text}\n${scores.join(" ")}` : text;
}
/** "The Owners" → "The owners": capitalised ordinary words in a short option are lowered unless the source has them capitalised (a name). */
export function softCase(text, source, isWord) {
    return text.replace(/\p{Lu}\p{Ll}+/gu, (w, off) => (off === 0 || new RegExp(`(^|[^\\p{L}])${w}(?![\\p{L}])`, "u").test(source) || !isWord(w.toLowerCase()) ? w : w.toLowerCase()));
}
/** The value of a money figure like "£500k", "£1.2m", "€2bn" or "£500,000"; null when it is not money. */
export function moneyValue(token) {
    const m = /^[£$€]\s?(\d[\d,]*(?:\.\d+)?)\s?(k|m|bn)?$/i.exec(token.trim());
    if (!m)
        return null;
    const n = Number(m[1].replace(/,/g, ""));
    if (!Number.isFinite(n))
        return null;
    return n * ({ k: 1e3, m: 1e6, bn: 1e9 }[(m[2] ?? "").toLowerCase()] ?? 1);
}
/** Every money figure in a text, as values ("£500,000", "£2.5 million", "£750"). */
function moneyIn(text) {
    return [...text.matchAll(/[£$€]\s?(\d[\d,]*(?:\.\d+)?)\s?(k|m|bn|million|billion|thousand)?\b/gi)].map((m) => {
        const n = Number(m[1].replace(/,/g, ""));
        const u = (m[2] ?? "").toLowerCase();
        return n * (u === "k" || u === "thousand" ? 1e3 : u === "m" || u === "million" ? 1e6 : u === "bn" || u === "billion" ? 1e9 : 1);
    }).filter((n) => Number.isFinite(n));
}
/** "Exclusive" or "Breaking" on a story that does not say so: a claim about the reporting itself, never added by the AI. */
export function falseLabel(text, source) {
    const label = /\b(exclusive|breaking)\b/i.exec(text)?.[1];
    return label && !new RegExp(`\\b${label}\\b`, "i").test(source) ? label : "";
}
