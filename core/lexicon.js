export function parseLexicon(text) {
    return new Set(text.split("\n").map((w) => w.trim()).filter(Boolean));
}
/** Real British words missing from a US dictionary. */
const UK_EXTRA = new Set(["whilst", "amongst", "learnt", "spelt", "burnt", "dreamt", "smelt", "spilt", "leant", "fulfil", "skilful", "wilful", "enrol", "instal", "mum", "mums", "kerb", "kerbs", "cheque", "cheques", "tyre", "tyres", "storey", "storeys", "programme", "programmes", "ageing", "judgement", "judgements", "acknowledgement", "sceptic", "sceptics", "sceptical", "jewellery", "aluminium", "pyjamas", "plough", "grey", "greyer", "greyest", "offence", "offences", "defence", "defences", "licence", "licences", "practise", "practised", "practising", "tonne", "tonnes", "footballing", "unbeaten", "midfielder", "midfielders", "nutmegged", "nutmegging", "offside", "onside"]);
const UK_TO_US = [
    [/our/, "or"], [/re$/, "er"], [/res$/, "ers"], [/red$/, "ered"], [/ence$/, "ense"], [/ences$/, "enses"], [/is(e|ed|es|ing|ation|ations)$/, "iz$1"],
    [/ys(e|ed|es|ing)$/, "yz$1"], [/ll(ed|ing|er|ers)$/, "l$1"], [/ogue(s?)$/, "og$1"], [/ae/, "e"], [/oe/, "e"], [/mme(s?)$/, "m$1"],
    [/is(er|ers)$/, "iz$1"], [/oeuvr/, "euver"], [/ph(ur)/, "f$1"], [/ould$/, "old"], [/osy$/, "ozy"], [/ful$/, "full"], [/ement(s?)$/, "ment$1"], [/ium$/, "um"], [/ised$/, "ized"],
];
function usForms(w) { return UK_TO_US.map(([re, to]) => w.replace(re, to)).filter((x) => x !== w); }
export function isKnownWord(lex, word, british) {
    const w = word.toLowerCase();
    if (lex.has(w))
        return true;
    if (!british)
        return false;
    if (UK_EXTRA.has(w))
        return true;
    return usForms(w).some((f) => lex.has(f));
}
export function parseFrequency(text) {
    const out = new Map();
    let tier = 1;
    for (const line of text.split("\n")) {
        const w = line.trim();
        if (!w)
            continue;
        if (w.startsWith("#")) {
            tier = Number(w.slice(1)) || tier;
            continue;
        }
        out.set(w, tier);
    }
    return out;
}
/** An ordinary English word (in the common-words list, allowing plurals and verb endings), as opposed to a name. */
export function isCommonWord(common, word) {
    const w = word.toLowerCase().replace(/['’]s$/, "");
    if (common.has(w))
        return true;
    // Plurals and verb endings, with a long enough stem that "Woking" is not "wok" + "ing".
    return [w.replace(/s$/, ""), w.replace(/es$/, ""), w.replace(/ies$/, "y"), w.replace(/ed$/, ""), w.replace(/ed$/, "e"), w.replace(/ing$/, ""), w.replace(/ing$/, "e"), w.replace(/([b-df-hj-np-tv-z])\1(ed|ing)$/, "$1")].some((f) => f !== w && f.length >= 4 && common.has(f));
}
const ALPHA = "abcdefghijklmnopqrstuvwxyz";
const VOWEL = /[aeiouy]/;
/**
 * Every single edit of `w` with a typing-error cost. Vowel confusions (definately, seperate) and doubled
 * letters are the commonest real misspellings, so they cost less. Changing the first letter is rare, so it costs more.
 */
function edits1(w, softOnly = false) {
    const out = [];
    const doubled = (i, c) => c === w[i - 1] || c === w[i];
    if (!softOnly)
        for (let i = 0; i < w.length - 1; i++)
            out.push([w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2), 1]); // transposition
    for (let i = 1; i < w.length; i++) { // deletion (first letter: see below)
        const soft = w[i] === w[i - 1] || w[i] === w[i + 1] || VOWEL.test(w[i]);
        if (soft || !softOnly)
            out.push([w.slice(0, i) + w.slice(i + 1), w[i] === w[i - 1] || w[i] === w[i + 1] ? 0.8 : i === w.length - 1 ? 2.2 : 1.6]);
    }
    for (let i = 1; i < w.length; i++)
        for (const c of ALPHA) { // substitution
            if (c === w[i])
                continue;
            const soft = VOWEL.test(c) && VOWEL.test(w[i]);
            if (soft || !softOnly)
                out.push([w.slice(0, i) + c + w.slice(i + 1), soft ? 0.7 : 1.8]);
        }
    for (let i = 1; i <= w.length; i++)
        for (const c of ALPHA) { // insertion
            const soft = doubled(i, c) || VOWEL.test(c);
            if (soft || !softOnly)
                out.push([w.slice(0, i) + c + w.slice(i), doubled(i, c) ? 1 : VOWEL.test(c) ? 0.9 : 1.6]);
        }
    if (!softOnly) { // first-letter mistakes are rare
        out.push([w.slice(1), 3]);
        for (const c of ALPHA) {
            if (c !== w[0])
                out.push([c + w.slice(1), 3]);
            out.push([c + w, 3]);
        }
    }
    return out;
}
const BONUS = [0, 2, 0.8]; // by frequency tier: common words are far likelier to be what the writer meant
const cache = new Map();
/**
 * Candidate corrections, best first. Only real dictionary words are returned.
 * One-edit candidates come from the whole dictionary; two-edit candidates only from common words
 * (with `freq`), which finds "definitely" for "definatly" without inventing matches for unusual words.
 */
export function suggestWords(lex, word, british, max = 4, freq) {
    const w = word.toLowerCase();
    const key = `${british ? 1 : 0}${freq ? 1 : 0}${max}:${w}`;
    const hit = cache.get(key);
    if (hit)
        return hit;
    const found = new Map();
    const score = (c, cost) => cost - (BONUS[freq?.get(c) ?? 0] ?? 0);
    const consider = (c, cost) => { const s = score(c, cost); if (c !== w && (!found.has(c) || found.get(c) > s))
        found.set(c, s); };
    const e1 = edits1(w);
    for (const [c, cost] of e1)
        if (isKnownWord(lex, c, british))
            consider(c, cost);
    // Two edits only of the classic misspelling kind (wrong/missing vowels, doubled letters), and only to common words.
    if (freq && w.length >= 5) {
        for (const [a, c1] of edits1(w, true))
            for (const [c, c2] of edits1(a, true))
                if (freq.has(c) && lex.has(c))
                    consider(c, c1 + c2 + 0.2);
    }
    const res = [...found.entries()].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0])).slice(0, max).map(([c]) => c);
    if (cache.size > 2000)
        cache.clear();
    cache.set(key, res);
    return res;
}
