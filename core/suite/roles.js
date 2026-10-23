import { quoteSpans } from "../text.js";
/**
 * Who did what: a plain check (no AI) for the mistake small AI models make most with football news, putting a name
 * with the wrong action ("X and Y were released" when the article says X was released and Y was brought in).
 * For a claim with one transfer or match action, each full name in it must go with that action in the source.
 * It only speaks when the source clearly pairs a name with a different action, so it never guesses.
 */
const FAMILIES = [
    ["released", /\b(?:releas(?:e|ed|es|ing)|let go|freed)\b/gi],
    ["signed", /\b(?:sign(?:ed|s|ing)?|brought in|bring(?:s|ing)? in|recruit(?:ed|s|ing)?|snapped up)\b/gi],
    ["loaned", /\b(?:loan(?:ed|s)?|on loan)\b/gi],
    ["sacked", /\b(?:sack(?:ed|s|ing)?|dismiss(?:ed|es|al)?|fired|parted company)\b/gi],
    ["appointed", /\b(?:appoint(?:ed|s|ment)?|hired)\b/gi],
    ["resigned", /\b(?:resign(?:ed|s|ation)?|stepped down|steps down|quit)\b/gi],
    ["scored", /\b(?:scor(?:ed|es|ing)|netted)\b/gi],
    ["sold", /\b(?:sold|sell(?:s|ing)?)\b/gi],
    ["sent off", /\b(?:sent off|red card(?:ed)?)\b/gi],
];
const CLUB = /\b(?:Town|City|United|Rovers|Athletic|Albion|Wanderers|County|Borough|Rangers|Villa|Orient|Argyle|Alexandra|FC|AFC|Football Club|National League|League)\b/;
function verbsIn(text) {
    const out = [];
    for (const [family, re] of FAMILIES)
        for (const m of text.matchAll(re))
            out.push({ family, word: m[0], at: m.index });
    return out.sort((a, b) => a.at - b.at);
}
/** The action a name goes with in its sentence: the nearest one, before it ("brought in Dan Ellison") or after it ("Tom Jones was sent off"). */
function actionFor(text, at, len) {
    const STOPS = [".", "!", "?", "\n"];
    const bound = (i) => Math.max(...STOPS.map((c) => text.lastIndexOf(c, i)));
    const start = Math.max(bound(at - 1), at - 90) + 1;
    const ends = STOPS.map((c) => text.indexOf(c, at + len)).filter((x) => x > 0);
    const end = Math.min(at + len + 60, ...ends);
    const before = verbsIn(text.slice(start, at)).pop();
    const after = verbsIn(text.slice(at + len, end))[0];
    if (!before || !after)
        return before ?? after;
    const gapBefore = at - (start + before.at + before.word.length), gapAfter = after.at;
    return gapAfter < gapBefore ? after : before;
}
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Names in the claim paired with a different action in the source, as messages ("" list when consistent or unclear). */
export function roleConflicts(claim, source) {
    const claimed = [...new Set(verbsIn(claim).map((v) => v.family))];
    if (claimed.length !== 1)
        return []; // no action, or several: not this check's job
    const family = claimed[0];
    const names = [...new Set([...claim.matchAll(/\p{Lu}\p{Ll}+(?:[ -](?:van |de |da |di )?\p{Lu}[\p{Ll}'’]+)+/gu)].map((m) => m[0]))]
        .filter((n) => !CLUB.test(n) && !/^(?:The|A|An|In|On|At|After|Before|When|While|But|And)\s/.test(n));
    const out = [];
    for (const name of names) {
        // Only names the claim itself ties to its action are judged.
        const mine = actionFor(claim, claim.indexOf(name), name.length);
        if (mine?.family !== family)
            continue;
        let agrees = false;
        let other = null;
        for (const m of source.matchAll(new RegExp(escapeRe(name), "g"))) {
            const v = actionFor(source, m.index, name.length);
            if (!v)
                continue;
            if (v.family === family) {
                agrees = true;
                break;
            }
            other ??= v.word;
        }
        if (!agrees && other)
            out.push(`In the article, ${name} goes with “${other}”, not “${mine.word}”`);
    }
    return out;
}
/**
 * True when the words a claim came from are someone's statement rather than the reporter's: inside quotation marks,
 * in the first person ("I", "we"), or reported speech ("says", "told"). Such a claim is the speaker's, not a checked fact.
 */
export function fromQuotation(source, excerpt) {
    const e = excerpt.trim();
    const at = source.indexOf(e);
    if (at >= 0 && quoteSpans(source).some((sp) => at >= sp.start && at < sp.end))
        return true;
    return /(?:^|[^\p{L}])(?:I|I'm|I’m|I've|I’ve|my|me|we|we're|we’re|our|us)(?![\p{L}'’])/iu.test(e) || /\b(?:says|said|told|tells|claims?|claimed|insists?|insisted|believes?|admitted|according to)\b/i.test(e);
}
