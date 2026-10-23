const ABBREVIATIONS = new Set([
    "mr", "mrs", "ms", "dr", "st", "vs", "v", "fc", "afc", "utd", "no", "jr", "sr", "prof", "gk", "etc", "e.g", "i.e", "approx", "min", "mins", "sec", "p", "pp", "ft", "ht",
]);
export function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
/** Split into sentences, keeping exact offsets into the original string. */
export function splitSentences(text) {
    const out = [];
    const re = /[.!?]+["”’')\]]*(?=\s|$)|\n{2,}/g;
    let last = 0;
    let m;
    const push = (end) => {
        let s = last;
        while (s < end && /\s/.test(text[s]))
            s++;
        if (end > s)
            out.push({ start: s, end, text: text.slice(s, end) });
        last = end;
    };
    while ((m = re.exec(text))) {
        const end = m.index + m[0].length;
        if (m[0][0] === ".") {
            const before = text.slice(last, m.index);
            const w = /([A-Za-z.]+)$/.exec(before)?.[1]?.toLowerCase().replace(/\.$/, "") ?? "";
            const initial = /(^|\s)[A-Z]$/.test(before);
            const decimal = /\d$/.test(before) && /^\.\d/.test(text.slice(m.index, m.index + 2));
            if (ABBREVIATIONS.has(w) || initial || decimal)
                continue;
        }
        push(end);
    }
    push(text.length);
    return out;
}
export function splitParagraphs(text) {
    const out = [];
    const re = /\n\s*\n/g;
    let last = 0;
    let m;
    const push = (end) => {
        const seg = text.slice(last, end);
        const trimmed = seg.trim();
        if (trimmed) {
            const start = last + seg.indexOf(trimmed);
            out.push({ start, end: start + trimmed.length, text: trimmed });
        }
    };
    while ((m = re.exec(text))) {
        push(m.index);
        last = m.index + m[0].length;
    }
    push(text.length);
    return out;
}
export function words(text) {
    return text.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu) ?? [];
}
export function wordCount(text) {
    return words(text).length;
}
/** Copy the capitalisation pattern of `src` onto `repl`. */
export function matchCase(src, repl) {
    if (!repl)
        return repl;
    if (src.length > 1 && src === src.toUpperCase() && /[A-Z]/.test(src))
        return repl.toUpperCase();
    if (/^[A-Z]/.test(src))
        return repl[0].toUpperCase() + repl.slice(1);
    return repl;
}
/** Spans of direct quotations. Verified quotes must never be altered by style rules. */
export function quoteSpans(text) {
    const spans = [];
    let open = -1;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === "“") {
            if (open < 0)
                open = i;
        }
        else if (c === "”") {
            if (open >= 0) {
                spans.push({ start: open, end: i + 1, text: text.slice(open, i + 1) });
                open = -1;
            }
        }
        else if (c === '"') {
            if (open < 0)
                open = i;
            else {
                spans.push({ start: open, end: i + 1, text: text.slice(open, i + 1) });
                open = -1;
            }
        }
    }
    return spans;
}
export function fnv1a(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(36);
}
