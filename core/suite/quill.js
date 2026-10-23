import { newId } from "./model.js";
/**
 * Quill: interview preparation without AI. Suggestions are built from the project's own research and from
 * general interviewing practice (original wording, not copied from any publication). The journalist edits,
 * keeps or discards every one.
 */
const q = (theme, text, followUps = [], basedOn) => ({ id: newId(), theme, text, followUps, asked: false, ...(basedOn ? { basedOn } : {}) });
/** Open-ended starters by interview type. */
const BY_TYPE = {
    "pre-match": [
        ["Preparation", "How has the week's preparation gone?", ["What have you worked on most?"]],
        ["Opponent", "What do you expect from the opposition?", ["Where do you think the game will be won or lost?"]],
        ["Squad", "Where are you with selection and fitness?", []],
    ],
    "post-match": [
        ["The result", "How do you sum up the game?", ["What was the turning point?"]],
        ["Key moments", "Talk me through the key moment from your point of view.", []],
        ["Next", "What do you take into the next game?", []],
    ],
    feature: [
        ["Background", "Take me back to where it started for you.", ["Who helped you most early on?"]],
        ["Turning points", "What has been the biggest turning point in your career so far?", ["How did you deal with it at the time?"]],
        ["Now", "What does a normal week look like for you now?", []],
        ["Ambitions", "What would you still like to achieve?", ["What would it take to get there?"]],
    ],
    investigative: [
        ["Their account", "In your own words, what happened?", ["When did you first become aware of it?"]],
        ["Documents", "Is there anything on record that supports your account?", ["Who else could confirm it?"]],
        ["Right of reply", "Is there anything you think has been misrepresented?", []],
    ],
};
const BY_ROLE = {
    manager: [["Approach", "How would you describe the way you want your team to play?", ["How has that changed this season?"]]],
    coach: [["Development", "How do you decide when a young player is ready?", []]],
    player: [["Role", "How would you describe your role in the side?", ["What does the manager ask of you?"]]],
    supporter: [["The club", "What does the club mean to you and the people around you?", []]],
    chair: [["Running the club", "What are the club's priorities off the pitch?", ["How are those decisions made?"]]],
};
/**
 * Suggested questions for an interview. Research is used carefully:
 * - confirmed claims → invite the interviewee's perspective on an established fact;
 * - attributed claims → ask them to respond, stating who said it;
 * - unverified or disputed claims → ask neutrally, never presenting the claim as true.
 */
export function suggestQuestions(iv, p, claims) {
    const out = [];
    for (const [theme, text, f] of [...BY_TYPE[iv.type], ...(BY_ROLE[iv.role] ?? [])])
        out.push(q(theme, text, f));
    for (const rq of p.questions)
        out.push(q("Research questions", rq.endsWith("?") ? rq : rq + "?", [], "question:" + rq.slice(0, 80)));
    for (const c of claims) {
        const fact = c.title.replace(/\.$/, "");
        if (c.status === "confirmed")
            out.push(q("From your research", `${fact}. What did that mean to you at the time?`, ["What did you learn from it?"], c.id));
        else if (c.status === "attributed")
            out.push(q("From your research", `It has been said: “${fact}”. How do you respond to that?`, [], c.id));
        else
            out.push(q("To verify", `I have seen a suggestion I want to check with you: “${fact}”. Is that accurate?`, ["Is there anything you can point me to that confirms it?"], c.id));
    }
    out.push(q("Close", "Is there anything I haven't asked that you'd like to add?", []));
    return out;
}
/** Evidence gaps worth raising: claims without a confirmed status. */
export function researchGaps(claims) { return claims.filter((c) => c.status === "unverified" || c.status === "disputed"); }
/** "[mm:ss] " for the time since `start` (milliseconds). */
export function stamp(start, now = Date.now()) {
    const s = Math.max(0, Math.floor((now - start) / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return `[${h ? h + ":" + String(m).padStart(2, "0") : String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}] `;
}
export function interviewMarkdown(iv, quotes) {
    const L = [`# ${iv.title}`, "", `Interviewee: ${iv.interviewee} (${iv.role}) · ${iv.type}${iv.date ? " · " + iv.date : ""} · ${iv.status}`, `Recording consent: ${iv.recordingConsent}`, ""];
    if (iv.brief)
        L.push("## Brief", "", iv.brief, "");
    L.push("## Questions", "");
    const themes = [...new Set(iv.questions.map((x) => x.theme))];
    for (const t of themes) {
        L.push(`### ${t}`);
        for (const x of iv.questions.filter((y) => y.theme === t)) {
            L.push(`- [${x.asked ? "x" : " "}] ${x.text}`);
            for (const f of x.followUps)
                L.push(`  - Follow-up: ${f}`);
        }
        L.push("");
    }
    if (iv.notes)
        L.push("## Notes", "", iv.notes, "");
    const live = quotes.filter((x) => !x.deletedAt && !x.supersededBy);
    if (live.length) {
        L.push("## Quotes (verbatim)", "");
        for (const x of live)
            L.push(`> "${x.title}"`, `> — ${x.speaker}${x.origin ? ` (${x.origin})` : ""}${x.uncertain ? " [CHECK WORDING]" : ""}`, ...(x.context ? [`Context: ${x.context}`] : []), "");
    }
    if (iv.transcriptOriginal)
        L.push("## Transcript (original, unedited)", "", iv.transcriptOriginal, "");
    if (iv.transcriptEdited && iv.transcriptEdited !== iv.transcriptOriginal)
        L.push("## Transcript (edited copy, not verbatim)", "", iv.transcriptEdited, "");
    return L.join("\n");
}
