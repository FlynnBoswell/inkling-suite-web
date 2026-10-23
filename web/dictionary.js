import { parseFrequency, parseLexicon } from "../core/lexicon.js";
/** The spelling dictionary (1.6 MB) and word-frequency list, loaded once on first use and then cached for offline use. */
export const dict = {};
let loading;
export function loadDictionary() {
    loading ??= (async () => {
        try {
            dict.lexicon = parseLexicon(await (await fetch("words-en.txt")).text());
        }
        catch { /* spelling falls back to common typos */ }
        try {
            dict.common = parseFrequency(await (await fetch("words-common.txt")).text());
        }
        catch { /* ranking by edit distance only */ }
    })();
    return loading;
}
