/**
 * Ripple: social copy, planning and genuine metrics. Posts are prepared here and published by the writer
 * on the platform itself; Ripple never claims something is scheduled or posted unless the writer confirms it.
 * Platform limits change; these were current guidance when written and are shown as such.
 */
export const PLATFORM_INFO = {
    x: { label: "X (Twitter)", limit: 280, urlLength: 23, hashtags: 2, compose: (t) => "https://x.com/intent/post?text=" + encodeURIComponent(t) },
    bluesky: { label: "Bluesky", limit: 300, hashtags: 2, compose: (t) => "https://bsky.app/intent/compose?text=" + encodeURIComponent(t) },
    threads: { label: "Threads", limit: 500, hashtags: 1, compose: (t) => "https://www.threads.net/intent/post?text=" + encodeURIComponent(t) },
    instagram: { label: "Instagram caption", limit: 2200, hashtags: 5 },
    facebook: { label: "Facebook", limit: 63206, hashtags: 2 },
    linkedin: { label: "LinkedIn", limit: 3000, hashtags: 3 },
};
const URL_RE = /https?:\/\/[^\s]+/g;
/** Characters as the platform counts them (X counts every link as 23). */
export function countChars(text, platform) {
    const info = PLATFORM_INFO[platform];
    const chars = [...text].length;
    if (!info.urlLength)
        return chars;
    return (text.match(URL_RE) ?? []).reduce((n, u) => n - [...u].length + info.urlLength, chars);
}
/**
 * The separate posts of a thread: numbered parts ("1/ …", "2/ …") or parts divided by a line of three dashes.
 * A single post is one part.
 */
