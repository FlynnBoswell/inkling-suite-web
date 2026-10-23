/** Only these may enter the knowledge base. Everything else is refused (spec section 25). */
export const PERMITTED_LICENCES = ["original", "public-domain", "cc-by", "cc-by-sa", "permission-granted"];
export const LIMITS = { title: 120, principle: 300, explanation: 1200, exerciseWords: 40, limitations: 400 };
const TYPES = ["match-report", "match-preview", "interview-profile", "football-news", "analysis-opinion", "long-form", "general-sports-news", "reaction", "blog", "general-writing"];
/** Reference text is data, never instructions. Items that look like instructions are rejected. */
const INSTRUCTION_LIKE = /(ignore (all |any |the )?(previous|prior|above) (instructions|rules)|system prompt|disregard .{0,30}(rules|instructions)|you must now|reveal .{0,20}(key|secret))/i;
export function wordsIn(s) {
    return (s.match(/\S+/g) ?? []).length;
}
export function validateKnowledgeItem(x) {
    const errors = [];
    if (typeof x !== "object" || x === null)
        return { ok: false, errors: ["Item must be an object."] };
    const o = x;
    const str = (k, max, required = true) => {
        const v = o[k];
        if (v === undefined || v === null || v === "") {
            if (required)
                errors.push(`${k} is required.`);
            return;
        }
        if (typeof v !== "string")
            errors.push(`${k} must be text.`);
        else if (v.length > max)
            errors.push(`${k} is too long (max ${max} characters).`);
    };
    str("id", 80);
    str("title", LIMITS.title);
    str("topic", 80);
    str("language", 8);
    str("principle", LIMITS.principle);
    str("explanation", LIMITS.explanation);
    str("limitations", LIMITS.limitations);
    str("collectedAt", 40);
    str("reviewedAt", 40);
    str("reviewedBy", 80);
    if (o.id && !/^[a-z0-9][a-z0-9._-]*$/.test(o.id))
        errors.push("id may only use lowercase letters, numbers, dots, dashes and underscores.");
    if (!Array.isArray(o.journalismTypes) || o.journalismTypes.length === 0 || !o.journalismTypes.every((t) => TYPES.includes(t)))
        errors.push("journalismTypes must be a non-empty list of known types.");
    if (typeof o.exercise === "string" && wordsIn(o.exercise) > LIMITS.exerciseWords)
        errors.push(`exercise is longer than ${LIMITS.exerciseWords} words. Long passages are not stored.`);
    if (!o.source || typeof o.source.title !== "string" || !o.source.title)
        errors.push("source.title is required (provenance).");
    if (!o.licence || typeof o.licence.status !== "string")
        errors.push("licence.status is required.");
    if (typeof o.confidence !== "number" || o.confidence < 0 || o.confidence > 1)
        errors.push("confidence must be a number from 0 to 1.");
    if (o.durability !== "durable" && o.durability !== "time-sensitive")
        errors.push("durability must be 'durable' or 'time-sensitive'.");
    const all = [o.title, o.principle, o.explanation, o.exercise, o.limitations].filter((v) => typeof v === "string").join("\n");
    if (INSTRUCTION_LIKE.test(all))
        errors.push("Text contains instruction-like content and cannot be stored as reference material.");
    if (errors.length)
        return { ok: false, errors };
    return { ok: true, item: { ...o, status: "pending", version: typeof o.version === "number" ? o.version : 1 } };
}
export const MODE_TYPES = {
    general: ["general-writing"],
    "match-report": ["match-report", "general-sports-news", "general-writing"],
    "match-preview": ["match-preview", "general-sports-news", "general-writing"],
    "post-match-reaction": ["reaction", "interview-profile", "general-writing"],
    "player-feature": ["interview-profile", "long-form", "general-writing"],
    "football-news": ["football-news", "general-sports-news", "general-writing"],
    "tactical-analysis": ["analysis-opinion", "general-writing"],
    "football-blog": ["blog", "analysis-opinion", "general-writing"],
};
