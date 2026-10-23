import { phraseRule } from "./rules-general.js";
import { escapeRegExp, wordCount } from "./text.js";
const M = (id, title, category, severity, minIntensity, basis, extra = {}) => ({ id, title, category, severity, minIntensity, basis, footballOnly: true, ...extra });
/** Vocabulary the engine should recognise and never treat as unusual (names are added by the user). */
export const FOOTBALL_TERMS = [
    "offside", "midfield", "midfielder", "goalkeeper", "full-back", "wing-back", "centre-back", "centre-half", "centre-forward", "striker", "sweeper", "libero", "regista",
    "gegenpress", "gegenpressing", "tiki-taka", "catenaccio", "false nine", "inverted full-back", "low block", "high press", "xG", "xA", "VAR", "EFL", "FA", "NLS", "NLN",
    "Spurs", "Toon", "Gunners", "Magpies", "Hornets", "Saints", "Cobblers", "Shrimpers", "Imps", "Stags", "Posh", "Pilgrims", "Gills", "Tractor Boys", "Lionesses",
];
const COMPETITIONS = ["Premier League", "League One", "League Two", "National League North", "National League South", "National League", "FA Cup", "FA Trophy", "FA Vase", "EFL Trophy", "Carabao Cup", "Champions League", "Europa League", "Conference League", "World Cup", "Women's Super League", "Isthmian League", "Southern League", "Northern Premier League"];
const competitionCase = (() => {
    const meta = M("f.competition-case", "Competition name", "football", "advice", "minimal", "football-convention");
    const re = new RegExp(`(?<![\\p{L}\\p{N}'’])(${[...COMPETITIONS].sort((a, b) => b.length - a.length).map((c) => escapeRegExp(c).replace(/ /g, "[ \\t]+").replace(/'/g, "['’]")).join("|")})(?![\\p{L}\\p{N}'’])`, "giu");
    return {
        meta,
        run(ctx) {
            const out = [];
            let m;
            re.lastIndex = 0;
            while ((m = re.exec(ctx.text))) {
                const canon = COMPETITIONS.find((c) => c.toLowerCase().replace(/’/g, "'") === m[0].toLowerCase().replace(/[ \t]+/g, " ").replace(/’/g, "'"));
                if (canon && canon.replace(/'/g, "’") !== m[0] && canon !== m[0].replace(/’/g, "'").replace(/[ \t]+/g, " "))
                    out.push({ start: m.index, end: m.index + m[0].length, replacement: canon, explanation: `Competition names are capitalised: “${canon}”.` });
            }
            return out;
        },
    };
})();
const scoreline = {
    meta: M("f.scoreline-format", "Scoreline format", "football", "advice", "balanced", "football-convention", { kb: "kb.format.scoreline" }),
    run(ctx) {
        const out = [];
        const re = /(?<![\d:.\/-])(\d{1,2})[ \t]*(?:[-–—]|:|to)[ \t]*(\d{1,2})(?![\d:\/])/g;
        let m;
        while ((m = re.exec(ctx.text))) {
            const raw = m[0];
            if (/^\d{1,2}-\d{1,2}$/.test(raw))
                continue; // already in house format
            if (/:/.test(raw) && /\d:\d{2}(?::\d{2})?\s?(am|pm)?/i.test(ctx.text.slice(m.index, m.index + 9)) && Number(m[2]) >= 10)
                continue; // looks like a clock time
            if (/\bto\b/.test(raw) && !/(won|win|beat|lost|draw|drew|victory|defeat|score|result|lead|led)/i.test(ctx.text.slice(Math.max(0, m.index - 40), m.index)))
                continue;
            const after = ctx.text.slice(m.index + raw.length, m.index + raw.length + 12).toLowerCase();
            if (/^\s*(january|february|march|april|may|june|july|august|september|october|november|december|years?|pm|am|minutes?)/.test(after))
                continue;
            out.push({ start: m.index, end: m.index + raw.length, replacement: `${m[1]}-${m[2]}`, explanation: "Write scorelines in one consistent format, such as “2-1”. Check the numbers against the official record." });
        }
        return out;
    },
};
const compounds = phraseRule(M("f.terminology", "Football term", "football", "advice", "balanced", "football-convention"), [
    ["off side", "offside"], ["off-side", "offside"], ["mid field", "midfield"], ["mid-field", "midfield"], ["mid fielder", "midfielder"], ["goal keeper", "goalkeeper"], ["goal-keeper", "goalkeeper"],
    ["full back", "full-back"], ["wing back", "wing-back"], ["centre half", "centre-half"], ["centre back", "centre-back"], ["centre forward", "centre-forward"],
].map(([a, b]) => [a, b, `The usual British spelling is “${b}”.`]), "Usual British football spelling.");
const soccer = (() => {
    const r = phraseRule(M("f.soccer", "“Football”, not “soccer”", "football", "advice", "balanced", "regional-convention", { kb: "kb.regional.uk-spelling", ukOnly: true }), [["soccer", "football", "British readers expect “football”. Keep “soccer” inside a direct quotation or if your house style says so."]], "British usage.");
    return r;
})();
const ATTRIB = /\b(said|says|told|tells|added|adds|admitted|insisted|explained|revealed|claimed|confirmed|stated|declared|stressed|warned|suggested|commented|argued|conceded|joked|reflected|noted|continued|replied|according to|speaking|spoke|asked|believes|feels|thinks|reacted|posted|wrote|tweeted)\b|\b(in|at) (a|an|the) (statement|press conference|interview|post-match|pre-match)/i;
const quoteAttribution = {
    meta: M("f.quote-attribution", "Quotation without attribution", "football", "advice", "balanced", "verify-fact", { kb: "kb.quotes.attribution", allowInQuotes: true, block: true }),
    run(ctx) {
        const out = [];
        for (const q of ctx.quotes) {
            const inner = q.text.slice(1, -1);
            if (wordCount(inner) < 5)
                continue; // short quoted phrases are scare-quotes or titles, not speech
            const si = ctx.sentences.findIndex((s) => q.start >= s.start && q.start < s.end + 1);
            const from = ctx.sentences[Math.max(0, si - 1)]?.start ?? Math.max(0, q.start - 120);
            const to = ctx.sentences[Math.min(ctx.sentences.length - 1, si + 1)]?.end ?? Math.min(ctx.text.length, q.end + 160);
            const around = ctx.text.slice(from, q.start) + " " + ctx.text.slice(q.end, to);
            if (!ATTRIB.test(around))
                out.push({ start: q.start, end: q.end, replacement: null, explanation: "No speaker is named near this quotation. Say who said it and where, and check it against your recording or notes. Inkling cannot verify quotations." });
        }
        return out;
    },
};
const SOURCE_CUE = /\b(said|says|told|reported|reports|reporting|according to|sources?|understands?|understood|confirmed|announced|statement|claims?|claimed|revealed|BBC|Sky|Athletic|Guardian|Telegraph|Times|Mail|official|website|spokesperson|agent)\b/i;
const TRANSFER_CLAIM = /(\bwill (sign|join|leave|move|complete)\b|\b(is|are) set to\b|\bset to (sign|join|leave)\b|\bclose to (signing|joining|a deal)\b|\b(has|have) agreed\b|\bagreed (a|the) (deal|fee|move|terms)\b|\b(is|are) in talks\b|\bwill be unveiled\b|\b(is|are) expected to join\b|\bpassed a medical\b|\bbid (of|worth)\b)/i;
const transferAttribution = {
    meta: M("f.unattributed-transfer", "Transfer claim without a source", "football", "advice", "balanced", "verify-fact", { modes: ["football-news"], kb: "kb.news.attribution", block: true }),
    run(ctx) {
        const out = [];
        ctx.sentences.forEach((s, i) => {
            if (!TRANSFER_CLAIM.test(s.text))
                return;
            const next = ctx.sentences[i + 1]?.text ?? "";
            if (SOURCE_CUE.test(s.text) || SOURCE_CUE.test(next))
                return;
            out.push({ start: s.start, end: s.end, replacement: null, explanation: "This reads as a transfer claim, but no source is named. Say who is reporting it, or mark it clearly as unconfirmed. Inkling cannot check whether it is true." });
        });
        return out;
    },
};
const predictionAsFact = (() => {
    const meta = M("f.prediction-as-fact", "Prediction stated as fact", "football", "advice", "balanced", "football-convention", { modes: ["match-preview"], kb: "kb.preview.prediction-vs-fact" });
    const re = /(?<![\p{L}\p{N}'’])(will (win|beat|lose|score|thrash|cruise)|(are|is) (certain|sure|bound|guaranteed) to|cannot lose|can['’]t lose)(?![\p{L}\p{N}'’])/giu;
    return {
        meta,
        run(ctx) {
            const out = [];
            let m;
            while ((m = re.exec(ctx.text)))
                out.push({ start: m.index, end: m.index + m[0].length, replacement: null, explanation: "A preview can give an expectation, but this states an unknown result as fact. Consider “should”, “could”, or give the evidence and label the prediction as yours." });
            return out;
        },
    };
})();
const RESULT_CUE = /(\d+\s?[-–]\s?\d+|\b(won|win|wins|beat|beaten|defeat|defeated|lost|lose|drew|draw|drawn|stalemate|victory|triumph|thrashed|edged|clinched|sealed|held|spoils|goalless|nil|win)\b)/i;
const reportOpening = {
    meta: M("f.report-opening", "Result missing from the opening", "football", "advice", "balanced", "football-convention", { modes: ["match-report"], kb: "kb.report.opening-result", block: true }),
    run(ctx) {
        if (wordCount(ctx.text) < 60 || ctx.sentences.length < 3)
            return [];
        const first = ctx.sentences.slice(0, 2);
        if (first.some((s) => RESULT_CUE.test(s.text)))
            return [];
        const s = first[0];
        return [{ start: s.start, end: s.end, replacement: null, explanation: "The opening does not say how the match finished. Many match reports state the result and main storyline first. Ignore this if your house style opens differently." }];
    },
};
const reportTense = {
    meta: M("f.report-tense", "Mixed tense", "football", "advice", "balanced", "football-convention", { modes: ["match-report"], kb: "kb.report.narrative" }),
    run(ctx) {
        const past = [...ctx.text.matchAll(/(?<![\p{L}])(scored|netted|equalised|equalized|conceded)(?![\p{L}])/giu)];
        const pres = [...ctx.text.matchAll(/(?<![\p{L}])(scores|equalises|equalizes|concedes)(?![\p{L}])/giu)];
        if (!past.length || !pres.length)
            return [];
        const minority = pres.length <= past.length ? pres : past;
        return minority.map((m) => ({ start: m.index, end: m.index + m[0].length, replacement: null, explanation: "This report mixes past and present tense for goals. A completed match is normally reported in the past tense throughout." }));
    },
};
const EVIDENCE = /(\d|possession|shots?|chances?|xg|passes|touches|pressing|corners|territory|attempts)/i;
const dominated = {
    meta: M("f.unsupported-claim", "Claim needs support", "football", "advice", "balanced", "editorial-principle", { modes: ["tactical-analysis", "match-report"], kb: "kb.analysis.evidence" }),
    run(ctx) {
        const out = [];
        for (const p of ctx.paragraphs) {
            if (EVIDENCE.test(p.text))
                continue;
            for (const m of p.text.matchAll(/(?<![\p{L}])(dominated|dominant|dominance|dominating|bossed|controlled the game)(?![\p{L}])/giu)) {
                out.push({ start: p.start + m.index, end: p.start + m.index + m[0].length, replacement: null, explanation: `“${m[0]}” is a claim. What evidence in this paragraph supports it (chances, possession, patterns of play)? Inkling has not watched the match.` });
            }
        }
        return out;
    },
};
const opinionAsFact = (() => {
    const meta = M("f.opinion-as-fact", "Opinion presented as fact", "football", "advice", "balanced", "editorial-principle", { modes: ["tactical-analysis"], kb: "kb.analysis.fact-vs-opinion" });
    const re = /(?<![\p{L}])(undoubtedly|without (a )?doubt|obviously|clearly the (best|worst)|everyone knows|nobody can argue|no one can argue)(?![\p{L}])/giu;
    return { meta, run(ctx) { const out = []; let m; while ((m = re.exec(ctx.text)))
            out.push({ start: m.index, end: m.index + m[0].length, replacement: null, explanation: "This presents a judgement as settled. Show the evidence, or signal that it is your view." }); return out; } };
})();
const CLICHES = ["game of two halves", "tale of two halves", "the beautiful game", "over the moon", "sick as a parrot", "dust themselves down", "stuff of dreams", "ruthless in front of goal"];
const cliches = phraseRule(M("f.cliche", "Football cliché", "style", "advice", "thorough", "editorial-principle"), CLICHES.map((c) => [c, null, "A familiar phrase. It can be fine, but a fresher, more specific description usually serves readers better."]), "Cliché.");
export const FOOTBALL_RULES = [competitionCase, scoreline, compounds, soccer, quoteAttribution, transferAttribution, predictionAsFact, reportOpening, reportTense, dominated, opinionAsFact, cliches];
