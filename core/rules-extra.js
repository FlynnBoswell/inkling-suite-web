import { phraseRule } from "./rules-general.js";
import { matchCase } from "./text.js";
/**
 * Further built-in checks for the commonest grammar, word-choice and punctuation mistakes, so Inkling catches
 * them instantly and offline. Each rule is narrow on purpose: a missed error is better than a wrong "correction".
 * Deeper grammar comes from the optional LanguageTool integration.
 */
const M = (id, title, category, severity, minIntensity, extra = {}) => ({ id, title, category, severity, minIntensity, basis: "grammar-rule", ...extra });
const B = "(?<![\\p{L}\\p{N}'’])";
const A = "(?![\\p{L}\\p{N}'’])";
function rx(meta, source, build, flags = "giu") {
    return {
        meta,
        run(ctx) {
            const out = [];
            const re = new RegExp(source, flags);
            let m;
            while ((m = re.exec(ctx.text))) {
                if (!m[0].length) {
                    re.lastIndex++;
                    continue;
                }
                const h = build(m, ctx);
                if (!h)
                    continue;
                out.push({ start: h.start ?? m.index, end: h.end ?? m.index + m[0].length, replacement: h.replacement, explanation: h.explanation, ...(h.title ? { title: h.title } : {}) });
            }
            return out;
        },
    };
}
/** Replace just one captured group, keeping the rest of the match. */
const groupHit = (m, g, replacement, explanation) => {
    const before = m[0].indexOf(m[g]);
    return { start: m.index + before, end: m.index + before + m[g].length, replacement: replacement === null ? null : matchCase(m[g], replacement), explanation };
};
// ---------- Commonly confused words, in contexts where the right word is clear ----------
const ING = "\\p{L}+ing";
const yourYoure = rx(M("g.your-youre", "“You’re”, not “your”", "word-choice", "error", "minimal"), `${B}(your)[ \\t]+(?:${ING}|a|an|the|not|welcome|right|wrong|so|too|very|really|just|always|never|gonna)${A}`, (m) => /^(your)[ \t]+(king|thing|evening|morning|building|feeling|wedding|being|beginning|ending|offering|training|clothing|meaning|wing|ring|string|spring|sibling|darling|earring|ceiling|pudding|filling|warning|reading|writing|marking|coaching|passing|shooting|finishing|positioning|timing|tackling|dribbling|crossing|heading|defending)\b/i.test(m[0]) ? null
    : groupHit(m, 1, "you’re", "“You’re” is short for “you are”; “your” means belonging to you."));
const theirThere = rx(M("g.their-there", "“They’re”, not “their” or “there”", "word-choice", "error", "minimal"), `${B}(their|there)[ \\t]+(going|not|being|coming|playing|trying|looking|saying|getting|doing|so|very|too|really|always|never|gonna)${A}`, (m) => groupHit(m, 1, "they’re", "“They’re” is short for “they are”."));
const theirOwn = rx(M("g.their-own", "“Their”, not “there” or “they’re”", "word-choice", "error", "minimal"), `${B}(there|they['’]re)[ \\t]+(own|best|first|last|manager|team|players|fans|supporters|club|captain|goalkeeper|coach|side|squad|ground|stadium|home|season|league|next|previous|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|latest|biggest|worst|form|unbeaten|opponents|rivals|boss|striker|strikers|defence|defenders|midfield|chances|hopes|campaign|goalscorer|top|lack|hosts?|visitors?)${A}(?!-)`, 
// "They were there first", "Was there…?": "there" as a place or in a question is right.
(m, ctx) => /^there/i.test(m[1]) && /\b(?:is|are|was|were|be|been|being|get|got|went|go|goes|stay|stayed|out|up|down|over|in|back|from)[ \t]+$/i.test(ctx.text.slice(Math.max(0, m.index - 12), m.index)) ? null
    : groupHit(m, 1, "their", "“Their” shows belonging; “there” is a place and “they’re” means “they are”."));
