import { isKnownWord, suggestWords } from "./lexicon.js";
import { escapeRegExp, matchCase, words } from "./text.js";
const W_BEFORE = "(?<![\\p{L}\\p{N}'’])";
const W_AFTER = "(?![\\p{L}\\p{N}'’])";
/** Build a rule from a list of phrase → replacement entries (case-preserving). */
export function phraseRule(meta, entries, why) {
    const map = new Map();
    for (const e of entries)
        map.set(e[0].toLowerCase().replace(/[ \t]+/g, " "), e);
    const alt = [...map.keys()].sort((a, b) => b.length - a.length).map((k) => escapeRegExp(k).replace(/ /g, "[ \\t]+").replace(/'/g, "['’]")).join("|");
    const re = new RegExp(`${W_BEFORE}(?:${alt})${W_AFTER}`, "giu");
    return {
        meta,
        run(ctx) {
            const out = [];
            re.lastIndex = 0;
            let m;
            while ((m = re.exec(ctx.text))) {
                const key = m[0].toLowerCase().replace(/[ \t]+/g, " ").replace(/’/g, "'");
                const e = map.get(key) ?? map.get(key.replace(/'/g, "’"));
                if (!e)
                    continue;
                out.push({ start: m.index, end: m.index + m[0].length, replacement: e[1] === null ? null : matchCase(m[0], e[1]), explanation: e[2] ?? why });
            }
            return out;
        },
    };
}
/** Regex rule where the replacement is computed from the match. */
function regexRule(meta, re, build) {
    return {
        meta,
        run(ctx) {
            const out = [];
            const r = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
            let m;
            while ((m = r.exec(ctx.text))) {
                if (m[0].length === 0) {
                    r.lastIndex++;
                    continue;
                }
                const h = build(m, ctx);
                if (h)
                    out.push({ start: m.index, end: m.index + m[0].length, ...h });
            }
            return out;
        },
    };
}
const M = (id, title, category, severity, minIntensity, basis, extra = {}) => ({ id, title, category, severity, minIntensity, basis, ...extra });
// ---------- Correctness ----------
const repeatedWord = regexRule(M("g.repeated-word", "Repeated word", "grammar", "error", "minimal", "grammar-rule"), /(?<![\p{L}\p{N}'’])([\p{L}']+)[ \t]+\1(?![\p{L}\p{N}'’])/giu, (m) => {
    const w = m[1].toLowerCase();
    if (["had", "that", "is", "do", "was"].includes(w))
        return null; // "had had", "that that" can be correct
    return { replacement: m[1], explanation: `“${m[1]}” appears twice in a row.` };
});
const doubleSpace = regexRule(M("g.double-space", "Extra space", "punctuation", "advice", "balanced", "grammar-rule"), /(?<=[^\s]) {2,}(?=[^\s])/g, () => ({ replacement: " ", explanation: "Use a single space between words and sentences." }));
const aAn = (() => {
    const meta = M("g.a-an", "A or an", "grammar", "error", "minimal", "grammar-rule");
    const anExceptions = new Set(["hour", "hours", "hourly", "honest", "honour", "honours", "heir", "honourable"]);
    const aExceptions = /^(uni|use|usu|uti|eur|one|once|ubiq|uk\b|unanim)/i;
    const lettersAn = new Set(["f", "h", "l", "m", "n", "r", "s", "x"]);
    return {
        meta,
        run(ctx) {
            const out = [];
            const re = /(?<![\p{L}\p{N}'’])(a|an)[ \t]+([\p{L}][\p{L}\p{N}'’-]*)/giu;
            let m;
            while ((m = re.exec(ctx.text))) {
                const art = m[1];
                const next = m[2];
                const low = next.toLowerCase();
                const acronym = next.length <= 4 && next === next.toUpperCase() && /^[A-Z]+$/.test(next);
                let wantAn;
                if (acronym)
                    wantAn = lettersAn.has(low[0]) || "aeio".includes(low[0]) && next.length > 1; // "an FA", "an MP", "an AI"
                else if (anExceptions.has(low))
                    wantAn = true;
                else if (aExceptions.test(low))
                    wantAn = false;
                else
                    wantAn = /^[aeiou]/.test(low);
                if (acronym && "u".includes(low[0]))
                    wantAn = false;
                const isAn = art.toLowerCase() === "an";
                if (isAn !== wantAn) {
                    const fixed = matchCase(art, wantAn ? "an" : "a");
                    out.push({ start: m.index, end: m.index + art.length, replacement: fixed, explanation: `Use “${fixed.toLowerCase()}” before “${next}”, because of how it is pronounced.` });
                }
            }
            return out;
        },
    };
})();
const PARTICLES = new Set(["de", "van", "von", "da", "di", "el", "al", "dos", "du", "le", "la", "ten", "ter", "bin", "ibn", "mc", "mac"]);
const sentenceCapital = {
    meta: M("g.sentence-capital", "Capital letter needed", "grammar", "error", "minimal", "grammar-rule"),
    run(ctx) {
        const out = [];
        ctx.sentences.forEach((s, i) => {
            if (i === 0)
                return;
            const prev = ctx.text.slice(ctx.sentences[i - 1].start, ctx.sentences[i - 1].end);
            if (!/[.!?]["”’')\]]*$/.test(prev))
                return;
            const first = /^[\p{L}]+/u.exec(s.text)?.[0];
            if (!first || !/^\p{Ll}/u.test(first))
                return;
            const lw = first.toLowerCase();
            if (PARTICLES.has(lw) || ctx.dict.has(lw))
                return;
            out.push({ start: s.start, end: s.start + first.length, replacement: first[0].toUpperCase() + first.slice(1), explanation: "A new sentence starts with a capital letter." });
        });
        return out;
    },
};
const pronounI = regexRule(M("g.pronoun-i", "Capital “I”", "grammar", "error", "minimal", "grammar-rule"), /(?<![\p{L}\p{N}'’.\-])i(?=['’](?:m|ve|ll|d)(?![\p{L}])|(?![\p{L}\p{N}'’.\-]))/gu, () => ({ replacement: "I", explanation: "The pronoun “I” is always a capital letter." }));
const CONFUSABLES = [
    ["could of", "could have", "“could of” is a mishearing of “could have”."],
    ["should of", "should have", "“should of” is a mishearing of “should have”."],
    ["would of", "would have", "“would of” is a mishearing of “would have”."],
    ["must of", "must have", "“must of” is a mishearing of “must have”."],
    ["might of", "might have", "“might of” is a mishearing of “might have”."],
    ["alot", "a lot", "“a lot” is two words."],
    ["irregardless", "regardless", "“regardless” is the standard form."],
    ["your welcome", "you’re welcome", "“you’re” (you are) is needed here."],
    ["their is", "there is", "“there” introduces the existence of something."],
    ["their are", "there are", "“there” introduces the existence of something."],
    ["their was", "there was", "“there” introduces the existence of something."],
    ["their were", "there were", "“there” introduces the existence of something."],
    ["its a", "it’s a", "“it’s” means “it is”. “its” shows possession."],
    ["its an", "it’s an", "“it’s” means “it is”. “its” shows possession."],
    ["its been", "it’s been", "“it’s” means “it has” here."],
    ["its not", "it’s not", "“it’s” means “it is”. “its” shows possession."],
    ["its going", "it’s going", "“it’s” means “it is”. “its” shows possession."],
    ["it's own", "its own", "“its” (no apostrophe) shows possession."],
    ["it’s own", "its own", "“its” (no apostrophe) shows possession."],
];
const confusables = phraseRule(M("g.confusables", "Commonly confused words", "word-choice", "error", "minimal", "grammar-rule"), CONFUSABLES, "These words are commonly confused.");
const fewer = regexRule(M("g.fewer-less", "Fewer, not less", "word-choice", "advice", "minimal", "grammar-rule"), /(?<![\p{L}\p{N}'’])less[ \t]+(goals|chances|points|games|matches|players|shots|passes|cards|fouls|corners|wins|defeats|attempts|saves|substitutions|appearances|touches|tackles)(?![\p{L}\p{N}'’])/giu, (m) => ({ replacement: matchCase(m[0], "fewer " + m[1]), explanation: "Use “fewer” with things you can count." }));
const thanThen = regexRule(M("g.than-then", "“Than”, not “then”", "word-choice", "error", "minimal", "grammar-rule"), /(?<![\p{L}\p{N}'’])(better|worse|more|less|rather|bigger|stronger|faster|higher|lower|older|younger|easier|harder|other)[ \t]+then(?![\p{L}\p{N}'’])/giu, (m) => ({ replacement: matchCase(m[0], `${m[1]} than`), explanation: "Use “than” to compare." }));
const loose = regexRule(M("g.lose-loose", "“Lose”, not “loose”", "word-choice", "error", "minimal", "grammar-rule"), /(?<![\p{L}\p{N}'’])loose[ \t]+(the|their|his|her|a|our|my|to|by|against|at|out|every|another)(?![\p{L}\p{N}'’])/giu, (m) => ({ replacement: matchCase(m[0], `lose ${m[1]}`), explanation: "“Lose” is the verb (to be beaten, to misplace). “Loose” means not tight." }));
const MISSPELL = {
    definately: "definitely", seperate: "separate", seperately: "separately", seperated: "separated", occured: "occurred", occuring: "occurring", occurence: "occurrence",
    recieve: "receive", recieved: "received", untill: "until", wich: "which", becuase: "because", beleive: "believe", thier: "their", teh: "the", adn: "and",
    goverment: "government", sucessful: "successful", succesful: "successful", successfull: "successful", accomodate: "accommodate", tommorow: "tomorrow",
    begining: "beginning", comitted: "committed", commited: "committed", embarass: "embarrass", existance: "existence", foriegn: "foreign", freind: "friend",
    independant: "independent", millenium: "millennium", neccessary: "necessary", necesary: "necessary", noticable: "noticeable", occassion: "occasion",
    persue: "pursue", publically: "publicly", refered: "referred", relevent: "relevant", suprise: "surprise", truely: "truly", wierd: "weird",
    alledgedly: "allegedly", concensus: "consensus", colleauge: "colleague", adress: "address", agressive: "aggressive", apparantly: "apparently",
    arguement: "argument", basicly: "basically", buisness: "business", catagory: "category", enviroment: "environment", equiped: "equipped",
    excercise: "exercise", familar: "familiar", finaly: "finally", happend: "happened", immediatly: "immediately", intresting: "interesting",
    knowlege: "knowledge", lenght: "length", oppurtunity: "opportunity", posession: "possession", possesion: "possession", prefered: "preferred",
    reccomend: "recommend", recomend: "recommend", rythm: "rhythm", similiar: "similar", strenght: "strength", tendancy: "tendency", usally: "usually",
    writting: "writing", unfortunatly: "unfortunately", dissapointed: "disappointed", dissapointing: "disappointing", disapointed: "disappointed",
    // football
    infront: "in front", aswell: "as well", incase: "in case", eachother: "each other", everytime: "every time", atleast: "at least", inbetween: "in between",
    upto: "up to", nevermind: "never mind", thankyou: "thank you", ontop: "on top", inspite: "in spite", infact: "in fact", aswel: "as well",
    // football
    ofside: "offside", offide: "offside", referree: "referee", goalkeper: "goalkeeper", stirker: "striker", midfeild: "midfield", midfeilder: "midfielder",
    pennalty: "penalty", peanlty: "penalty", suporters: "supporters", suppoters: "supporters", mannager: "manager", aggregrate: "aggregate",
};
const misspellings = (() => {
    const base = phraseRule(M("g.spelling", "Possible misspelling", "spelling", "error", "minimal", "grammar-rule"), Object.entries(MISSPELL).map(([a, b]) => [a, b, `“${a}” looks like a misspelling of “${b}”.`]), "Possible misspelling.");
    return base;
})();
/**
 * Dictionary spelling, deliberately cautious: it only flags a lowercase word that is missing from the
 * dictionary AND has a close dictionary match. Unknown words with no close match (names, jargon) are left alone.
 */
const dictionarySpelling = {
    meta: M("g.dictionary-spelling", "Possible misspelling", "spelling", "advice", "minimal", "grammar-rule"),
    run(ctx) {
        const lex = ctx.opts.lexicon;
        if (!lex)
            return [];
        const british = ctx.opts.language === "en-GB";
        const out = [];
        const re = /(?<![\p{L}\p{N}'’@\/#._\-\\])[a-z]{4,}(?![\p{L}\p{N}'’@\/_\-\\]|\.\p{L})/gu;
        let m;
        while ((m = re.exec(ctx.text))) {
            const w = m[0];
            if (ctx.dict.has(w) || isKnownWord(lex, w, british))
                continue;
            const c = suggestWords(lex, w, british, 4, ctx.opts.commonWords);
            if (!c.length)
                continue;
            const alt = c.length > 1 ? ` Other possibilities: ${c.slice(1).map((x) => "“" + x + "”").join(", ")}.` : "";
            out.push({ start: m.index, end: m.index + w.length, replacement: matchCase(w, c[0]), explanation: `“${w}” is not in Inkling’s dictionary. Did you mean “${c[0]}”?${alt} If it is a name or football term, add it to your dictionary.` });
        }
        return out;
    },
};
const NOAPOS = {
    dont: "don’t", cant: "can’t", wont: "won’t", didnt: "didn’t", doesnt: "doesn’t", isnt: "isn’t", wasnt: "wasn’t", werent: "weren’t", arent: "aren’t",
    couldnt: "couldn’t", wouldnt: "wouldn’t", shouldnt: "shouldn’t", havent: "haven’t", hasnt: "hasn’t", hadnt: "hadn’t", thats: "that’s", youre: "you’re", theyre: "they’re", weve: "we’ve", theyve: "they’ve",
};
const apostrophes = phraseRule(M("g.apostrophe", "Missing apostrophe", "punctuation", "error", "minimal", "grammar-rule"), Object.entries(NOAPOS).map(([a, b]) => [a, b, `Contractions need an apostrophe: “${b}”.`]), "Missing apostrophe.");
const agreement = regexRule(M("g.agreement", "Subject–verb agreement", "grammar", "error", "minimal", "grammar-rule"), /(?<![\p{L}\p{N}'’])(?:(he|she|it)[ \t]+(?:don['’]t|dont)|(they|we|you)[ \t]+was|(they|we|you|I)[ \t]+has|(he|she)[ \t]+have)(?![\p{L}\p{N}'’])/giu, (m) => {
    const t = m[0];
    const low = t.toLowerCase();
    let fixed;
    if (/don['’]?t$/.test(low))
        fixed = t.replace(/don['’]?t$/i, "doesn’t");
    else if (/ was$/.test(low))
        fixed = t.replace(/was$/i, "were");
    else if (/ has$/.test(low))
        fixed = t.replace(/has$/i, "have");
    else
        fixed = t.replace(/have$/i, "has");
    return { replacement: fixed, explanation: "The verb does not agree with its subject." };
});
// Note: British English treats collective nouns ("the team are") as acceptable, so no rule flags them.
// ---------- Regional spelling (British default) ----------
function usUkMap() {
    const e = [];
    const why = "British spelling is the default for UK audiences. Direct quotations keep the speaker’s spelling.";
    const add = (us, uk) => e.push([us, uk, why]);
    for (const stem of ["organ", "real", "recogn", "apolog", "critic", "emphas", "special", "summar", "memor", "author", "minim", "maxim", "priorit", "util", "stabil", "capital", "final", "idol", "mesmer", "energ", "optim", "visual", "dramat", "character", "familiar", "harmon"]) {
        for (const suf of ["ize", "ized", "izes", "izing", "ization", "izations"])
            add(stem + suf, stem + suf.replace("iz", "is"));
    }
    for (const [us, uk] of [["analyze", "analyse"], ["analyzed", "analysed"], ["analyzing", "analysing"], ["analyzes", "analyses"]])
        add(us, uk);
    for (const w of ["color", "colors", "colored", "coloring", "colorful", "favorite", "favorites", "behavior", "behaviors", "behavioral", "neighbor", "neighbors", "neighboring", "neighborhood", "neighborhoods", "honor", "honors", "honored", "honoring", "honorable", "labor", "rumor", "rumors", "rumored", "flavor", "flavors"])
        add(w, w.replace("or", "our"));
    for (const [us, uk] of [["defense", "defence"], ["defenses", "defences"], ["defenseless", "defenceless"], ["offense", "offence"], ["offenses", "offences"], ["center", "centre"], ["centers", "centres"], ["centered", "centred"], ["centerpiece", "centrepiece"], ["theater", "theatre"], ["theaters", "theatres"], ["fiber", "fibre"],
        ["traveled", "travelled"], ["traveling", "travelling"], ["traveler", "traveller"], ["travelers", "travellers"], ["canceled", "cancelled"], ["canceling", "cancelling"], ["labeled", "labelled"], ["labeling", "labelling"], ["modeled", "modelled"], ["modeling", "modelling"], ["fueled", "fuelled"], ["fueling", "fuelling"], ["signaled", "signalled"], ["signaling", "signalling"], ["leveled", "levelled"], ["leveling", "levelling"], ["jeweler", "jeweller"],
        ["gray", "grey"], ["jewelry", "jewellery"], ["catalog", "catalogue"], ["aluminum", "aluminium"], ["skeptic", "sceptic"], ["skeptics", "sceptics"], ["skeptical", "sceptical"], ["plow", "plough"], ["mom", "mum"], ["fulfill", "fulfil"], ["skillful", "skilful"], ["pajamas", "pyjamas"]])
        add(us, uk);
    return e;
}
const usSpelling = phraseRule(M("g.us-spelling", "British spelling", "spelling", "advice", "minimal", "regional-convention", { kb: "kb.regional.uk-spelling", ukOnly: true }), usUkMap(), "British spelling is the default.");
// ---------- Clarity and style ----------
const WORDY = [
    ["in order to", "to"], ["due to the fact that", "because"], ["at this point in time", "now"], ["in the event that", "if"], ["has the ability to", "can"], ["have the ability to", "can"],
    ["each and every", "every"], ["for the purpose of", "for"], ["a large number of", "many"], ["in spite of the fact that", "although"], ["with regard to", "about"], ["in the near future", "soon"],
    ["at the present time", "currently"], ["on a regular basis", "regularly"], ["it is worth noting that", null], ["needless to say", null], ["at the end of the day", null], ["it goes without saying that", null],
];
const wordiness = phraseRule(M("g.wordiness", "Wordy phrase", "wordiness", "advice", "balanced", "editorial-principle", { kb: "kb.general.concise" }), WORDY.map(([a, b]) => [a, b, b ? `“${b}” says the same in fewer words.` : "This phrase adds length without adding meaning. Consider cutting it."]), "Consider a shorter phrase.");
const fillers = regexRule(M("g.filler", "Filler word", "style", "advice", "thorough", "editorial-principle", { kb: "kb.general.concise" }), /(?<![\p{L}\p{N}'’])(very|really|basically|literally|totally)(?![\p{L}\p{N}'’])/giu, (m) => ({ replacement: null, explanation: `“${m[1].toLowerCase()}” often adds little. Keep it if it carries meaning, cut it if not.` }));
const passive = regexRule(M("g.passive", "Passive voice", "style", "advice", "thorough", "editorial-principle", { kb: "kb.general.active" }), /(?<![\p{L}\p{N}'’])(?:was|were|is|are|been|being)[ \t]+(?:\p{L}+ly[ \t]+)?(?:\p{L}{3,}(?:ed|en)|taken|given|made|seen|done|known|shown|beaten|written|won|lost|held|left|found|sent|brought)[ \t]+by(?![\p{L}\p{N}'’])/giu, () => ({ replacement: null, explanation: "This sentence is passive. If who did it matters, an active construction can be clearer. The passive is fine when the actor is unknown or unimportant." }));
const longSentence = {
    meta: M("g.long-sentence", "Long sentence", "clarity", "advice", "balanced", "editorial-principle", { block: true, kb: "kb.general.concise" }),
    run(ctx) {
        const max = ctx.opts.maxSentenceWords ?? 40;
        const out = [];
        for (const s of ctx.sentences) {
            const n = words(s.text).length;
            if (n > max)
                out.push({ start: s.start, end: s.end, replacement: null, explanation: `This sentence has ${n} words. Splitting it, or cutting a clause, may make it easier to follow.` });
        }
        return out;
    },
};
const STOP = new Set(["which", "their", "there", "would", "could", "should", "about", "after", "before", "other", "these", "those", "where", "while", "being", "because", "still", "every", "again", "never", "under", "between", "through", "against"]);
const DOMAIN = new Set(["goal", "goals", "match", "matches", "team", "teams", "game", "games", "season", "league", "club", "clubs", "player", "players", "minute", "minutes", "half", "ball", "manager", "striker", "defender", "defenders", "midfielder", "goalkeeper", "pitch", "fans", "supporters", "result", "points", "final", "second", "first", "score", "scored", "scoring", "which", "football", "stadium", "ground", "fixture", "cup", "penalty", "attack", "defence", "defense", "chance", "chances", "second-half", "first-half"]);
const repeatedVocab = {
    meta: M("g.repetition", "Repeated word", "repetition", "advice", "balanced", "editorial-principle", { block: true, kb: "kb.general.repetition" }),
    run(ctx) {
        const out = [];
        const threshold = ctx.opts.intensity === "thorough" ? 3 : 4;
        for (const p of ctx.paragraphs) {
            const seen = new Map();
            const re = /(?<![\p{L}\p{N}'’])([\p{Ll}]{5,})(?![\p{L}\p{N}'’])/gu;
            let m;
            while ((m = re.exec(p.text))) {
                const w = m[1];
                if (STOP.has(w) || DOMAIN.has(w) || ctx.dict.has(w))
                    continue;
                const c = (seen.get(w) ?? 0) + 1;
                seen.set(w, c);
                if (c >= threshold)
                    out.push({ start: p.start + m.index, end: p.start + m.index + w.length, replacement: null, explanation: `“${w}” appears ${c} times in this paragraph. A different word or a pronoun may read better, unless the repetition is deliberate.` });
            }
        }
        return out;
    },
};
const TRANSITIONS = ["however", "meanwhile", "moreover", "furthermore", "additionally", "overall", "nevertheless"];
const transitionRepeat = {
    meta: M("g.transition-repeat", "Repeated transition", "style", "advice", "balanced", "editorial-principle", { kb: "kb.general.repetition" }),
    run(ctx) {
        const out = [];
        const counts = new Map();
        for (const s of ctx.sentences) {
            const m = /^([\p{L}]+)/u.exec(s.text);
            const w = m?.[1]?.toLowerCase();
            if (!w || !TRANSITIONS.includes(w))
                continue;
            const c = (counts.get(w) ?? 0) + 1;
            counts.set(w, c);
            if (c >= 3)
                out.push({ start: s.start, end: s.start + w.length, replacement: null, explanation: `This is the ${c}rd sentence opening with “${m[1]}”. Repeating the same transition can feel mechanical; vary it or let the order of ideas do the work.`.replace("3rd", "third").replace("4rd", "fourth").replace("5rd", "fifth") });
        }
        return out;
    },
};
// ---------- Tone ----------
const CONTRACTIONS = [
    ["don't", "do not"], ["can't", "cannot"], ["won't", "will not"], ["isn't", "is not"], ["aren't", "are not"], ["wasn't", "was not"], ["weren't", "were not"], ["doesn't", "does not"], ["didn't", "did not"],
    ["couldn't", "could not"], ["wouldn't", "would not"], ["shouldn't", "should not"], ["hasn't", "has not"], ["haven't", "have not"], ["hadn't", "had not"], ["I'm", "I am"], ["you're", "you are"], ["they're", "they are"], ["we're", "we are"],
    ["I've", "I have"], ["we've", "we have"], ["they've", "they have"], ["you've", "you have"], ["I'll", "I will"], ["we'll", "we will"], ["they'll", "they will"],
];
const formalContractions = (() => {
    const r = phraseRule(M("t.contraction", "Contraction in formal tone", "tone", "advice", "balanced", "editorial-principle"), CONTRACTIONS.map(([a, b]) => [a, b, "Your tone is set to Formal, which usually avoids contractions."]), "Formal tone.");
    return { meta: r.meta, run: (ctx) => (ctx.opts.tone === "formal" ? r.run(ctx) : []) };
})();
const SLANG = [["gonna", "going to"], ["wanna", "want to"], ["gotta", "have to"], ["kinda", "kind of"], ["sorta", "sort of"]];
const slangFormal = (() => {
    const r = phraseRule(M("t.slang", "Informal wording", "tone", "advice", "balanced", "editorial-principle"), SLANG.map(([a, b]) => [a, b, "This wording is informal for a formal or professional tone."]), "Informal.");
    return { meta: r.meta, run: (ctx) => (ctx.opts.tone === "formal" || ctx.opts.tone === "professional" ? r.run(ctx) : []) };
})();
// ---------- Run-ons and fragments (cautious heuristics) ----------
const SUBORDINATORS = new Set(["after", "before", "when", "while", "although", "though", "if", "as", "since", "because", "once", "until", "unless", "whereas", "with", "in", "on", "at", "by", "during", "despite", "following", "having", "from", "for", "to", "of", "but", "and", "so", "yet", "or", "then", "meanwhile", "however"]);
const PRONOUN_SUBJ = /^(?:he|she|they|we|it|i)$/i;
const IRREGULAR_PAST = new Set(["scored", "went", "ran", "won", "lost", "took", "made", "gave", "came", "saw", "got", "sent", "hit", "put", "set", "left", "kept", "held", "led", "fell", "threw", "began", "broke", "drew", "beat", "had", "was", "were", "did", "said", "told", "found", "felt", "stood", "sat", "brought", "bought", "thought", "caught", "taught", "fought", "struck", "swung", "shot", "slid", "spun", "stole", "wore"]);
const isPastVerb = (raw) => { const w = raw.replace(/[.!?,;:"”’']+$/, ""); return /^[a-z]{3,}ed$/i.test(w) || IRREGULAR_PAST.has(w.toLowerCase()); };
/** A clause that plainly opens with its own subject: "He scored", "Smith headed", "They lost". */
function openingClause(seg, nameOk) {
    const t = seg.trim().split(/\s+/);
    if (t.length < 2 || t.length > 14)
        return false;
    const first = t[0].replace(/[“"‘']/g, "");
    if (SUBORDINATORS.has(first.toLowerCase()))
        return false;
    const subj = PRONOUN_SUBJ.test(first) || (nameOk && /^\p{Lu}[\p{L}'’-]+$/u.test(first) && !SUBORDINATORS.has(first.toLowerCase()));
    return subj && (isPastVerb(t[1]) || (t.length > 2 && /^\p{Lu}/u.test(t[1]) === false && isPastVerb(t[2]) && PRONOUN_SUBJ.test(first) === false && /^(?:and|who)$/i.test(t[1]) === false && false));
}
const commaSplice = {
    meta: M("g.comma-splice", "Possible run-on (comma splice)", "grammar", "advice", "balanced", "grammar-rule", { block: true }),
    run(ctx) {
        const out = [];
        for (const s of ctx.sentences) {
            if (s.text.length > 400)
                continue;
            const parts = [];
            let pos = 0;
            for (const piece of s.text.split(/,(?= )/)) {
                parts.push({ text: piece, start: s.start + pos });
                pos += piece.length + 1;
            }
            for (let i = 0; i + 1 < parts.length; i++) {
                const a = parts[i], b = parts[i + 1];
                if (!openingClause(a.text, true) || !openingClause(b.text, true))
                    continue;
                if (!/^\s*(?:\p{Lu}[\p{L}'’-]+|he|she|they|we|it|I)\s/u.test(b.text))
                    continue;
                const from = a.start + a.text.length; // the comma
                out.push({ start: from, end: from + 1, replacement: null, explanation: "Two complete statements are joined by only a comma. Consider a full stop, a semicolon, or a joining word such as “and” or “but”." });
            }
        }
        return out;
    },
};
const fragment = {
    meta: M("g.fragment", "Possible sentence fragment", "grammar", "advice", "thorough", "grammar-rule", { block: true }),
    run(ctx) {
        const out = [];
        for (const s of ctx.sentences) {
            if (!/[.!?]["”’']?$/.test(s.text))
                continue; // unfinished text is not a finished fragment
            const first = /^[“"‘']?(\p{L}+)/u.exec(s.text)?.[1]?.toLowerCase();
            if (!first || !["although", "though", "because", "whereas", "which", "whilst", "while", "since", "unless"].includes(first))
                continue;
            if (s.text.includes(",") || words(s.text).length > 14)
                continue; // has (or likely has) a main clause
            out.push({ start: s.start, end: s.end, replacement: null, explanation: `This sentence starts with “${first}” but has no main clause, so it may be a fragment. Fragments can work for emphasis; keep it if it is deliberate.` });
        }
        return out;
    },
};
// ---------- More tones ----------
const HEDGES = [["I think", null], ["I guess", null], ["perhaps", null], ["maybe", null], ["sort of", null], ["kind of", null], ["a bit", null], ["somewhat", null], ["seems to", null], ["might be", null], ["possibly", null], ["arguably", null]];
const hedges = (() => {
    const r = phraseRule(M("t.hedging", "Hedging in a confident tone", "tone", "advice", "balanced", "editorial-principle"), HEDGES.map(([a, b]) => [a, b, "Your tone is set to Confident or Persuasive. This hedge softens the claim. Keep it only if you are genuinely unsure."]), "Hedge.");
    return { meta: r.meta, run: (ctx) => (ctx.opts.tone === "confident" || ctx.opts.tone === "persuasive" ? r.run(ctx) : []) };
})();
const STIFF = [["furthermore", "also"], ["moreover", "also"], ["in addition", "also"], ["therefore", "so"], ["thus", "so"], ["utilise", "use"], ["commence", "start"], ["subsequently", "then"], ["nevertheless", "still"], ["prior to", "before"], ["in the event of", "if there is"]];
const stiff = (() => {
    const r = phraseRule(M("t.stiff", "Stiff wording for a conversational tone", "tone", "advice", "balanced", "editorial-principle"), STIFF.map(([a, b]) => [a, b, "Your tone is set to Conversational. A plainer word may sound more natural."]), "Stiff.");
    return { meta: r.meta, run: (ctx) => (ctx.opts.tone === "conversational" || ctx.opts.tone === "friendly" ? r.run(ctx) : []) };
})();
export const GENERAL_RULES = [
    repeatedWord, doubleSpace, aAn, sentenceCapital, pronounI, confusables, fewer, thanThen, loose, misspellings, dictionarySpelling, apostrophes, agreement,
    usSpelling, wordiness, fillers, passive, longSentence, repeatedVocab, transitionRepeat, formalContractions, slangFormal, commaSplice, fragment, hedges, stiff,
];
