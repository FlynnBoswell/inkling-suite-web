/**
 * Whistle: live matchday coverage. Everything here is built only from what the reporter logged (the teams, the
 * events, their own notes), so posts, graphics and the report skeleton never say more than they saw.
 */
const GOALS = ["goal", "pen-goal", "own-goal"];
export const isGoal = (e) => GOALS.includes(e.type);
export const teamName = (m, side) => (side === "home" ? m.home : side === "away" ? m.away : "");
const other = (side) => (side === "home" ? "away" : side === "away" ? "home" : "");
/** "45+2" sorts after "45" and before "46". */
export function minuteValue(minute) {
    const m = /^(\d{1,3})(?:\+(\d{1,2}))?$/.exec(minute.trim());
    return m ? Number(m[1]) + (m[2] ? Number(m[2]) / 100 : 0) : Infinity;
}
/** Events in match order (by minute, then by when they were logged). */
export const timeline = (m) => [...m.events].sort((a, b) => minuteValue(a.minute) - minuteValue(b.minute) || a.at - b.at);
/**
 * The score, optionally only up to and including one event. At half-time that means every first-half goal (up to
 * 45+), however late it was logged; at full-time, every goal.
 */
export function score(m, upTo) {
    const s = { home: 0, away: 0 };
    for (const e of upToEvent(m, upTo))
        if (isGoal(e) && (e.team === "home" || e.team === "away"))
            s[e.team]++;
    return s;
}
function upToEvent(m, upTo) {
    const list = timeline(m);
    if (!upTo || upTo.type === "full-time")
        return list;
    if (upTo.type === "half-time")
        return list.filter((e) => minuteValue(e.minute) < 46 || (!e.minute && e.at <= upTo.at));
    const i = list.findIndex((x) => x.id === upTo.id);
    return i < 0 ? list : list.slice(0, i + 1);
}
/** The minute to stamp on a whistle: never earlier than the end of the half (a half-time pressed early still reads 45). */
export function whistleMinute(clock, phase) {
    const floor = phase === "half-time" ? 45 : 90;
    return clock && minuteValue(clock) >= floor ? clock : String(floor);
}
export const scoreLine = (m, s = score(m)) => `${m.home} ${s.home}-${s.away} ${m.away}`;
/** The live minute, as reports write it: 1 to 45 then 45+1, 46 to 90 then 90+1. Empty when no half is running. */
export function clockMinute(m, now) {
    if ((m.status !== "1H" && m.status !== "2H") || !m.periodStart)
        return "";
    const played = Math.max(0, Math.floor((now - m.periodStart) / 60_000));
    const [start, end] = m.status === "1H" ? [1, 45] : [46, 90];
    const minute = start + played;
    return minute > end ? `${end}+${minute - end}` : String(minute);
}
/** What happens to the match when the reporter presses the next whistle. */
export function nextPhase(status) {
    return status === "pre" ? { status: "1H", event: "kick-off", label: "Kick-off" } : status === "1H" ? { status: "HT", event: "half-time", label: "Half-time" }
        : status === "HT" ? { status: "2H", event: "second-half", label: "Second half" } : status === "2H" ? { status: "FT", event: "full-time", label: "Full-time" } : null;
}
const surname = (name) => name.trim().split(/\s+/).pop() ?? name;
/** Scorers for one side, as fans and reports list them: "Smith 23', 67' (pen), Barnes 81'". Optionally only up to one event. */
export function scorers(m, side, upTo) {
    const by = new Map();
    for (const e of upToEvent(m, upTo))
        if (isGoal(e) && e.team === side) {
            const who = e.type === "own-goal" ? `${surname(e.player || "Own goal")} (og)` : surname(e.player || "Unknown");
            by.set(who, [...(by.get(who) ?? []), `${e.minute}'${e.type === "pen-goal" ? " (pen)" : ""}`]);
        }
    return [...by].map(([who, mins]) => `${who} ${mins.join(", ")}`).join(", ");
}
const LABEL = { goal: "Goal", "pen-goal": "Penalty scored", "own-goal": "Own goal", "pen-miss": "Penalty missed", yellow: "Yellow card", red: "Red card", sub: "Substitution", chance: "Chance", save: "Save", var: "VAR", injury: "Injury", note: "Note", "kick-off": "Kick-off", "half-time": "Half-time", "second-half": "Second half", "full-time": "Full-time" };
export const eventLabel = (t) => LABEL[t];
/** One line for the timeline: "23' Goal, Aldershot Town: Sam Smith (assist Josh Barnes). Fired home from close range." */
export function eventLine(m, e) {
    const team = teamName(m, e.team);
    const who = e.type === "sub" ? [e.player && `on ${e.player}`, e.other && `off ${e.other}`].filter(Boolean).join(", ") : [e.player, e.other && (isGoal(e) ? `assist ${e.other}` : e.other)].filter(Boolean).join(", ");
    return `${e.minute ? e.minute + "' " : ""}${LABEL[e.type]}${team ? `, ${team}` : ""}${who ? `: ${who}` : ""}${e.note ? `. ${e.note.trim()}` : ""}`;
}
/** A ready-to-post update for the moment, built only from what was logged. */
export function postText(m, e) {
    const s = score(m, e);
    const line = scoreLine(m, s);
    const team = teamName(m, e.team);
    const note = e.note.trim() ? `\n\n${e.note.trim()}` : "";
    const min = e.minute ? ` (${e.minute}')` : "";
    switch (e.type) {
        case "goal":
        case "pen-goal":
        case "own-goal": {
            const how = e.type === "pen-goal" ? `${e.player || "A penalty"} scores from the spot` : e.type === "own-goal" ? `An own goal${e.player ? ` by ${e.player}` : ""}` : e.player ? `${e.player} scores${e.other ? `, set up by ${e.other}` : ""}` : `${team} score`;
            return `GOAL! ${line}${min}\n\n${how}.${note}`;
        }
        case "pen-miss": return `Penalty missed${min}: ${e.player ? `${e.player} (${team})` : team} fails to score from the spot. ${line}${note}`;
        case "red": return `Red card${min}: ${e.player ? `${team}'s ${e.player}` : team} is sent off. ${line}${note}`;
        case "yellow": return `Yellow card${min} for ${e.player ? `${team}'s ${e.player}` : team}.${note}`;
        case "sub": return `${team} substitution${min}: ${[e.player && `${e.player} on`, e.other && `${e.other} off`].filter(Boolean).join(", ")}.${note}`;
        case "kick-off": return `We're under way: ${m.home} v ${m.away}${m.competition ? `, ${m.competition}` : ""}${m.venue ? ` at ${m.venue}` : ""}.${note}`;
        case "half-time":
        case "full-time": {
            const tag = e.type === "half-time" ? "HT" : "FT";
            const h = scorers(m, "home", e), a = scorers(m, "away", e);
            const list = [h && `${m.home}: ${h}`, a && `${m.away}: ${a}`].filter(Boolean).join("\n");
            const star = e.type === "full-time" && m.playerOfMatch ? `\n\nPlayer of the match: ${m.playerOfMatch}` : "";
            return `${tag}: ${line}${list ? `\n\n${list}` : ""}${star}${note}`;
        }
        case "second-half": return `Second half under way. ${line}${note}`;
        default: return `${e.minute ? e.minute + "': " : ""}${e.note.trim() || [LABEL[e.type], team, e.player].filter(Boolean).join(", ")}${isGoal(e) ? "" : ` ${line}`}`.trim();
    }
}
/**
 * A match report skeleton from the log: the result first, then each goal, sending-off and missed penalty in order,
 * the reporter's own notes where they wrote them, and a facts box. It says nothing that was not logged; the reporter
 * writes the colour, quotes and analysis around it (or asks Inkling's AI for a first draft from it).
 */