const itsIts = rx(M("g.its-its", "“It’s”, not “its”", "word-choice", "error", "minimal"), `${B}(its)[ \\t]+(${ING}|not|been|got|just|really|very|so|too|always|never|clear|true|time|over|important|possible|likely|unlikely|hard|easy|difficult)${A}`, (m) => /^(its)[ \t]+(king|thing|evening|morning|building|feeling|being|beginning|ending|offering|training|meaning|wing|ring|string|spring|ceiling|wording|funding|ranking|standing|coaching|signing|recruiting|seating|setting|following|timing|marketing|pricing|programming|ticketing)\b/i.test(m[0]) ? null
    : groupHit(m, 1, "it’s", "“It’s” means “it is” or “it has”; “its” shows belonging."));
const whoseWhos = rx(M("g.whose", "“Whose”, not “who’s”", "word-choice", "error", "minimal"), `${B}(who['’]s)[ \\t]+(car|ball|team|goal|goals|turn|fault|side|shirt|boots|idea|job|house|book|phone|bag|place|responsibility|form|future|contract|position|spot|career|loan|move|signing|header|shot|cross|penalty|record|son|daughter|father|mother|wife|husband|club|name|son|deal|injury|absence|return|arrival|departure|performance|style)${A}`, (m) => groupHit(m, 1, "whose", "“Whose” asks who something belongs to; “who’s” means “who is”."));
const tooToo = rx(M("g.too", "“Too”, not “to”", "word-choice", "error", "minimal"), `${B}(to)[ \\t]+(much|many|late|early|soon|often|far|long|good|bad|big|small|slow|fast|easy|hard|young|old|tired|close)[ \\t]*(?=[.,!?;:]|$|[ \\t]+(?:to|for|and|but|now|today|tonight)${A})`, (m, ctx) => {
    const before = ctx.text.slice(Math.max(0, m.index - 15), m.index).toLowerCase();
    if (/(went|go|goes|going|got|get|come|came|up|down|from|back|due|according|close|next|way|lead|led|leads)\s*$/.test(before))
        return null; // "went to late night…", "up to much"
    return groupHit(m, 1, "too", "“Too” means “excessively” or “also”; “to” is a preposition.");
});
const affectEffect = rx(M("g.affect-effect", "“Affect”, not “effect”", "word-choice", "error", "minimal"), `${B}(will|would|could|can|may|might|to|not|did|does|didn['’]t|doesn['’]t|won['’]t|negatively|badly|seriously|directly)[ \\t]+(effect)${A}`, (m) => groupHit(m, 2, "affect", "“Affect” is usually the verb (to influence); “effect” is usually the noun (the result)."));
const usedTo = rx(M("g.used-to", "“Used to” / “supposed to”", "word-choice", "error", "minimal"), `${B}(?:i|we|they|you|he|she|it|was|were|am|is|are|get|got)[ \\t]+(use|suppose)[ \\t]+to${A}`, (m) => groupHit(m, 1, m[1].toLowerCase() === "use" ? "used" : "supposed", m[1].toLowerCase() === "use" ? "The past habit is “used to”." : "“Supposed to” needs the -d."));
const everyday = rx(M("g.everyday", "“Every day”, two words", "word-choice", "error", "minimal"), `${B}(?:train|trains|training|play|plays|work|works|practise|practice|happens|happen|run|runs|improve|improves|better|it)[ \\t]+(everyday)(?=[ \\t]*[.,!?;:]|$)`, (m) => groupHit(m, 1, "every day", "As an adverb (how often), it is two words: “every day”. “Everyday” means ordinary."));
const PHRASES = phraseRule(M("g.phrases", "Mistaken phrase", "word-choice", "error", "minimal"), [
    ["could care less", "couldn’t care less", "The idiom is “couldn’t care less”."],
    ["for all intensive purposes", "for all intents and purposes", "The phrase is “for all intents and purposes”."],
    ["per say", "per se", "The Latin phrase is “per se”."],
    ["one in the same", "one and the same", "The phrase is “one and the same”."],
    ["case and point", "case in point", "The phrase is “case in point”."],
    ["nip it in the butt", "nip it in the bud", "The phrase is “nip it in the bud”."],
    ["deep seeded", "deep-seated", "The phrase is “deep-seated”."],
    ["first come first serve", "first come, first served", "The phrase is “first come, first served”."],
    ["make due", "make do", "The phrase is “make do”."],
    ["peak my interest", "pique my interest", "The phrase is “pique my interest”."],
    ["peaked my interest", "piqued my interest", "The phrase is “piqued my interest”."],
    ["sneak peak", "sneak peek", "A quick look is a “peek”."],
    ["free reign", "free rein", "The phrase comes from horse riding: “free rein”."],
    ["between you and I", "between you and me", "After “between”, use “me”."],
    ["try and", null, "In formal writing, “try to” is usually preferred."],
    ["supposably", "supposedly", "The word is “supposedly”."],
    ["alot of", "a lot of", "“a lot” is two words."],
    ["a part from", "apart from", "“Apart from” is one word here."],
    ["in tact", "intact", "“Intact” is one word."],
    ["each others", "each other’s", "The possessive is “each other’s”."],
], "This phrase is commonly mistaken.");
/** "Me and him went…" at the start of a sentence: object pronouns used as the subject. */
const pronounCase = rx(M("g.pronoun-case", "Pronoun as subject", "grammar", "error", "minimal"), `(?:^|(?<=[.!?]["”’']?[ \\t\\n]+))((?:[Mm]e|[Hh]im|[Hh]er|[Uu]s|[Tt]hem)[ \\t]+and[ \\t]+(?:me|him|her|us|them|[\\p{Lu}][\\p{L}'’-]+)|[\\p{Lu}][\\p{L}'’-]+[ \\t]+and[ \\t]+(?:me|him|her|us|them))[ \\t]+(?:went|were|was|are|is|have|had|will|would|did|played|scored|got|made|took|came|left|spoke|talked|met|said|trained|travelled|agreed|watched|saw|joined|signed|decided|both)${A}`, (m) => {
    const fix = m[1].replace(/\b(me|him|her|us|them)\b/gi, (p) => ({ me: "I", him: "he", her: "she", us: "we", them: "they" }[p.toLowerCase()]));
    const ordered = /^I and /.test(fix) ? fix.replace(/^I and (.+)$/, "$1 and I") : fix.replace(/ and I$/, " and I");
    return { start: m.index + m[0].indexOf(m[1]), end: m.index + m[0].indexOf(m[1]) + m[1].length, replacement: ordered[0].toUpperCase() + ordered.slice(1), explanation: "As the subject of a sentence, use “I”, “he”, “she”, “we” or “they” (and put yourself last)." };
}, "gu");
/** "He play", "she want", "it look": a third-person singular subject needs the -s form. */
const THIRD = ["play", "go", "do", "have", "want", "need", "like", "know", "think", "say", "make", "take", "come", "see", "look", "get", "give", "run", "score", "win", "lose", "seem", "feel", "try", "work", "train", "believe", "mean", "hope", "start", "keep", "deserve", "expect", "love", "hate"];
const thirdPerson = rx(M("g.third-person", "Verb form after he/she/it", "grammar", "error", "minimal"), `${B}(he|she|it)[ \\t]+(${THIRD.join("|")})${A}`, (m, ctx) => {
    const before = ctx.text.slice(Math.max(0, m.index - 24), m.index).toLowerCase();
    if (/(did|does|didn['’]t|doesn['’]t|will|would|should|could|can|might|must|may|shall|won['’]t|let|make|made|help|helped|saw|see|watch|watched|heard|hear|to|not|that|if)\s*$/.test(before))
        return null; // "did he play", "let it go", "saw him go"
    const v = m[2].toLowerCase();
    const s = v === "have" ? "has" : v === "do" ? "does" : v === "go" ? "goes" : /(?:[^aeiou]y)$/.test(v) ? v.slice(0, -1) + "ies" : /(?:s|sh|ch|x|z)$/.test(v) ? v + "es" : v + "s";
    return groupHit(m, 2, s, `With “${m[1].toLowerCase()}”, the verb takes -s: “${m[1].toLowerCase()} ${s}”.`);
});
/** "less people", "less fans": countable nouns take "fewer". */
const fewerPeople = rx(M("g.fewer-people", "Fewer, not less", "word-choice", "advice", "minimal"), `${B}(less)[ \\t]+(people|fans|supporters|teams|clubs|managers|minutes|seconds|days|weeks|months|years|times|mistakes|errors|options|words|tickets|seats)${A}`, (m) => groupHit(m, 1, "fewer", "Use “fewer” with things you can count."));
// ---------- Punctuation and spacing ----------
const spaceBeforePunct = rx(M("p.space-before", "Space before punctuation", "punctuation", "error", "minimal"), `(?<=[\\p{L}\\p{N}”’")\\]])([ \\t]+)(?=[,.;:!?](?:[ \\t\\n"”’)]|$))`, (m, ctx) => { if (ctx.text.slice(m.index + m[0].length, m.index + m[0].length + 3) === "...")
    return null; return { replacement: "", explanation: "There is no space before a comma, full stop, colon, semicolon, question mark or exclamation mark." }; });
const missingSpaceAfter = rx(M("p.space-after", "Missing space after punctuation", "punctuation", "error", "minimal"), `(?<=[\\p{Ll}]{2}|[\\p{Ll}][)”’"])([,;!?]|\\.(?=\\p{Lu}[\\p{Ll}]))(?=[\\p{L}])`, (m, ctx) => {
    const tail = ctx.text.slice(m.index - 30, m.index + 30);
    if (/[\w-]+\.[a-z]{2,}(\/|\b)/i.test(tail) && m[1] === ".")
        return null; // web addresses, file names
    if (/@/.test(tail))
        return null;
    return { replacement: m[1] + " ", explanation: "Put a space after a comma or the end of a sentence." };
}, "gu");
const doublePunct = rx(M("p.double", "Doubled punctuation", "punctuation", "error", "minimal"), `(?<!\\.)(,,+|;;+|::+|\\.\\.(?!\\.)|\\?\\.|!\\.|\\.,|,\\.)(?!\\.)`, (m) => ({ replacement: m[0][0] === "?" || m[0][0] === "!" ? m[0][0] : m[0].startsWith(",") && m[0].endsWith(".") ? "." : m[0][0], explanation: "This punctuation mark is doubled." }));
const exclaimRun = rx(M("p.exclaim", "Several exclamation marks", "punctuation", "advice", "balanced"), `([!?]{2,})`, () => ({ replacement: null, explanation: "One exclamation or question mark is enough in published writing." }));
const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "january", "february", "april", "june", "july", "august", "september", "october", "november", "december"];
const dayCaps = rx(M("p.day-capital", "Capital letter for days and months", "grammar", "error", "minimal"), `${B}(${DAYS.join("|")})${A}`, (m) => (/^\p{Lu}/u.test(m[1]) ? null : { replacement: m[1][0].toUpperCase() + m[1].slice(1), explanation: "Days of the week and months take a capital letter." }), "gu");
const INTRO = ["however", "meanwhile", "therefore", "nevertheless", "unfortunately", "fortunately", "interestingly", "finally", "firstly", "secondly", "thirdly", "additionally", "furthermore", "moreover", "overall", "ultimately", "consequently", "instead", "otherwise", "indeed", "of course", "in fact", "as a result", "in addition", "for example", "for instance", "on the other hand"];
const introComma = rx(M("p.intro-comma", "Comma after an opening word", "punctuation", "advice", "minimal"), `(?:^|(?<=[.!?]["”’']?[ \\t\\n]+))(${INTRO.join("|")})(?=[ \\t]+[\\p{L}])`, (m, ctx) => {
    // "However you look at it", "However hard they tried": here "however" means "in whatever way" and takes no comma.
    if (/^however$/i.test(m[1]) && /^[ \t]+(?:you|we|they|i|he|she|it|much|many|hard|long|far|well|good|badly|often|big|small|bad)\b/i.test(ctx.text.slice(m.index + m[0].length)))
        return null;
    return { replacement: m[1] + ",", explanation: `An opening word like “${m[1]}” is usually followed by a comma.` };
});
const decadeApostrophe = rx(M("p.decade", "No apostrophe in plurals of numbers", "punctuation", "error", "minimal"), `${B}((?:19|20)?\\d0)['’]s${A}`, (m) => ({ replacement: m[1] + "s", explanation: "Decades and plural numbers take no apostrophe: “1990s”, “the 80s”." }));
/** Unclosed brackets or quotation marks in a paragraph. */
const unbalanced = {
    meta: M("p.unbalanced", "Unclosed bracket or quotation", "punctuation", "advice", "minimal", { block: true }),
    run(ctx) {
        const out = [];
        for (const p of ctx.paragraphs) {
            const count = (re) => (p.text.match(re) ?? []).length;
            const problems = [];
            if (count(/\(/g) !== count(/\)/g))
                problems.push("brackets");
            if (count(/“/g) !== count(/”/g) || count(/"/g) % 2 === 1)
                problems.push("quotation marks");
            if (problems.length)
                out.push({ start: p.start, end: p.end, replacement: null, explanation: `This paragraph has unmatched ${problems.join(" and ")}. Check that every opening one is closed.` });
        }
        return out;
    },
};
/** A finished paragraph (another one follows) with no closing punctuation. */
const missingFullStop = {
    meta: M("p.end-stop", "Missing full stop", "punctuation", "advice", "balanced"),
    run(ctx) {
        const out = [];
        const ps = ctx.paragraphs;
        for (let i = 0; i < ps.length - 1; i++) {
            const p = ps[i];
            const t = p.text;
            if (t.split(/\s+/).length < 6 || /[.!?:;…”’")\]]$/.test(t) || /^[#*\-•\d]/.test(t))
                continue; // headings, lists and short lines are fine
            const last = /(\S+)$/.exec(t);
            out.push({ start: p.end - last[1].length, end: p.end, replacement: last[1] + ".", explanation: "This paragraph ends without a full stop." });
        }
        return out;
    },
};
/** "three points of the play-off places": distance in a table is "off". */
const pointsOff = rx(M("f.points-off", "“Off”, not “of”", "word-choice", "error", "minimal"), `${B}(?:points?|goals?|places?|spots?)[ \t]+(of)[ \t]+(?:the[ \t]+)?(?:top|play-?offs?|summit|pace|leaders|safety|bottom|drop|relegation|automatic)${A}`, (m) => groupHit(m, 1, "off", "Distance from a place in the table is “off”: “three points off the play-offs”."));
/** "The fans was…": a plural subject needs "were". */
const PLURALS = "fans|supporters|players|lads|visitors|hosts|substitutes|chances|officials|coaches|teams|clubs|defenders|strikers|midfielders|forwards|wingers|goalkeepers|owners|directors|tickets|results|goals";
const pluralWas = rx(M("g.plural-was", "“Were”, not “was”", "grammar", "error", "minimal"), `${B}(?:the|our|their|both|all the|his|her|its|these|those|many|some)[ \t]+(?:home[ \t]+|away[ \t]+|travelling[ \t]+|young[ \t]+)?(?:${PLURALS})[ \t]+(was|wasn['’]t)${A}`, (m) => groupHit(m, 1, /n/i.test(m[1]) ? "weren’t" : "were", "A plural subject takes “were”: “the fans were delighted”."));
/**
 * "It was Smiths sixth goal": a name with a stray "s" before something it owns. Only flagged when the same name
 * appears elsewhere without the "s" (so "Barnes" or "Woking Rovers" are never touched).
 */
const OWNED = "first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|\\d+(?:st|nd|rd|th)|goal|goals|header|shot|cross|free[ -]kick|penalty|pass|debut|contract|future|first-half|second-half|own|side|team|manager|winner|equaliser|brace|hat-trick|form|season|career|record";
const namePossessive = rx(M("g.name-possessive", "Missing apostrophe", "punctuation", "error", "minimal"), `(?<![\\p{L}'’])(\\p{Lu}\\p{Ll}+s)[ \\t]+(?:${OWNED})(?![\\p{L}])`, (m, ctx) => {
    const name = m[1].slice(0, -1);
    if (!new RegExp(`(?<![\\p{L}])${name}(?![\\p{L}'’])`, "u").test(ctx.text.slice(0, m.index) + " " + ctx.text.slice(m.index + m[0].length)))
        return null;
    return groupHit(m, 1, `${name}’s`, `To show something belongs to ${name}, add an apostrophe: “${name}’s”.`);
});
export const EXTRA_RULES = [namePossessive, pointsOff, pluralWas, yourYoure, theirThere, theirOwn, itsIts, whoseWhos, tooToo, affectEffect, usedTo, everyday, PHRASES, pronounCase, thirdPerson, fewerPeople,
    spaceBeforePunct, missingSpaceAfter, doublePunct, exclaimRun, dayCaps, introComma, decadeApostrophe, unbalanced, missingFullStop];
