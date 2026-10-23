/**
 * Apply a suggestion to the text, but only if it still describes what is there.
 * Both the document version and the exact original text are revalidated.
 */
export function applySuggestion(currentText, currentVersion, s, replacementOverride) {
    const replacement = replacementOverride ?? s.replacement;
    if (replacement === null)
        return { ok: false, reason: "no-replacement" };
    if (s.docVersion !== currentVersion)
        return { ok: false, reason: "stale-version" };
    if (s.start < 0 || s.end > currentText.length || s.start >= s.end)
        return { ok: false, reason: "out-of-range" };
    if (currentText.slice(s.start, s.end) !== s.original)
        return { ok: false, reason: "text-changed" };
    return { ok: true, text: currentText.slice(0, s.start) + replacement + currentText.slice(s.end), delta: replacement.length - (s.end - s.start) };
}
/** Check that a range still holds the text an AI rewrite was requested for. */
export function rangeStillMatches(currentText, start, end, original) {
    return start >= 0 && end <= currentText.length && currentText.slice(start, end) === original;
}
/** The region that differs between two versions of a text (common prefix/suffix removed). */
export function changedRegion(a, b) {
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i])
        i++;
    let j = 0;
    while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] === b[b.length - 1 - j])
        j++;
    return { start: i, oldEnd: a.length - j, newEnd: b.length - j };
}
/**
 * Which earlier suggestions did the writer resolve by editing the text themselves?
 * Conservative on purpose: small edits only, the same kind of issue must not reappear at that spot,
 * and the number of identical suggestions must have gone down.
 */
export function detectManualFixes(oldText, newText, before, after, maxEdit = 40, isKnownWord) {
    if (oldText === newText)
        return [];
    const r = changedRegion(oldText, newText);
    if (r.oldEnd - r.start > maxEdit || r.newEnd - r.start > maxEdit)
        return []; // a big deletion or paste is not a fix
    const key = (s) => `${s.ruleId}|${s.original}`;
    const count = (list, k) => list.filter((s) => key(s) === k).length;
    const fixed = [];
    const seen = new Set();
    for (const s of before) {
        if (!(s.start < r.oldEnd && s.end > r.start) && !(r.oldEnd === r.start && s.start <= r.start && s.end >= r.start))
            continue; // not touched by the edit
        const k = key(s);
        if (seen.has(k))
            continue;
        seen.add(k);
        if (count(after, k) >= count(before, k))
            continue; // still just as many
        if (after.some((n) => (n.ruleId === s.ruleId || n.category === s.category) && n.start < r.newEnd + 1 && n.end > r.start - 1))
            continue; // the same kind of issue is still there
        if (s.category === "spelling" && isKnownWord) {
            // A spelling fix only counts if the writer ended up with a real word (not half-typed gibberish).
            let a = Math.min(r.start, newText.length), b = Math.min(Math.max(r.newEnd, a), newText.length);
            while (a > 0 && /[\p{L}'’-]/u.test(newText[a - 1]))
                a--;
            while (b < newText.length && /[\p{L}'’-]/u.test(newText[b]))
                b++;
            const word = newText.slice(a, b);
            if (word && !isKnownWord(word))
                continue;
        }
        fixed.push(s);
    }
    return fixed;
}
