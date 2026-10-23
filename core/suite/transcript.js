/**
 * Transcripts with timestamps: "[mm:ss] Speaker: words" lines, as written by Quill's transcription and its
 * timed notes. Pure helpers so they can be tested without a browser.
 */
export function formatStamp(sec) {
    const s = Math.max(0, Math.floor(sec));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    return (h ? `${h}:${String(m).padStart(2, "0")}` : String(m).padStart(2, "0")) + `:${String(r).padStart(2, "0")}`;
}
export function parseStamp(stamp) {
    const m = /^(?:(\d+):)?(\d{1,2}):(\d{2})$/.exec(stamp.trim());
    if (!m)
        return null;
    return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}
const LINE = /^\[((?:\d+:)?\d{1,2}:\d{2})\]\s*(?:([^:\n]{1,60}):\s)?/;
/** Lines for the original transcript. Consecutive segments by the same speaker are joined into one line. */
export function transcriptText(segments) {
    const out = [];
    let last = "";
    for (const s of segments) {
        const words = s.text.replace(/\s+/g, " ").trim();
        if (!words)
            continue;
        if (s.speaker === last && out.length)
            out[out.length - 1] += " " + words;
        else
            out.push(`[${formatStamp(s.start)}] ${s.speaker ? s.speaker + ": " : ""}${words}`);
        last = s.speaker;
    }
    return out.join("\n");
}
/** The time (seconds) of the line that contains character `index`, or null if that line has no timestamp. */
export function stampAt(transcript, index) {
    const start = transcript.lastIndexOf("\n", Math.max(0, index - 1)) + 1;
    const m = LINE.exec(transcript.slice(start, start + 80));
    return m ? parseStamp(m[1]) : null;
}
/** A selection with any "[mm:ss] Speaker:" prefixes taken out, so a quote is only the spoken words. */
export function spokenWords(selection) {
    return selection.split("\n").map((l) => l.replace(LINE, "")).join(" ").replace(/\s+/g, " ").trim();
}
/** The speaker named on the line that contains character `index`, if any. */
export function speakerAt(transcript, index) {
    const start = transcript.lastIndexOf("\n", Math.max(0, index - 1)) + 1;
    return LINE.exec(transcript.slice(start, start + 80))?.[2]?.trim() ?? "";
}
/**
 * Whether a quote appears word for word in the transcript's spoken words (ignoring timestamps, speaker names,
 * line breaks, spacing and the style of quotation marks and apostrophes).
 */
export function quoteInTranscript(quote, transcript) {
    const fold = (s) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/\s+/g, " ").trim().toLowerCase();
    const spoken = fold(transcript.split("\n").map((l) => l.replace(LINE, "")).join(" "));
    const q = fold(quote).replace(/^["']|["']$/g, "");
    return !!q && spoken.includes(q);
}
// ----- help with machine transcripts -----
const letters = (s) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z]/g, "");
function distance(a, b) {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++)
        d[0][j] = j;
    for (let i = 1; i <= a.length; i++)
        for (let j = 1; j <= b.length; j++)
            d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
}
/**
 * Words in `text` that sound like one of `names` but are spelt differently, such as "Ninoa De Maliki" for
 * "Nino Adom-Malaki" or "Dananga" for "Dinanga". Runs of one to four words are compared letter by letter with each
 * full name and each surname; a close match (at least about 75% the same) that is not already correct is offered.
 */
export function nameFixes(text, names) {
    const words = [...text.matchAll(/[\p{L}'’-]+/gu)].map((m) => ({ w: m[0], i: m.index }));
    const targets = [...new Set(names.flatMap((n) => { const parts = n.split(/\s+/).filter(Boolean); return parts.length > 1 ? [n, parts.at(-1)] : [n]; }))].filter((n) => letters(n).length >= 5);
    const out = [];
    const taken = [];
    for (const target of targets.sort((a, b) => b.length - a.length)) {
        const want = letters(target);
        let best = null;
        for (let i = 0; i < words.length; i++)
            for (let n = 1; n <= 4 && i + n <= words.length; n++) {
                const a = words[i].i, b = words[i + n - 1].i + words[i + n - 1].w.length;
                const from = text.slice(a, b);
                if (!/^\p{Lu}/u.test(from))
                    continue; // names start with a capital
                const got = letters(from);
                if (Math.abs(got.length - want.length) > Math.max(2, want.length * 0.3))
                    continue;
                const score = 1 - distance(got, want) / Math.max(got.length, want.length);
                if (score >= 0.75 && got !== want && (!best || score > best.score))
                    best = { from, score, a, b };
            }
        if (best && !taken.some(([x, y]) => best.a < y && best.b > x) && !text.includes(target)) {
            out.push({ from: best.from, to: target });
            taken.push([best.a, best.b]);
        }
    }
    return out;
}
/** A first guess at who is speaking: lines that end with a question are the interviewer's, the rest the interviewee's. */
export function guessSpeaker(text, interviewee) {
    return /\?\s*$/.test(text.trim()) ? "Interviewer" : interviewee;
}
/** Which planned questions were asked: an interviewer line sharing most of a question's key words. */
export function askedQuestions(transcript, questions) {
    const key = (s) => new Set(s.toLowerCase().replace(/[^\p{L}\d\s]/gu, " ").split(/\s+/).filter((w) => w.length > 3));
    const asked = transcript.split("\n").filter((l) => /^\[[\d:]+\]\s*Interviewer:/.test(l)).map((l) => key(l));
    return questions.filter((q) => { const k = key(q.text); if (k.size < 2)
        return false; return asked.some((a) => [...k].filter((w) => a.has(w)).length / k.size >= 0.6); }).map((q) => q.id);
}