export function threadParts(text) {
    const t = text.trim();
    if (!t)
        return [];
    if (/\n-{3,}\n/.test(t))
        return t.split(/\n-{3,}\n/).map((x) => x.trim()).filter(Boolean);
    const numbered = t.split(/\n\s*\n(?=\d{1,2}\/\s)/).map((x) => x.trim()).filter(Boolean);
    return numbered.length > 1 && /^1\/\s/.test(numbered[0]) ? numbered : [t];
}
export function postNotes(p, quotes) {
    const out = [];
    const info = PLATFORM_INFO[p.platform];
    if (!p.text.trim())
        out.push({ level: "problem", text: "The post is empty." });
    // A thread is checked post by post.
    const parts = threadParts(p.text);
    parts.forEach((part, i) => {
        const n = countChars(part, p.platform);
        if (n > info.limit)
            out.push({ level: "problem", text: `${parts.length > 1 ? `Post ${i + 1} of the thread: ` : ""}${n} characters: over the ${info.label} limit of ${info.limit} by ${n - info.limit}.` });
    });
    const tags = p.text.match(/#[\p{L}\p{N}_]+/gu) ?? [];
    if (tags.length > info.hashtags)
        out.push({ level: "caution", text: `${tags.length} hashtags. On ${info.label}, ${info.hashtags} or fewer relevant ones usually read better.` });
    // Any quotation in the post must be a saved quote, word for word.
    const saved = [...quotes.values()].filter((q) => !q.deletedAt && !q.supersededBy).map((q) => q.title.replace(/\s+/g, " ").trim());
    for (const m of p.text.matchAll(/“([^”]{8,})”|"([^"]{8,})"/g)) {
        const t = (m[1] ?? m[2]).replace(/\s+/g, " ").trim();
        if (!saved.some((s) => s.includes(t.replace(/…$/, "").trim()) || t.includes(s)))
            out.push({ level: "problem", text: `“${t.slice(0, 60)}${t.length > 60 ? "…" : ""}” is quoted but is not a saved quote. Use the exact saved wording.` });
    }
    if (p.platform === "instagram" && /https?:\/\/\S+/.test(p.text))
        out.push({ level: "caution", text: "Links in Instagram captions are not clickable. Say where to find the article instead." });
    if (p.status === "ready" && !p.plannedFor)
        out.push({ level: "caution", text: "Marked ready but no planned time." });
    return out;
}
/** "#AldershotTown" from "Aldershot Town". */
export const hashtag = (s) => "#" + s.replace(/[^\p{L}\p{N} ]/gu, "").split(/\s+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join("");
/**
 * First-draft posts promoting an article. Built only from the article's own headline, standfirst and saved quotes,
 * so nothing new is asserted. The writer edits each one before using it.
 */
export function suggestPosts(d, p, quotes, url) {
    const link = url || "[link]";
    const tags = p.clubs.slice(0, 2).map(hashtag).join(" ");
    const sum = d.standfirst.trim() || firstSentence(d.body);
    const out = [];
    out.push({ platform: "x", format: "headline", text: fit(`${d.title}\n\n${sum}`, 280 - 25 - (tags ? tags.length + 1 : 0)) + `\n\n${link}${tags ? " " + tags : ""}` });
    const q = quotes.find((x) => !x.supersededBy && !x.deletedAt && !x.uncertain && d.quoteIds.includes(x.id));
    if (q && [...q.title].length <= 200)
        out.push({ platform: "x", format: "quote", text: `“${q.title}”\n\n${q.speaker} on ${d.title.replace(/[.!?]$/, "")}.\n\n${link}` });
    const paras = d.body.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
    if (paras.length >= 3) {
        const points = paras.slice(0, 4).map((x, i) => `${i + 2}/ ${fit(firstSentence(x), 250)}`);
        out.push({ platform: "x", format: "thread", text: [`1/ ${fit(d.title, 240)} 🧵`, ...points, `${points.length + 2}/ Full story: ${link}`].join("\n\n") });
    }
    out.push({ platform: "instagram", format: "headline", text: `${d.title}\n\n${sum}\n\nFull story: link in bio.${tags ? "\n\n" + tags : ""}` });
    out.push({ platform: "linkedin", format: "headline", text: `${d.title}\n\n${sum}\n\n${link}` });
    return out;
}
function firstSentence(s) { const m = s.trim().match(/^.+?[.!?](\s|$)/s); return (m ? m[0] : s).trim().replace(/\s+/g, " "); }
function fit(s, max) { const a = [...s]; return a.length <= max ? s : a.slice(0, max - 1).join("").replace(/\s+\S*$/, "") + "…"; }
// ----- genuine metrics -----
export const latest = (p) => [...p.metrics].sort((a, b) => a.date.localeCompare(b.date)).pop();
export const engagementRate = (m) => (m.impressions && m.engagements !== null ? m.engagements / m.impressions : null);
/**
 * Compare formats using only posts with entered figures. A comparison is offered only when each format has
 * at least `minEach` measured posts, otherwise the honest answer is "not enough data yet".
 */
export function formatComparison(posts, minEach = 3) {
    const by = new Map();
    for (const p of posts) {
        const m = latest(p);
        const r = m && engagementRate(m);
        if (p.status === "posted" && r !== null && r !== undefined)
            by.set(p.format, [...(by.get(p.format) ?? []), r]);
    }
    const rows = [...by].filter(([, v]) => v.length >= minEach).map(([format, v]) => ({ format, posts: v.length, avgRate: v.reduce((a, b) => a + b, 0) / v.length }));
    return rows.length >= 2 ? rows.sort((a, b) => b.avgRate - a.avgRate) : null;
}
/**
 * Figures from a CSV: Inkling's own simple layout (url,date,impressions,engagements,clicks[,follower_change]) or the
 * files X and Meta Business Suite (Facebook, Instagram) let you download. Columns are found by their names; rows are
 * matched to posts by their posted link. Rows for posts not tracked in Ripple are counted, not listed one by one.
 */
export function parseMetricsCsv(csv, posts) {
    const updates = new Map();
    const errors = [];
    const byUrl = new Map(posts.filter((p) => p.postedUrl).map((p) => [postKey(p.postedUrl), p]));
    const rows = parseCsv(csv.replace(/^﻿/, "")).filter((r) => r.some((c) => c.trim()));
    if (!rows.length)
        return { updates, errors: ["The file is empty."], unmatched: 0, source: "" };
    const head = rows[0].map((c) => c.trim().toLowerCase());
    const find = (...names) => { for (const n of names) {
        const i = head.indexOf(n);
        if (i >= 0)
            return i;
    } return -1; };
    const col = {
        url: find("url", "permalink", "post link", "tweet permalink", "link", "post url"),
        date: find("date", "time", "publish time", "post date", "created", "posted"),
        impressions: find("impressions", "views", "reach", "post impressions"),
        engagements: find("engagements", "total engagements"),
        clicks: find("url clicks", "link clicks", "clicks"),
        follows: find("follower_change", "new follows", "follows", "followers gained"),
        parts: ["likes", "reactions", "replies", "comments", "retweets", "reposts", "shares", "quotes", "saves", "bookmarks"].map((n) => head.indexOf(n)).filter((i) => i >= 0),
    };
    const hasHeader = col.url >= 0;
    // No link column and the first row is not a link: a header Inkling does not recognise.
    if (!hasHeader && !/^https?:\/\//i.test(rows[0][0]?.trim() ?? ""))
        return { updates, errors: ["This file has no date or figures columns Inkling recognises (and no link column). Use the export from X or Meta Business Suite, or columns: url, date, impressions, engagements, clicks."], unmatched: 0, source: "" };
    const [cu, cd, ci, ce, cc, cf] = hasHeader ? [col.url, col.date, col.impressions, col.engagements, col.clicks, col.follows] : [0, 1, 2, 3, 4, 5];
    if (hasHeader && (cd < 0 || (ci < 0 && ce < 0 && !col.parts.length)))
        return { updates, errors: ["This file has no date or figures columns Inkling recognises. Use the export from X or Meta Business Suite, or columns: url, date, impressions, engagements, clicks."], unmatched: 0, source: "" };
    const source = !hasHeader || head[0] === "url" ? "simple" : head.includes("tweet permalink") || head.includes("post link") ? "X" : head.includes("permalink") ? "Meta" : "CSV";
    const n = (v) => { if (v === undefined || v.trim() === "" || v.trim() === "-")
        return null; const x = Number(v.replace(/[\s,]/g, "")); return Number.isFinite(x) ? Math.round(x) : NaN; };
    let unmatched = 0;
    rows.slice(hasHeader ? 1 : 0).forEach((cells, i) => {
        const line = i + (hasHeader ? 2 : 1);
        const url = cells[cu]?.trim() ?? "";
        const post = url ? byUrl.get(postKey(url)) : undefined;
        if (!post) {
            if (source === "simple")
                errors.push(`Line ${line}: no posted post with link ${url || "(blank)"}`);
            else
                unmatched++;
            return;
        }
        const date = isoDate(cells[cd] ?? "");
        if (!date) {
            errors.push(`Line ${line}: the date “${cells[cd] ?? ""}” is not one Inkling can read (use YYYY-MM-DD)`);
            return;
        }
        const parts = col.parts.map((c) => n(cells[c]));
        const eng = ce >= 0 ? n(cells[ce]) : parts.some((v) => v !== null) ? parts.reduce((a, v) => a + (v && !Number.isNaN(v) ? v : 0), 0) : null;
        const vals = [ci >= 0 ? n(cells[ci]) : null, eng, cc >= 0 ? n(cells[cc]) : null, cf >= 0 ? n(cells[cf]) : null];
        if (vals.some((v) => Number.isNaN(v)) || parts.some((v) => Number.isNaN(v))) {
            errors.push(`Line ${line}: figures must be numbers`);
            return;
        }
        updates.set(post.id, [...(updates.get(post.id) ?? []), { date, impressions: vals[0], engagements: vals[1], clicks: vals[2], followerChange: vals[3] ?? null, origin: "import" }]);
    });
    return { updates, errors, unmatched, source };
}
/** The same post whatever form its link takes: twitter.com or x.com, mobile., www., trailing slash, tracking query. */
export function postKey(url) {
    try {
        const u = new URL(url.trim());
        const host = u.hostname.replace(/^(www|mobile|m)\./, "").replace(/^twitter\.com$/, "x.com");
        // X links work with any account name in the path: the post id is what matters.
        const status = /\/status\/(\d+)/.exec(u.pathname);
        return host === "x.com" && status ? `x.com/status/${status[1]}` : `${host}${u.pathname.replace(/\/+$/, "")}`;
    }
    catch {
        return url.trim().replace(/\/+$/, "");
    }
}
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
/** Dates as platforms write them: 2026-10-17, 2026-10-17 14:02 +0000, 10/17/2026 14:02 (US order, as X and Meta export), 17 Oct 2026, Oct 17, 2026. */
export function isoDate(raw) {
    const s = raw.trim();
    const pad = (x) => String(x).padStart(2, "0");
    const ok = (y, m, d) => (m >= 1 && m <= 12 && d >= 1 && d <= 31 && y > 2000 && y < 2100 ? `${y}-${pad(m)}-${pad(d)}` : null);
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
    if (m)
        return ok(+m[1], +m[2], +m[3]);
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
    if (m) {
        const a = +m[1], b = +m[2];
        return a > 12 ? ok(+m[3], b, a) : ok(+m[3], a, b);
    } // US order unless the first number cannot be a month
    m = /(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?,?\s+(\d{4})/.exec(s);
    if (m && MONTHS.includes(m[2].toLowerCase()))
        return ok(+m[3], MONTHS.indexOf(m[2].toLowerCase()) + 1, +m[1]);
    m = /([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/.exec(s);
    if (m && MONTHS.includes(m[1].toLowerCase()))
        return ok(+m[3], MONTHS.indexOf(m[1].toLowerCase()) + 1, +m[2]);
    return null;
}
/** A whole CSV file into rows of cells, honouring "quoted, cells", "" escapes and line breaks inside quotes (post text often has them). */
export function parseCsv(text) {
    const rows = [];
    let row = [];
    let cur = "";
    let q = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (q) {
            if (c === '"' && text[i + 1] === '"') {
                cur += '"';
                i++;
            }
            else if (c === '"')
                q = false;
            else
                cur += c;
            continue;
        }
        if (c === '"')
            q = true;
        else if (c === ",") {
            row.push(cur.trim());
            cur = "";
        }
        else if (c === "\n" || c === "\r") {
            if (c === "\r" && text[i + 1] === "\n")
                i++;
            row.push(cur.trim());
            rows.push(row);
            row = [];
            cur = "";
        }
        else
            cur += c;
    }
    if (cur || row.length) {
        row.push(cur.trim());
        rows.push(row);
    }
    return rows;
}
/** One CSV line into cells (see parseCsv for whole files). */
export function splitCsvLine(line) { return parseCsv(line)[0] ?? [""]; }
export const GROWTH_TIPS = [
    "Lead with the news or the strongest line, not with “New article:”.",
    "Use one striking quote or fact per post, and always the exact saved wording.",
    "Post when your readers are around: check your own figures, not general advice, once you have a few weeks of data.",
    "Reply to people who engage with substance; do not chase follows or use engagement bait.",
    "Credit clubs, photographers and other journalists whose work you build on.",
    "Keep a steady rhythm you can sustain rather than bursts of many posts.",
];
/**
 * When posting has done best, from the writer's own posted posts that have figures: average engagements by day of
 * the week and by time of day. Needs at least `minPosts` measured posts; otherwise says so rather than guessing.
 */
export function bestTimes(posts, minPosts = 8) {
    const measured = posts.filter((p) => p.status === "posted" && (p.plannedFor || p.postedAt) && latest(p)?.engagements != null);
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const parts = [["Morning (6–12)", 6, 12], ["Afternoon (12–17)", 12, 17], ["Evening (17–22)", 17, 22], ["Night (22–6)", 22, 30]];
    const byDay = new Map();
    const byPart = new Map();
    for (const p of measured) {
        const when = new Date(p.plannedFor || p.postedAt + "T12:00");
        const e = latest(p).engagements;
        const d = days[when.getDay()];
        byDay.set(d, [...(byDay.get(d) ?? []), e]);
        if (p.plannedFor) {
            const h = when.getHours();
            const part = parts.find(([, a, b]) => (h >= a && h < b) || (b > 24 && (h >= a || h < b - 24)))[0];
            byPart.set(part, [...(byPart.get(part) ?? []), e]);
        }
    }
    const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
    return { enough: measured.length >= minPosts, measured: measured.length,
        byDay: [...byDay].map(([day, xs]) => ({ day, posts: xs.length, avg: avg(xs) })).sort((a, b) => b.avg - a.avg),
        byPart: [...byPart].map(([part, xs]) => ({ part, posts: xs.length, avg: avg(xs) })).sort((a, b) => b.avg - a.avg) };
}
/** A thread from an article: the headline, then key points from the opening paragraphs, saved quotes word for word, then the link. */
export function articleThread(d, quotes, url, limit) {
    const link = url || "[link]";
    const paras = d.body.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
    const points = paras.slice(0, 5).map((x) => firstSentence(x)).filter((x) => x.length > 20);
    const q = quotes.filter((x) => !x.supersededBy && !x.deletedAt && !x.uncertain && d.quoteIds.includes(x.id) && [...x.title].length <= limit - 40).slice(0, 2).map((x) => `“${x.title}” – ${x.speaker}`);
    const body = [...points.slice(0, 3), ...q, ...points.slice(3)];
    const all = [`${fit(d.title, limit - 12)} 🧵`, ...body.map((x) => fit(x, limit - 8)), `Full story: ${link}`];
    return all.map((x, i) => `${i + 1}/ ${x}`).join("\n\n");
}
const EMOTION = /\b(first|record|history|historic|heartbreak|stunning|incredible|late|winner|comeback|debut|farewell|emotional|finally|never|ever|biggest|youngest|oldest|unbeaten|shock|dream|tears|proud|derby|promotion|relegation)\b/i;
const HYPE = /(you won'?t believe|shocking truth|must see|breaking!!|!!!|\bOMG\b)/i;
/**
 * What tends to help a football post travel, checked on the post itself: a strong first line, specifics, a picture,
 * a reason to reply, the right length, a little emotion, sensible hashtags and an honest tone. A checklist with
 * points (out of 100), not a prediction: no tool can promise a post will go viral.
 */
export function reachCheck(p, hasPicture) {
    const parts = threadParts(p.text);
    const first = (parts[0] ?? "").split("\n").find((l) => l.trim()) ?? "";
    const text = p.text;
    const info = PLATFORM_INFO[p.platform];
    const n = countChars(parts[0] ?? "", p.platform);
    const tags = (text.match(/#[\p{L}\p{N}_]+/gu) ?? []).length;
    const caps = (text.match(/\p{Lu}/gu) ?? []).length / Math.max(1, (text.match(/\p{L}/gu) ?? []).length);
    const sweet = { x: [60, 220], bluesky: [60, 260], threads: [60, 400], instagram: [80, 1200], facebook: [40, 400], linkedin: [400, 1300] };
    const [lo, hi] = sweet[p.platform];
    const checks = [
        { item: "A strong first line", ok: first.length > 0 && first.length <= 100 && !/^https?:\/\//.test(first) && (/\d|\?|^“|^"|^\p{Lu}{2,}|!/u.test(first) || EMOTION.test(first)), points: 20, tip: "Open with the most striking fact, number, question or quote, in under 100 characters. Never open with a link." },
        { item: "Specific: a name or a number", ok: /\d/.test(text) || /\b\p{Lu}\p{Ll}+ \p{Lu}\p{Ll}+/u.test(text), points: 10, tip: "Specifics travel: the score, the minute, the fee, the player's name." },
        { item: "A picture or graphic", ok: hasPicture, points: 20, tip: "Posts with a strong image get far more attention. Attach a Pixel graphic." },
        { item: "A reason to reply", ok: /\?\s*(\S+\s*){0,8}$/.test(text.trim()) || /\b(what do you think|who|your|vote|agree|tell us|reply|comment)\b/i.test(text), points: 15, tip: "End with a question fans will want to answer, or ask for their view." },
        { item: `Right length for ${info.label}`, ok: n >= lo && n <= hi || parts.length > 1, points: 10, tip: `On ${info.label}, about ${lo}–${hi} characters usually works best${p.platform === "x" || p.platform === "bluesky" ? "; longer stories work as a thread" : ""}.` },
        { item: "Some emotion or stakes", ok: EMOTION.test(text), points: 10, tip: "Say what is at stake or what it means: a first, a record, a comeback, a farewell (only if true)." },
        { item: "Sensible hashtags", ok: p.platform === "instagram" ? tags >= 2 && tags <= 5 : tags <= info.hashtags, points: 5, tip: p.platform === "instagram" ? "2 to 5 relevant hashtags on Instagram." : `At most ${info.hashtags} relevant hashtag(s) on ${info.label}.` },
        { item: "Honest tone (no clickbait)", ok: !HYPE.test(text) && caps < 0.35, points: 10, tip: "Avoid hype phrases and shouting in capitals: they put readers off and platforms can limit them." },
    ];
    return { score: checks.reduce((s, c) => s + (c.ok ? c.points : 0), 0), checks };
}
