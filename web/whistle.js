import { h } from "../extension/dom.js";
import { live, newDraft, newGraphic, newId, newMatch, newPost, newProject } from "../core/suite/model.js";
import { clockMinute, eventLabel, eventLine, isGoal, nextPhase, postText, reportDraft, score, scorers, teamName, timeline, whistleMinute } from "../core/suite/match.js";
import { defaultDesign } from "../core/suite/design.js";
import { countChars, PLATFORM_INFO } from "../core/suite/ripple.js";
import { app, empty, field, go, link, persist, projects, section, setStatus, today } from "./ui.js";
import { defaultBrand } from "./brand.js";
import { sportsdb } from "./sleuth.js";
/**
 * Whistle: live matchday coverage, made for a phone at the ground. Log goals, cards, subs and moments with the minute
 * filled in from the match clock; get a post for each moment, score graphics in your brand kit, and a match report
 * draft at the final whistle. Everything is built only from what you logged, and works without the laptop.
 */
const STATUS_LABEL = { pre: "Not started", "1H": "First half", HT: "Half-time", "2H": "Second half", FT: "Full-time" };
const matches = () => app.store.records().filter((r) => r.kind === "match" && live(r));
const names = (v) => v.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean).slice(0, 40);
export function whistleHome() {
    const all = matches().sort((a, b) => Number(b.status !== "FT" && b.status !== "pre") - Number(a.status !== "FT" && a.status !== "pre") || (b.date || "").localeCompare(a.date || "") || b.updatedAt - a.updatedAt);
    const ps = projects().sort((a, b) => b.updatedAt - a.updatedAt);
    const project = h("select", { "aria-label": "Project" }, h("option", { value: "" }, "A new project for this match"), ...ps.map((p) => h("option", { value: p.id }, p.title)));
    const inp = (label, value = "", type = "text") => h("input", { type, value, "aria-label": label, autocomplete: "off" });
    const home = inp("Home team"), away = inp("Away team"), comp = inp("Competition"), venue = inp("Venue"), date = inp("Date", today(), "date");
    const homeSquad = h("textarea", { rows: 3, "aria-label": "Home squad (optional)", placeholder: "Starting XI first, then substitutes. One name per line, or commas" });
    const awaySquad = h("textarea", { rows: 3, "aria-label": "Away squad (optional)", placeholder: "Starting XI first, then substitutes. One name per line, or commas" });
    // The club's next fixtures (TheSportsDB, free): one tap fills in the teams, competition, venue and date.
    const fixtureOut = h("div", { role: "status" });
    const findBtn = h("button", { type: "button", class: "small" }, "Find the next fixtures");
    findBtn.addEventListener("click", async () => {
        const club = home.value.trim() || away.value.trim();
        if (!club) {
            setStatus("Type your club in Home team first.", "err");
            home.focus();
            return;
        }
        findBtn.disabled = true;
        fixtureOut.replaceChildren(h("p", { class: "hint" }, "Looking up…"));
        try {
            const team = ((await sportsdb(`searchteams.php?t=${encodeURIComponent(club)}`)).teams ?? []).find((t) => t.strSport === "Soccer");
            if (!team) {
                fixtureOut.replaceChildren(h("p", null, "No club found with that name. Try the full name, or fill the match in yourself."));
                return;
            }
            const events = ((await sportsdb(`eventsnext.php?id=${team.idTeam}`)).events ?? []).slice(0, 5);
            if (!events.length) {
                fixtureOut.replaceChildren(h("p", null, `No upcoming fixtures listed for ${team.strTeam}. Fill the match in yourself.`));
                return;
            }
            fixtureOut.replaceChildren(h("ul", { class: "items" }, ...events.map((ev) => h("li", null, h("span", null, `${ev.dateEvent ?? ""}: ${ev.strHomeTeam} v ${ev.strAwayTeam}${ev.strLeague ? " · " + ev.strLeague : ""}`), h("button", { type: "button", class: "small", onClick: () => {
                    home.value = ev.strHomeTeam ?? "";
                    away.value = ev.strAwayTeam ?? "";
                    comp.value = ev.strLeague ?? "";
                    venue.value = ev.strVenue ?? "";
                    if (/^\d{4}-\d{2}-\d{2}$/.test(ev.dateEvent ?? ""))
                        date.value = ev.dateEvent;
                    fixtureOut.replaceChildren(h("p", { class: "hint" }, "Filled in from TheSportsDB, a free community database: check the details."));
                } }, "Use")))));
        }
        catch (e) {
            fixtureOut.replaceChildren(h("p", { class: "status err" }, `Could not look up fixtures (${e.message}). Fill the match in yourself.`));
        }
        finally {
            findBtn.disabled = false;
        }
    });
    // Picking a project fills in its club as the home side.
    project.addEventListener("change", () => { const p = ps.find((x) => x.id === project.value); if (p?.clubs[0] && !home.value)
        home.value = p.clubs[0]; });
    const create = async (e) => {
        e.preventDefault();
        if (!home.value.trim() || !away.value.trim()) {
            setStatus("Enter both teams.", "err");
            (home.value.trim() ? away : home).focus();
            return;
        }
        let p = ps.find((x) => x.id === project.value);
        const made = [];
        if (!p) {
            p = newProject({ title: `${home.value.trim()} v ${away.value.trim()}`, subject: "match", clubs: [home.value.trim(), away.value.trim()] });
            made.push(p);
        }
        const m = newMatch(p.id, { home: home.value, away: away.value, competition: comp.value.trim(), venue: venue.value.trim(), date: date.value, homeSquad: names(homeSquad.value), awaySquad: names(awaySquad.value) });
        made.push(m);
        if (await persist(() => app.store.save(...made), "Match ready", { rerender: false }))
            go(`#/match/${m.id}`);
    };
    return h("div", null, h("h1", null, "Whistle"), h("p", { class: "lead" }, "Live matchday coverage from your phone: log goals, cards and moments as they happen, post each one, make score graphics, and get a match report draft at the final whistle. Built only from what you log."), section("Matches", all.length ? h("ul", { class: "items" }, ...all.map((m) => { const s = score(m); return h("li", null, link(`#/match/${m.id}`, `${m.home} ${s.home}-${s.away} ${m.away}`), h("span", { class: "meta" }, `${STATUS_LABEL[m.status]}${m.date ? " · " + m.date : ""}${m.competition ? " · " + m.competition : ""}`)); })) : empty("No matches yet.")), section("New match", h("form", { onSubmit: (e) => void create(e) }, field("Project", project, "Keeps the match with your research, interviews and article for it."), h("div", { class: "grid tight" }, field("Home team", home), field("Away team", away)), h("div", { class: "row" }, findBtn), fixtureOut, h("div", { class: "grid tight" }, field("Competition", comp), field("Venue", venue), field("Date", date)), h("details", null, h("summary", null, "Squads (optional: makes logging faster)"), h("div", { class: "grid tight" }, field("Home squad", homeSquad), field("Away squad", awaySquad))), h("button", { type: "submit", class: "primary" }, "Create match"))));
}
// What is open on a match page (kept across the re-render that follows each save).
let editing = null;
let posting = null;
let focusedFor = "";
const EXTRA = { goal: "Assist (optional)", "pen-goal": "", "own-goal": "", sub: "Player off" };
const PLAYER = { goal: "Scorer", "pen-goal": "Penalty taker", "own-goal": "Player who put it in his own net", sub: "Player on", yellow: "Player", red: "Player", "pen-miss": "Penalty taker", chance: "Player (optional)", save: "Goalkeeper (optional)", injury: "Player (optional)" };
export function matchPage(m0) {
    const p = app.store.get(m0.projectId);
    if (!p)
        return empty("This match's project is missing.");
    const fresh = () => app.store.get(m0.id);
    const m = fresh();
    const s = score(m);
    const save = (next, msg) => persist(() => app.store.save(next), msg);
    // ---- the scoreboard and the clock
    const clock = h("span", { class: "clock", "aria-live": "off" });
    const tick = () => { const c = clockMinute(fresh(), Date.now()); clock.textContent = c ? `${c}'` : STATUS_LABEL[fresh().status]; };
    tick();
    const timer = window.setInterval(() => { if (!clock.isConnected) {
        window.clearInterval(timer);
        return;
    } tick(); }, 5000);
    const phase = nextPhase(m.status);
    const whistle = async () => {
        const cur = fresh();
        const ph = nextPhase(cur.status);
        if (!ph)
            return;
        const now = Date.now();
        const minute = ph.event === "kick-off" ? "1" : ph.event === "second-half" ? "46" : whistleMinute(clockMinute(cur, now), ph.event);
        const ev = { id: newId(), type: ph.event, minute, team: "", player: "", other: "", note: "", at: now };
        if (ph.event === "half-time" || ph.event === "full-time")
            posting = { matchId: cur.id, eventId: ev.id }; // the HT / FT post, ready to go
        await save({ ...cur, status: ph.status, periodStart: ph.status === "1H" || ph.status === "2H" ? now : 0, events: [...cur.events, ev] }, ph.label);
    };
    const undoWhistle = async () => {
        const cur = fresh();
        const order = ["pre", "1H", "HT", "2H", "FT"];
        const back = order[order.indexOf(cur.status) - 1];
        if (!back)
            return;
        const phaseType = nextPhase(back).event;
        const last = [...cur.events].reverse().find((e) => e.type === phaseType);
        if (!confirm(`Undo “${nextPhase(back).label}”? The match goes back to ${STATUS_LABEL[back].toLowerCase()}.`))
            return;
        const events = cur.events.filter((e) => e !== last);
        // The clock restarts from when that half actually kicked off.
        const startOf = (t) => [...events].reverse().find((e) => e.type === t)?.at ?? Date.now();
        await save({ ...cur, status: back, events, periodStart: back === "1H" ? startOf("kick-off") : back === "2H" ? startOf("second-half") : 0 }, "Undone");
    };
    // Match the referee's clock: type the minute it is now.
    const clockIn = h("input", { type: "number", inputmode: "numeric", "aria-label": "Minute now", placeholder: "Minute now", class: "minute" });
    const setClock = async () => {
        const cur = fresh();
        if (cur.status !== "1H" && cur.status !== "2H")
            return;
        const n = Number(clockIn.value);
        const [lo, hi] = cur.status === "1H" ? [1, 60] : [46, 120];
        if (!Number.isInteger(n) || n < lo || n > hi) {
            setStatus(`Enter a whole minute between ${lo} and ${hi}.`, "err");
            return;
        }
        await save({ ...cur, periodStart: Date.now() - (n - lo) * 60_000 - 30_000 }, "Clock set");
    };
    const board = h("div", { class: "scoreboard", "data-status": m.status }, h("div", { class: "side" }, h("span", { class: "team" }, m.home), h("span", { class: "goals", "aria-label": `${m.home} ${s.home}` }, String(s.home))), h("div", { class: "mid" }, clock, h("span", { class: "meta" }, [m.competition, m.venue].filter(Boolean).join(" · "))), h("div", { class: "side away" }, h("span", { class: "goals", "aria-label": `${m.away} ${s.away}` }, String(s.away)), h("span", { class: "team" }, m.away)));
    const phaseRow = h("div", { class: "row phase-row" }, phase ? h("button", { type: "button", class: "primary big", onClick: () => void whistle() }, phase.label) : h("span", { class: "status ok" }, "Full-time"), m.status === "1H" || m.status === "2H" ? h("form", { class: "row set-clock", onSubmit: (e) => { e.preventDefault(); void setClock(); } }, clockIn, h("button", { type: "submit", class: "small" }, "Set the clock")) : null, m.status !== "pre" ? h("button", { type: "button", class: "small", onClick: () => void undoWhistle() }, "Undo last whistle") : null);
    // ---- logging an event: one tap opens a short form with the minute already filled in
    const open = (type, team) => {
        const cur = fresh();
        const last = timeline(cur).at(-1);
        editing = { matchId: cur.id, isNew: true, event: { id: newId(), type, minute: clockMinute(cur, Date.now()) || last?.minute || "", team, player: "", other: "", note: "", at: Date.now() } };
        app.render();
    };
    const pad = (side) => h("div", { class: "pad", "aria-label": `${teamName(m, side)} events`, role: "group" }, h("p", { class: "pad-team" }, teamName(m, side)), ...[["goal", "Goal"], ["pen-goal", "Penalty goal"], ["own-goal", "Own goal for them"], ["yellow", "Yellow"], ["red", "Red"], ["sub", "Sub"], ["chance", "Chance"], ["pen-miss", "Missed pen"]]
        .map(([t, label]) => h("button", { type: "button", class: `pad-btn pad-${t}`, onClick: () => open(t, side), "aria-label": `${label}, ${teamName(m, side)}` }, label)));
    const general = h("div", { class: "row" }, ...(m.status === "FT" ? [["note", "Note"]] : [["note", "Note"], ["save", "Save"], ["var", "VAR"], ["injury", "Injury"]]).map(([t, label]) => h("button", { type: "button", class: "small", onClick: () => open(t, "") }, label)));
    const editor = editing && editing.matchId === m.id ? eventForm(m, editing.event, editing.isNew) : null;
    // ---- the post for one moment
    const post = posting && posting.matchId === m.id ? m.events.find((e) => e.id === posting.eventId) : undefined;
    const postBox = post ? postCard(m, post, p) : null;
    // ---- the timeline, newest first
    const items = [...timeline(m)].reverse();
    const list = items.length ? h("ol", { class: "timeline", reversed: true }, ...items.map((e) => h("li", { class: `ev ev-${e.type}${isGoal(e) ? " ev-goal" : ""}` }, h("span", { class: "ev-text" }, eventLine(m, e)), h("div", { class: "row" }, h("button", { type: "button", class: "small", onClick: () => { posting = { matchId: m.id, eventId: e.id }; app.render(); } }, "Post"), ["kick-off", "half-time", "second-half", "full-time"].includes(e.type) ? null : h("button", { type: "button", class: "small", onClick: () => { editing = { matchId: m.id, event: { ...e }, isNew: false }; app.render(); } }, "Edit"), ["kick-off", "half-time", "second-half", "full-time"].includes(e.type) ? null : h("button", { type: "button", class: "small danger", "aria-label": `Delete: ${eventLine(m, e)}`, onClick: async () => {
            if (!confirm(`Delete “${eventLine(m, e)}”?`))
                return;
            if (posting?.eventId === e.id)
                posting = null;
            await save({ ...fresh(), events: fresh().events.filter((x) => x.id !== e.id) }, "Deleted");
        } }, "Delete"))))) : empty("Nothing logged yet. Press Kick-off when the match starts.");
    // ---- graphics and the report
    keepScreenOn(m);
    const report = async () => {
        const cur = fresh();
        const r = reportDraft(cur);
        const d = { ...newDraft(p.id, r.headline, "match-report"), body: r.body };
        const linked = { ...cur, draftId: d.id };
        if (await persist(() => app.store.save(d, linked), "Report draft made", { rerender: false }))
            go(`#/draft/${d.id}`);
    };
    const existing = m.draftId ? app.store.get(m.draftId) : undefined;
    const potm = h("input", { type: "text", value: m.playerOfMatch, list: "potm-" + m.id, "aria-label": "Player of the match", autocomplete: "off" });
    const potmList = h("datalist", { id: "potm-" + m.id }, ...[...m.homeSquad, ...m.awaySquad].map((n) => h("option", { value: n })));
    const wakeNote = h("p", { class: "hint", "data-wake": "" }, wake.active ? "Your screen stays on while the match is live." : "");
    // ---- details and squads
    const det = { comp: h("input", { type: "text", value: m.competition, "aria-label": "Competition" }), venue: h("input", { type: "text", value: m.venue, "aria-label": "Venue" }),
        homeSquad: h("textarea", { rows: 3, value: m.homeSquad.join("\n"), "aria-label": `${m.home} squad` }), awaySquad: h("textarea", { rows: 3, value: m.awaySquad.join("\n"), "aria-label": `${m.away} squad` }) };
    return h("div", { class: "whistle-page" }, h("p", { class: "crumbs" }, link("#/tool/whistle", "Whistle"), " / ", link(`#/project/${p.id}`, p.title)), h("h1", { class: "sr-only" }, `${m.home} v ${m.away}`), board, phaseRow, potmList, editor, postBox, m.status === "pre" ? null : section(m.status === "FT" ? "Add a note" : "Log a moment", m.status === "FT" ? null : h("div", { class: "pads" }, pad("home"), pad("away")), general), section("Timeline", list), section("Graphics and report", h("div", { class: "row" }, h("button", { type: "button", onClick: () => void makeGraphic(fresh(), p, { kind: "score" }) }, m.status === "FT" ? "Full-time graphic" : m.status === "HT" ? "Half-time graphic" : "Score graphic"), ...["home", "away"].filter((side) => (side === "home" ? m.homeSquad : m.awaySquad).length >= 11).map((side) => h("button", { type: "button", onClick: () => void makeGraphic(fresh(), p, { kind: "lineup", side }) }, `Line-up graphic: ${teamName(m, side)}`)), h("button", { type: "button", class: m.status === "FT" ? "primary" : "", onClick: () => void report() }, existing && live(existing) ? "Make a fresh report draft" : "Write the match report"), existing && live(existing) ? link(`#/draft/${existing.id}`, "Open the report") : null), m.status === "FT" || m.playerOfMatch ? h("form", { class: "row potm", onSubmit: (e) => { e.preventDefault(); void save({ ...fresh(), playerOfMatch: potm.value.trim() }, "Player of the match saved"); } }, field("Player of the match", potm), h("button", { type: "submit", class: "small" }, "Save player of the match")) : null, h("p", { class: "hint" }, "The report draft has the result, each goal and sending-off in order with your notes, and a facts box. Add the colour, quotes and analysis in Inkling, or ask its AI for a first draft from it. Line-up graphics appear once a squad has 11 names (starting XI first)."), wakeNote), h("details", { class: "panel" }, h("summary", null, h("h2", null, "Match details and squads")), h("div", { class: "grid tight" }, field("Competition", det.comp), field("Venue", det.venue)), h("div", { class: "grid tight" }, field(`${m.home} squad`, det.homeSquad), field(`${m.away} squad`, det.awaySquad)), h("button", { type: "button", onClick: () => void save({ ...fresh(), competition: det.comp.value.trim(), venue: det.venue.value.trim(), homeSquad: names(det.homeSquad.value), awaySquad: names(det.awaySquad.value) }, "Details saved") }, "Save details")));
}
/** The short form for one moment: minute, player, the extra name (assist / player off) and the reporter's note. */
function eventForm(m, e, isNew) {
    const squadOf = (side) => (side === "home" ? m.homeSquad : side === "away" ? m.awaySquad : [...m.homeSquad, ...m.awaySquad]);
    // An own goal is scored by a player of the other side.
    const playerSide = e.type === "own-goal" ? (e.team === "home" ? "away" : e.team === "away" ? "home" : "") : e.team;
    const listId = "squad-" + e.id;
    const otherList = "squad2-" + e.id;
    const minute = h("input", { type: "text", inputmode: "numeric", value: e.minute, "aria-label": "Minute", placeholder: "23 or 45+2", class: "minute" });
    const team = h("select", { "aria-label": "Team" }, h("option", { value: "" }, "Neither team"), h("option", { value: "home", selected: e.team === "home" }, m.home), h("option", { value: "away", selected: e.team === "away" }, m.away));
    const player = h("input", { type: "text", value: e.player, list: listId, "aria-label": PLAYER[e.type] ?? "Player (optional)", autocomplete: "off" });
    const other = h("input", { type: "text", value: e.other, list: otherList, "aria-label": EXTRA[e.type] || "Other player", autocomplete: "off" });
    const note = h("textarea", { rows: 2, value: e.note, "aria-label": "Your note (optional)", placeholder: "What happened, in your words" });
    // What is typed is kept on the open event as it is typed, so a redraw of the page (a save, another tab) never loses it.
    minute.addEventListener("input", () => { e.minute = minute.value; });
    team.addEventListener("change", () => { e.team = team.value; });
    player.addEventListener("input", () => { e.player = player.value; });
    other.addEventListener("input", () => { e.other = other.value; });
    note.addEventListener("input", () => { e.note = note.value; });
    const submit = async (ev) => {
        ev.preventDefault();
        const min = minute.value.trim().replace(/['’\s]/g, "");
        if (min && !/^\d{1,3}(\+\d{1,2})?$/.test(min)) {
            setStatus("Write the minute as a number, like 23 or 45+2.", "err");
            minute.focus();
            return;
        }
        if (isGoal(e) && !team.value) {
            setStatus("Choose which team the goal counts for.", "err");
            team.focus();
            return;
        }
        const next = { ...e, minute: min, team: team.value, player: player.value.trim(), other: other.value.trim(), note: note.value.trim() };
        const cur = app.store.get(m.id);
        editing = null;
        // A goal or a red card gets its post ready straight away.
        if (isNew && (isGoal(next) || next.type === "red" || next.type === "pen-miss"))
            posting = { matchId: m.id, eventId: next.id };
        await persist(() => app.store.save({ ...cur, events: isNew ? [...cur.events, next] : cur.events.map((x) => (x.id === next.id ? next : x)) }), isNew ? `${eventLabel(next.type)} logged` : "Updated");
    };
    const needsOther = e.type in EXTRA && EXTRA[e.type];
    const form = h("form", { class: "panel event-form", onSubmit: (ev) => void submit(ev) }, h("h2", null, `${isNew ? "" : "Edit: "}${eventLabel(e.type)}${e.team ? `, ${teamName(m, e.team)}` : ""}`), h("datalist", { id: listId }, ...squadOf(playerSide).map((n) => h("option", { value: n }))), h("datalist", { id: otherList }, ...squadOf(e.team).map((n) => h("option", { value: n }))), h("div", { class: "grid tight" }, field("Minute", minute), field("Counts for", team)), e.type === "note" || e.type === "var" ? null : field(PLAYER[e.type] ?? "Player (optional)", player), needsOther ? field(EXTRA[e.type], other) : null, field("Your note (optional)", note), h("div", { class: "row" }, h("button", { type: "submit", class: "primary" }, isNew ? "Log it" : "Save"), h("button", { type: "button", onClick: () => { editing = null; app.render(); } }, "Cancel")));
    // Focus the first field once, when the form opens (not again on a redraw, which would pull the cursor away).
    if (focusedFor !== e.id) {
        focusedFor = e.id;
        requestAnimationFrame(() => (e.type === "note" || e.type === "var" ? note : player).focus());
    }
    return form;
}
/** The ready-made post for a moment: edit, copy, share from the phone, or keep it in Ripple. */
function postCard(m, e, p) {
    const text = h("textarea", { rows: 5, value: postText(m, e), "aria-label": "Post text" });
    const counts = h("p", { class: "meta" });
    const count = () => { counts.textContent = ["x", "bluesky"].map((pl) => { const n = countChars(text.value, pl), lim = PLATFORM_INFO[pl].limit; return `${PLATFORM_INFO[pl].label}: ${n}/${lim}${n > lim ? " (too long)" : ""}`; }).join(" · "); };
    text.addEventListener("input", count);
    count();
    const platform = h("select", { "aria-label": "Platform" }, ...["x", "bluesky", "threads", "instagram", "facebook"].map((pl) => h("option", { value: pl }, PLATFORM_INFO[pl].label)));
    const canShare = typeof navigator.share === "function";
    return section(`Post: ${eventLabel(e.type)}${e.minute ? ` (${e.minute}')` : ""}`, text, counts, h("div", { class: "row" }, h("button", { type: "button", class: "primary", onClick: async () => { try {
            await navigator.clipboard.writeText(text.value);
            setStatus("Copied: paste it into X, Bluesky or any app");
        }
        catch {
            setStatus("Copy blocked by the browser: select the text and copy it.", "err");
        } } }, "Copy"), canShare ? h("button", { type: "button", onClick: async () => { try {
            await navigator.share({ text: text.value });
        }
        catch { /* the writer closed the share sheet */ } } }, "Share…") : null, isGoal(e) ? h("button", { type: "button", onClick: () => void makeGraphic(app.store.get(m.id), p, { kind: "goal", event: e }) }, "Goal graphic") : null, platform, h("button", { type: "button", onClick: async () => {
            const post = newPost(p.id, platform.value, text.value, { title: `${eventLabel(e.type)}: ${m.home} v ${m.away}`.slice(0, 60) });
            if (await persist(() => app.store.save(post), "Saved in Ripple", { rerender: false })) {
                posting = null;
                app.render();
            }
        } }, "Keep in Ripple"), h("button", { type: "button", class: "small", onClick: () => { posting = null; app.render(); } }, "Close")), h("p", { class: "hint" }, "Built from what you logged. Share opens your phone's apps; nothing is posted for you."));
}
/** One Pixel graphic from the match, in the default brand kit, opened in the maker: the score, a goal, or a line-up. */
async function makeGraphic(m, p, what) {
    const kit = defaultBrand();
    const brand = (d) => { if (kit)
        Object.assign(d, { brandId: kit.id, bg: kit.bg, accent: kit.accent, text: kit.text, font: kit.font }); return d; };
    let title, design, headline;
    if (what.kind === "lineup") {
        const squad = what.side === "home" ? m.homeSquad : m.awaySquad;
        const team = teamName(m, what.side);
        design = brand({ ...defaultDesign("lineup", { text: "#ffffff", bg: "#12233f" }), main: team, lines: squad.slice(0, 11).join("\n"), extra: squad.slice(11).join(", "), competition: m.competition, venue: m.venue, when: m.date });
        title = `Line-up: ${team} v ${teamName(m, what.side === "home" ? "away" : "home")}`;
        headline = `${team} starting XI`;
    }
    else {
        const sc = score(m, what.kind === "goal" ? what.event : undefined);
        const tag = what.kind === "goal" ? "Goal" : m.status === "FT" ? "Full time" : m.status === "HT" ? "Half time" : m.status === "pre" ? "Matchday" : "Live";
        const sub = what.kind === "goal" ? `${what.event.type === "own-goal" ? `Own goal${what.event.player ? " (" + what.event.player + ")" : ""}` : what.event.player || teamName(m, what.event.team)} ${what.event.minute}'${what.event.type === "pen-goal" ? " (pen)" : ""}`
            : [scorers(m, "home"), scorers(m, "away")].filter(Boolean).join(" | ");
        design = brand({ ...defaultDesign("result", { text: "#ffffff", bg: "#12233f" }), kicker: tag, home: m.home, away: m.away, homeScore: String(sc.home), awayScore: String(sc.away), sub, competition: m.competition, venue: m.venue, when: m.date });
        title = `${tag}: ${m.home} ${sc.home}-${sc.away} ${m.away}`;
        headline = `${m.home} ${sc.home}-${sc.away} ${m.away}`;
    }
    const g = newGraphic(p.id, title.slice(0, 120), "matchday", what.kind === "lineup" ? "ig-portrait" : "x-feed");
    if (await persist(() => app.store.save({ ...g, design, headline, textColour: design.text, backgroundColour: design.bg, brief: `Made in Whistle from the match log.` }), "Graphic made", { rerender: false }))
        go(`#/make/${g.id}`);
}
/**
 * Keeps the phone's screen on while a match is live (the Screen Wake Lock API), so it does not lock between moments.
 * Released at full-time or when the reporter leaves the match page; taken again when they come back to the tab.
 */
const wake = { lock: null, matchId: "", active: false };
function keepScreenOn(m) {
    const wanted = m.status === "1H" || m.status === "HT" || m.status === "2H";
    const api = navigator.wakeLock;
    if (!wanted || !api) {
        void releaseWake();
        return;
    }
    wake.matchId = m.id;
    if (!wake.lock)
        api.request("screen").then((l) => { wake.lock = l; wake.active = true; document.querySelectorAll("[data-wake]").forEach((n) => (n.textContent = "Your screen stays on while the match is live.")); l.addEventListener?.("release", () => { wake.lock = null; wake.active = false; }); }).catch(() => { });
}
async function releaseWake() { const l = wake.lock; wake.lock = null; wake.active = false; await l?.release().catch(() => undefined); }
// Leaving the match page releases it; coming back to the tab takes it again (the browser drops it when hidden).
window.addEventListener("hashchange", () => { if (!location.hash.startsWith("#/match/" + wake.matchId))
    void releaseWake(); });
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || !location.hash.startsWith("#/match/"))
        return;
    const m = app.store?.get(location.hash.split("/")[2] ?? "");
    if (m && m.kind === "match")
        keepScreenOn(m);
});