export function reportDraft(m) {
    const fin = score(m);
    const finished = m.status === "FT";
    const res = fin.home > fin.away ? { verb: "beat", a: m.home, b: m.away, s: `${fin.home}-${fin.away}` } : fin.away > fin.home ? { verb: "won at", a: m.away, b: m.home, s: `${fin.away}-${fin.home}` } : null;
    const where = [m.competition && `in the ${m.competition}`, m.venue && `at ${m.venue}`].filter(Boolean).join(" ");
    const day = m.date ? ` on ${new Date(m.date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long" })}` : "";
    const at = where ? " " + where : "";
    const lead = !finished ? `Live: ${scoreLine(m, fin)}${at}.` : res ? `${res.a} ${res.verb} ${res.b} ${res.s}${at}${day}.` : `${m.home} and ${m.away} drew ${fin.home}-${fin.away}${at}${day}.`;
    const paras = [lead];
    const run = { home: 0, away: 0 };
    for (const e of timeline(m)) {
        const team = teamName(m, e.team);
        const opp = teamName(m, other(e.team));
        const on = e.minute ? ` on ${e.minute} minutes` : "";
        let sentence = "";
        if (isGoal(e) && (e.team === "home" || e.team === "away")) {
            const before = { ...run };
            run[e.team]++;
            const mine = run[e.team], theirs = run[other(e.team)];
            const what = before[e.team] < before[other(e.team)] && mine === theirs ? `equalised for ${team}` : mine === 1 && theirs === 0 ? `gave ${team} the lead` : mine > theirs && before[e.team] === before[other(e.team)] ? `put ${team} back in front` : mine > theirs ? `made it ${Math.max(run.home, run.away)}-${Math.min(run.home, run.away)} to ${team}` : `pulled one back for ${team}`;
            const who = e.type === "own-goal" ? `An own goal${e.player ? ` by ${opp}'s ${e.player}` : ""}` : e.type === "pen-goal" ? `${e.player || "A penalty"}${e.player ? " scored a penalty and" : ""}` : e.player || team;
            sentence = e.type === "pen-goal" && !e.player ? `A penalty ${what}${on}.` : `${who} ${what}${on}${e.type !== "own-goal" && e.other ? `, set up by ${e.other}` : ""}.`;
        }
        else if (e.type === "red")
            sentence = `${e.player ? `${team}'s ${e.player}` : `A ${team} player`} was sent off${on}.`;
        else if (e.type === "pen-miss")
            sentence = `${e.player ? `${team}'s ${e.player}` : team} missed a penalty${on}.`;
        if (sentence && e.note.trim())
            sentence += ` ${e.note.trim()}`;
        else if (!sentence && e.note.trim() && !["kick-off", "second-half"].includes(e.type))
            sentence = e.note.trim(); // the reporter's own words, as they wrote them
        if (sentence)
            paras.push(sentence.replace(/\.\./g, "."));
    }
    const facts = [`${scoreLine(m, fin)}${finished ? "" : " (not full-time yet)"}`,
        scorers(m, "home") && `${m.home} scorers: ${scorers(m, "home")}`, scorers(m, "away") && `${m.away} scorers: ${scorers(m, "away")}`,
        ...["yellow", "red"].map((t) => { const list = timeline(m).filter((e) => e.type === t).map((e) => `${e.player || teamName(m, e.team)} (${teamName(m, e.team)}) ${e.minute}'`); return list.length ? `${t === "yellow" ? "Booked" : "Sent off"}: ${list.join(", ")}` : ""; }),
        m.playerOfMatch ? `Player of the match: ${m.playerOfMatch}` : "",
        m.homeSquad.length ? `${m.home}: ${m.homeSquad.join(", ")}` : "", m.awaySquad.length ? `${m.away}: ${m.awaySquad.join(", ")}` : ""].filter(Boolean);
    const headline = finished ? (res ? `${res.a} ${res.verb === "won at" ? "win at" : "beat"} ${res.b} ${res.s}` : `${m.home} and ${m.away} draw ${fin.home}-${fin.away}`) : `Live: ${scoreLine(m, fin)}`;
    return { headline, body: [...paras, "", "Match facts", ...facts].join("\n\n").replace(/\n\n\n\n/g, "\n\n") };
}
/** The log as plain notes, for Inkling's AI first draft. */
export const timelineNotes = (m) => [`${m.home} v ${m.away}${m.competition ? `, ${m.competition}` : ""}${m.venue ? `, ${m.venue}` : ""}${m.date ? `, ${m.date}` : ""}. Score: ${scoreLine(m)}${m.status === "FT" ? " (full-time)" : ""}.`, ...timeline(m).map((e) => eventLine(m, e))].join("\n");
