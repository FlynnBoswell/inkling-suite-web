import { KnowledgeBase } from "./base.js";
const DATE = "2026-10-18";
const SRC = { title: "Inkling original editorial guidance", kind: "original-authored", note: "Written for Inkling as general craft guidance. Not copied from, and not endorsed by, any publication." };
const LIC = { status: "original", name: "Original text written for this project" };
const SEEDS = [
    { id: "kb.news.attribution", title: "Attribute claims in news", types: ["football-news", "general-sports-news"], topic: "attribution",
        principle: "Say who is the source of every claim a reader could not verify themselves.",
        explanation: "Transfer, injury and contract stories rest on sourcing. Name the source (a club statement, the player, a named reporter, an agent) or say plainly that the information is unconfirmed. Readers should always be able to tell what is known from what is rumoured.",
        exercise: "Weak: 'X will join Y.' Stronger: 'Y have agreed a fee for X, the club said in a statement.'" },
    { id: "kb.news.confirmed-vs-speculation", title: "Separate confirmed facts from speculation", types: ["football-news"], topic: "accuracy",
        principle: "Keep confirmed information and speculation in clearly different sentences.",
        explanation: "Use firm verbs only for confirmed facts. Use hedged, attributed wording ('is understood to', 'according to') for anything else, and do not stack several unconfirmed claims in a single sentence." },
    { id: "kb.quotes.attribution", title: "Attribute every quotation", types: ["interview-profile", "reaction", "football-news", "match-report", "general-sports-news"], topic: "quotations",
        principle: "Every direct quotation needs a visible speaker and, ideally, a setting.",
        explanation: "Say who spoke, and where or when if it matters (post-match press conference, club website interview). Quote only words the person actually said. Paraphrase everything else and keep it visibly separate from your own analysis.",
        limitations: "Inkling cannot check that a quotation is genuine. It can only flag quotations that have no visible attribution." },
    { id: "kb.reaction.quotes-vs-analysis", title: "Keep reaction, paraphrase and analysis apart", types: ["reaction"], topic: "quotations",
        principle: "Reader should always know whether a line is a quote, a paraphrase or your opinion.",
        explanation: "Open with the result, then the main talking points. Give the manager's and players' words their own paragraphs, then add your own reading of the evidence afterwards, clearly as yours." },
    { id: "kb.report.opening-result", title: "Establish the result early", types: ["match-report"], topic: "structure",
        principle: "A match report's opening should tell the reader the result and the main story.",
        explanation: "Most readers want the outcome and the reason for it within the first sentences. Scene-setting can follow. Some publications open with a feature-style intro, so treat this as a default that a house style can override.",
        limitations: "Conventions vary between publications. This is a default, not a universal rule." },
    { id: "kb.report.narrative", title: "Choose the incidents that carry the story", types: ["match-report"], topic: "structure",
        principle: "Pick the few moments that decided the match and give them room.",
        explanation: "A report that lists everything reads like a log. Choose the turning points, say why they mattered, and keep chronology clear. Use one tense consistently (past, for a completed match)." },
    { id: "kb.report.stats", title: "Use statistics to support a point", types: ["match-report", "analysis-opinion", "general-sports-news"], topic: "evidence",
        principle: "Use a statistic when it proves something, and say where it came from.",
        explanation: "One relevant number beats a block of them. Give the source of any figure you did not collect yourself, and check it before publishing." },
    { id: "kb.preview.prediction-vs-fact", title: "Do not present a prediction as fact", types: ["match-preview"], topic: "accuracy",
        principle: "In a preview, write expectations as expectations.",
        explanation: "'Will win' states an unknown as fact. Prefer evidence-led framing: form, injuries, head-to-head, and what each manager needs. If you do predict, mark it as your view." },
    { id: "kb.preview.context", title: "Give only the context the reader needs", types: ["match-preview"], topic: "structure",
        principle: "Pick two or three storylines and develop them; skip the rest.",
        explanation: "Form, league position, history and key players are all useful, but a preview that recites all of them becomes repetitive. Lead with the storyline that makes this fixture matter." },
    { id: "kb.analysis.fact-vs-opinion", title: "Mark opinion as opinion", types: ["analysis-opinion", "blog"], topic: "argument",
        principle: "Signal where evidence ends and your judgement begins.",
        explanation: "Opinion is welcome in analysis and blogs. Support it with something the reader can check, and avoid stating a verdict as a settled fact." },
    { id: "kb.analysis.evidence", title: "Back tactical claims with what happened", types: ["analysis-opinion"], topic: "evidence",
        principle: "Explain a tactical idea with a concrete example from the match.",
        explanation: "Terms such as 'dominated' or 'controlled' need support: territory, chances, patterns of play. Define a tactical term the first time you use it if readers may not know it.",
        limitations: "Inkling has not watched the match and cannot verify tactical claims." },
    { id: "kb.feature.quotes", title: "Let quotations move a profile forward", types: ["interview-profile", "long-form"], topic: "quotations",
        principle: "Use a quote when the speaker says it better than you could.",
        explanation: "Introduce the subject early, move between background and present-day scenes, and use quotations for voice and feeling, not for information you could state more briefly yourself." },
    { id: "kb.longform.pacing", title: "Pace a long article", types: ["long-form"], topic: "structure",
        principle: "Vary the pace: scene, background, analysis, then back to scene.",
        explanation: "Open with a concrete scene, explain why it matters, and return to the narrative thread after each stretch of background so readers do not lose their place." },
    { id: "kb.blog.voice", title: "Voice belongs to the writer", types: ["blog"], topic: "voice",
        principle: "Blogs can be conversational and opinionated; do not force news conventions on them.",
        explanation: "Keep claims honest and attributions clear, but let the writer's own voice lead." },
    { id: "kb.general.concise", title: "Cut words that do no work", types: ["general-writing"], topic: "clarity",
        principle: "Prefer the shorter phrase when it means the same thing.",
        explanation: "Phrases such as 'in order to' or 'due to the fact that' add length without meaning. Cut them only when the sentence still says exactly what you meant." },
    { id: "kb.general.active", title: "Prefer active voice when the actor matters", types: ["general-writing"], topic: "clarity",
        principle: "Name who did what when it matters; use the passive when the actor is unknown or unimportant.",
        explanation: "'The ball was cleared by the defender' is usually stronger as 'The defender cleared the ball'. Idiomatic football passives such as 'was sent off' are fine." },
    { id: "kb.general.repetition", title: "Vary repeated words", types: ["general-writing"], topic: "style",
        principle: "Repeating a key word can be deliberate, but accidental repetition tires the reader.",
        explanation: "If the same descriptive word appears several times in a short stretch, consider whether each use adds anything." },
    { id: "kb.regional.uk-spelling", title: "British spelling for British audiences", types: ["general-writing"], topic: "spelling", region: "GB",
        principle: "Use British spellings and football terms for a British audience.",
        explanation: "Use 'defence', 'centre' and 'organise', and 'football' rather than 'soccer', unless quoting someone or following a house style that says otherwise.",
        limitations: "Applies when the writer's audience is British. Direct quotations keep the speaker's spelling." },
    { id: "kb.format.scoreline", title: "Write scorelines consistently", types: ["match-report", "match-preview", "football-news", "general-sports-news"], topic: "consistency", region: "GB",
        principle: "Format scorelines the same way throughout, for example '2-1'.",
        explanation: "Pick one format (winner's score first in a report) and use it everywhere. Check the numbers against the official record before publishing.",
        limitations: "House styles differ. Check your publication's guide." },
];
/** Builds the starter knowledge base: original guidance only, no scraped material. */
export function buildSeedKnowledgeBase() {
    const kb = new KnowledgeBase();
    for (const s of SEEDS) {
        const res = kb.ingest({
            id: s.id, title: s.title, journalismTypes: s.types, topic: s.topic, region: s.region, language: "en",
            principle: s.principle, explanation: s.explanation, exercise: s.exercise,
            source: SRC, licence: LIC, collectedAt: DATE, reviewedAt: DATE, reviewedBy: "project-seed (not yet externally reviewed)",
            durability: "durable", confidence: 0.7, limitations: s.limitations ?? "General guidance. A house style or editor may differ.",
        }, "seed");
        if (!res.ok)
            throw new Error(`Seed item ${s.id} invalid: ${res.errors.join("; ")}`);
        kb.approve(s.id, "project-seed (not yet externally reviewed)");
    }
    return kb;
}
