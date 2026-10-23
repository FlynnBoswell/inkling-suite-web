/**
 * Small writer preferences kept in this browser: Inkling's personal dictionary and how thorough its checks are.
 * The dictionary travels with exports and automatic backups, so it is never lost with the browser.
 */
const WORDS_KEY = "inkling-suite.dictionary";
const DEPTH_KEY = "inkling-suite.check-depth";
const MAX_WORDS = 2000;
const cleanWord = (w) => (typeof w === "string" && /^[\p{L}\p{N}'’.-]{1,60}$/u.test(w.trim()) ? w.trim() : null);
export function myWords() {
    try {
        const v = JSON.parse(localStorage.getItem(WORDS_KEY) ?? "[]");
        return Array.isArray(v) ? v.map(cleanWord).filter((x) => !!x) : [];
    }
    catch {
        return [];
    }
}
function setWords(words) { try {
    localStorage.setItem(WORDS_KEY, JSON.stringify([...new Set(words)].slice(-MAX_WORDS)));
}
catch { /* private window: lasts for this visit only */ } }
export const addWord = (w) => { const c = cleanWord(w); if (c)
    setWords([...myWords(), c]); };
export const removeWord = (w) => setWords(myWords().filter((x) => x !== w));
export function checkDepth() { try {
    const v = localStorage.getItem(DEPTH_KEY);
    return v === "minimal" || v === "thorough" ? v : "balanced";
}
catch {
    return "balanced";
} }
export function setCheckDepth(v) { try {
    localStorage.setItem(DEPTH_KEY, v);
}
catch { /* private window */ } }
/** What goes into an export file next to the records. */
export const exportPrefs = () => ({ dictionary: myWords() });
/** Merge the dictionary from an export file (words are only ever added). Returns how many were new. */
export function importPrefs(json) {
    const words = json?.preferences?.dictionary;
    if (!Array.isArray(words))
        return 0;
    const have = new Set(myWords());
    const fresh = words.map(cleanWord).filter((w) => !!w && !have.has(w));
    if (fresh.length)
        setWords([...have, ...fresh]);
    return new Set(fresh).size;
}
