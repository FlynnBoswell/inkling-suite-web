import { h, squidIcon } from "../extension/dom.js";
import { childrenOf, claimWarnings, isOverdue, projectStages, live, newNote, newProject, newTask, searchRecords, SUBJECTS, upcomingDeadlines } from "../core/suite/model.js";
import { SuiteStore } from "../core/suite/store.js";
import { ago, app, empty, field, fmtDate, go, link, listText, onOtherTabChange, persist, projectOf, projects, section, setStatus, today, plural } from "./ui.js";
import { IdbBackend } from "./idb.js";
import { icon } from "./icons.js";
import { initBackupFolder } from "./backup-folder.js";
import { claimPage, sleuthHome, sleuthProject, sourcePage } from "./sleuth.js";
import { interviewPage, quillHome, quillProject, quotePage } from "./quill.js";
import { draftEditor, draftsProject, inklingHome } from "./drafts.js";
import { graphicPage, graphicsProject, pixelHome } from "./pixel.js";
import { makerPage } from "./maker.js";
import { brandPage } from "./brand.js";
import { askToKeepData, storageWarning } from "./storage.js";
import { handoffPage } from "./handoff.js";
import { matchPage, whistleHome } from "./whistle.js";
import { score } from "../core/suite/match.js";
import { postPage, rippleHome, socialProject } from "./ripple.js";
import { backupNudge, settingsPage } from "./settings.js";
/**
 * Inkling Suite web app. Hash routes, plain DOM (text only, never HTML), local-first storage.
 * Every control here changes stored data or navigates; nothing is decorative.
 */
const TOOLS = [
    { id: "sleuth", name: "Sleuth", job: "Research: the latest news, articles read in full, claims pulled out and checked, evidence and status.", phase: 3, ready: true },
    { id: "quill", name: "Quill", job: "Interviews: questions from your research, recording, a private transcript and exact quotes.", phase: 4, ready: true },
    { id: "inkling", name: "Inkling", job: "Writing: mistakes underlined as you type, checks against your research and quotes, AI feedback and headlines.", phase: 5, ready: true },
    { id: "pixel", name: "Pixel", job: "Graphics: matchday, results, line-ups and quote cards in your brand kit, with player cut-outs.", phase: 6, ready: true },
    { id: "ripple", name: "Ripple", job: "Social: hooks, threads, carousels and posts made to travel, a calendar, and your real figures.", phase: 7, ready: true },
    { id: "whistle", name: "Whistle", job: "Live matchday coverage: log moments with the minute, post each one, score graphics and a report draft at full-time.", phase: 8, ready: true },
];
const SUBJECT_LABEL = { club: "Club", player: "Player", manager: "Manager", match: "Match", transfer: "Transfer", tactics: "Tactics", other: "Other story" };
const main = () => document.getElementById("main");
// ---------------------------------------------------------------- views
function dashboard() {
    return h("div", null, storageWarning(), backupNudge(), dashboardBody());
}
function dashboardBody() {
    const ps = projects().sort((a, b) => b.updatedAt - a.updatedAt);
    if (!ps.length) {
        return h("div", null, h("h1", null, "Welcome to Inkling Suite"), section("Start your first project", h("p", null, "A project holds everything for one story: a club, player, manager, match, transfer or tactical issue. Notes, tasks, deadlines, research, interviews, drafts, graphics and social posts all live inside it, so every tool works on the same story."), h("button", { class: "primary", type: "button", onClick: () => go("#/project/new") }, "Create a project")), section("Your data", h("p", null, "Everything is saved in this browser on this device, so another device or browser starts empty. Nothing is sent anywhere unless you use AI, grammar or Bluesky features. Use Settings → Export or a backup folder to keep a copy.")), toolsOverview());
    }
    const deadlines = upcomingDeadlines([...app.store.records()], 6);
    const notes = app.store.records().filter((r) => r.kind === "note" && live(r)).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5);
    const recs = app.store.records().filter(live);
    const count = (k, f = () => true) => recs.filter((r) => r.kind === k).filter(f).length;
    const hour = new Date().getHours();
    const tile = (n, label, href, ic, toolId = "") => h("a", { class: "tile", href, ...(toolId ? { "data-tool": toolId } : {}) }, icon(ic, 22), h("strong", null, String(n)), h("span", null, label));
    return h("div", null, h("div", { class: "hero" }, h("div", null, h("p", { class: "eyebrow" }, new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })), h("h1", null, "Dashboard"), h("p", { class: "lead" }, `Good ${hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening"}. Here is where your stories stand.`)), h("button", { class: "primary", type: "button", onClick: () => go("#/project/new") }, icon("plus", 18), " New project")), h("div", { class: "tiles" }, tile(ps.length, "active projects", "#/projects", "projects"), tile(count("claim", (c) => c.status !== "confirmed"), "claims to check", "#/tool/sleuth", "sleuth", "sleuth"), tile(count("interview", (i) => i.status === "planned"), "interviews planned", "#/tool/quill", "quill", "quill"), tile(count("draft", (d) => d.status !== "published"), "drafts in progress", "#/tool/inkling", "inkling", "inkling"), tile(count("graphic", (g) => g.status !== "done"), "graphics to finish", "#/tool/pixel", "pixel", "pixel"), tile(count("post", (x) => x.status !== "posted"), "posts not yet out", "#/tool/ripple", "ripple", "ripple"), tile(count("match", (x) => x.status !== "FT"), "matches to cover", "#/tool/whistle", "whistle", "whistle")), livePanel(), quickSearch(), h("div", { class: "grid" }, section("Recent projects", h("ul", { class: "items" }, ...ps.slice(0, 6).map((p) => { const st = projectStages([...app.store.records()], p.id); return h("li", null, link(`#/project/${p.id}`, p.title), h("span", { class: "meta" }, `${st.filter((s) => s.done).length}/${st.length} stages · updated ${ago(p.updatedAt)}`)); })), ps.length > 6 ? link("#/projects", `All ${plural(ps.length, "project", "projects")}`) : null), section("Upcoming deadlines", deadlines.length ? h("ul", { class: "items" }, ...deadlines.map((t) => h("li", null, link(`#/project/${t.projectId}`, t.title), h("span", { class: "meta" + (isOverdue(t, today()) ? " overdue" : "") }, `${isOverdue(t, today()) ? "Overdue · " : ""}${fmtDate(t.due)} · ${projectOf(t)?.title ?? ""}`)))) : empty("No open tasks with a deadline.")), researchPanel(), recentQuotes(), socialPanel(), section("Recent notes", notes.length ? h("ul", { class: "items" }, ...notes.map((n) => h("li", null, link(`#/note/${n.id}`, n.title), h("span", { class: "meta" }, `${projectOf(n)?.title ?? ""} · ${ago(n.updatedAt)}`)))) : empty("No notes yet. Open a project to add one."))), toolsOverview());
}
/** Claims that still need work, across all projects: real counts from Sleuth, nothing estimated. */
/** A match being covered right now, straight back to it (Whistle). */
function livePanel() {
    const live_ = app.store.records().filter((r) => r.kind === "match" && live(r) && (r.status === "1H" || r.status === "HT" || r.status === "2H"));
    if (!live_.length)
        return null;
    return section("Live now (Whistle)", h("ul", { class: "items" }, ...live_.map((m) => { const s = score(m); return h("li", null, link(`#/match/${m.id}`, `${m.home} ${s.home}-${s.away} ${m.away}`), h("span", { class: "meta" }, m.status === "HT" ? "Half-time" : m.status === "1H" ? "First half" : "Second half")); })));
}
function researchPanel() {
    const smap = new Map(app.store.records().filter((r) => r.kind === "source").map((s) => [s.id, s]));
    const claims = app.store.records().filter((r) => r.kind === "claim" && live(r));
    const open = claims.map((c) => ({ c, w: claimWarnings(c, smap, today()).filter((x) => x.level === "problem").length })).filter((x) => x.w > 0 || x.c.status === "unverified").sort((a, b) => b.w - a.w || b.c.updatedAt - a.c.updatedAt).slice(0, 6);
    return section("Research to check", !claims.length ? empty("No claims recorded yet. Use Sleuth to log facts and their sources.")
        : open.length ? h("ul", { class: "items" }, ...open.map(({ c, w }) => h("li", null, link(`#/claim/${c.id}`, c.title), h("span", { class: "meta" + (w ? " overdue" : "") }, `${c.status}${w ? ` · ${w} problem${w > 1 ? "s" : ""}` : ""} · ${projectOf(c)?.title ?? ""}`))))
            : h("p", { class: "status ok" }, claims.length === 1 ? "The claim has its evidence in order." : `All ${claims.length} claims have their evidence in order.`));
}
function recentQuotes() {
    const qs = app.store.records().filter((r) => r.kind === "quote" && live(r) && !r.supersededBy).sort((a, b) => b.createdAt - a.createdAt).slice(0, 4);
    return section("Recent quotes", qs.length ? h("ul", { class: "items" }, ...qs.map((x) => h("li", null, link(`#/quote/${x.id}`, `“${x.title.length > 90 ? x.title.slice(0, 90) + "…" : x.title}”`), h("span", { class: "meta" }, `${x.speaker} · ${projectOf(x)?.title ?? ""}`)))) : empty("No quotes yet. Quill saves them from interviews."));
}
function socialPanel() {
    const posts = app.store.records().filter((r) => r.kind === "post" && live(r));
    const next = posts.filter((p) => p.status !== "posted" && p.plannedFor).sort((a, b) => a.plannedFor.localeCompare(b.plannedFor)).slice(0, 4);
    const gfx = app.store.records().filter((r) => r.kind === "graphic" && live(r) && r.status !== "done");
    return section("Graphics and social", h("ul", { class: "items" }, ...next.map((p) => h("li", null, link(`#/post/${p.id}`, p.title), h("span", { class: "meta" }, new Date(p.plannedFor).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })))), ...gfx.slice(0, 3).map((g) => h("li", null, link(`#/graphic/${g.id}`, g.title), h("span", { class: "meta" }, `graphic · ${g.status}`)))), !next.length && !gfx.length ? empty(`${posts.length ? "No planned posts or unfinished graphics." : "No posts or graphics yet. Pixel and Ripple create them."}`) : null);
}
function quickSearch() {
    const input = h("input", { type: "search", placeholder: "Search your projects, notes, tasks, sources and claims", "aria-label": "Search your material" });
    return h("form", { class: "row", role: "search", onSubmit: (e) => { e.preventDefault(); if (input.value.trim())
            go("#/search?q=" + encodeURIComponent(input.value.trim())); } }, input, h("button", { type: "submit" }, "Search"));
}
function toolsOverview() {
    return section(`The ${TOOLS.length === 6 ? "six" : TOOLS.length} tools`, h("ul", { class: "tools" }, ...TOOLS.map((t) => h("li", null, link(`#/tool/${t.id}`, h("strong", null, t.name)), h("span", null, t.job)))), h("p", { class: "hint" }, "All the tools work on the same projects, so research, interviews, matches, drafts, graphics and posts for one story stay together."));
}
function projectList() {
    const all = projects().sort((a, b) => a.title.localeCompare(b.title));
    const archived = app.store.records().filter((r) => r.kind === "project" && live(r) && r.status === "archived");
    const active = all.filter((p) => p.status === "active");
    const row = (p) => h("li", null, link(`#/project/${p.id}`, p.title), h("span", { class: "meta" }, `${SUBJECT_LABEL[p.subject]}${p.clubs.length ? " · " + p.clubs.join(", ") : ""} · ${childrenOf([...app.store.records()], p.id).filter(live).length} items`));
    return h("div", null, h("div", { class: "page-head" }, h("h1", null, "Projects"), h("button", { class: "primary", type: "button", onClick: () => go("#/project/new") }, "New project")), active.length ? h("ul", { class: "items panel" }, ...active.map(row)) : empty("No active projects."), archived.length ? section("Archived", h("ul", { class: "items" }, ...archived.map(row))) : null);
}
function projectForm(p) {
    const title = h("input", { type: "text", required: true, value: p?.title ?? "", maxLength: 300 });
    const subject = h("select", null, ...SUBJECTS.map((s) => h("option", { value: s, selected: (p?.subject ?? "other") === s }, SUBJECT_LABEL[s])));
    const description = h("textarea", { rows: 4, value: p?.description ?? "" });
    const clubs = h("input", { type: "text", value: p?.clubs.join(", ") ?? "" });
    const people = h("input", { type: "text", value: p?.people.join(", ") ?? "" });
    const err = h("p", { class: "status err", role: "alert" });
    const form = h("form", { class: "panel", onSubmit: async (e) => {
            e.preventDefault();
            if (!title.value.trim()) {
                err.textContent = "Give the project a title.";
                title.focus();
                return;
            }
            const data = { title: title.value.trim(), subject: subject.value, description: description.value, clubs: listText(clubs.value), people: listText(people.value) };
            const saved = await persist(() => app.store.save(p ? { ...p, ...data } : newProject(data)), p ? "Project saved" : "Project created");
            if (saved)
                go(`#/project/${saved[0].id}`);
        } }, field("Title", title, "For example: “Aldershot Town’s new striker” or “Shots v Woking, 2 Nov”."), field("What is it about?", subject), field("Description", description), field("Clubs", clubs, "Separate with commas."), field("People", people, "Players, managers or other people involved. Separate with commas."), err, h("div", { class: "row" }, h("button", { class: "primary", type: "submit" }, p ? "Save project" : "Create project"), h("a", { href: p ? `#/project/${p.id}` : "#/" }, "Cancel")));
    return h("div", null, h("h1", null, p ? "Edit project" : "New project"), form);
}
function projectPage(p) {
    const kids = childrenOf([...app.store.records()], p.id).filter(live);
    const notes = kids.filter((k) => k.kind === "note").sort((a, b) => b.updatedAt - a.updatedAt);
    const tasks = kids.filter((k) => k.kind === "task").sort((a, b) => Number(a.done) - Number(b.done) || (a.due || "9999").localeCompare(b.due || "9999"));
    const newTitle = h("input", { type: "text", placeholder: "New task", "aria-label": "New task title" });
    const newDue = h("input", { type: "date", "aria-label": "Deadline (optional)" });
    const addTask = h("form", { class: "row", onSubmit: async (e) => {
            e.preventDefault();
            if (!newTitle.value.trim()) {
                newTitle.focus();
                return;
            }
            await persist(() => app.store.save(newTask(p.id, newTitle.value, newDue.value)), "Task added");
        } }, newTitle, newDue, h("button", { type: "submit" }, "Add task"));
    const keyDate = { label: h("input", { type: "text", placeholder: "What happens", "aria-label": "Key date label" }), date: h("input", { type: "date", "aria-label": "Key date" }) };
    const addDate = h("form", { class: "row", onSubmit: async (e) => {
            e.preventDefault();
            if (!keyDate.label.value.trim() || !keyDate.date.value) {
                setStatus("A key date needs a label and a date.", "err");
                return;
            }
            await persist(() => app.store.save({ ...p, keyDates: [...p.keyDates, { label: keyDate.label.value.trim(), date: keyDate.date.value }].sort((a, b) => a.date.localeCompare(b.date)) }), "Key date added");
        } }, keyDate.label, keyDate.date, h("button", { type: "submit" }, "Add date"));
    return h("div", null, h("p", { class: "crumbs" }, link("#/projects", "Projects"), " / "), h("div", { class: "page-head" }, h("h1", null, p.title), h("div", { class: "row" }, h("button", { type: "button", onClick: () => go(`#/project/${p.id}/edit`) }, "Edit"), h("button", { type: "button", onClick: () => void persist(() => app.store.save({ ...p, status: p.status === "active" ? "archived" : "active" }), p.status === "active" ? "Archived" : "Moved back to active") }, p.status === "active" ? "Archive" : "Unarchive"), h("button", { class: "danger", type: "button", onClick: async () => { if (!confirm(`Move “${p.title}” and its ${kids.length} items (notes, tasks, sources, claims) to the Trash? You can restore them from Settings.`))
            return; if (await persist(() => app.store.trash(p.id).then(() => true), "Moved to Trash"))
            go("#/projects"); } }, "Delete"))), h("p", { class: "meta" }, [SUBJECT_LABEL[p.subject], p.status === "archived" ? "Archived" : "", p.clubs.join(", "), p.people.join(", ")].filter(Boolean).join(" · ")), p.description ? h("p", { class: "description" }, p.description) : null, h("ol", { class: "stages", "aria-label": "Progress" }, ...projectStages([...app.store.records()], p.id).map((s) => h("li", { class: s.done ? "done" : "" }, h("strong", null, (s.done ? "✓ " : "") + s.stage), h("span", { class: "meta" }, s.detail)))), h("div", { class: "grid" }, section("Research (Sleuth)", h("p", null, `${plural(kids.filter((k) => k.kind === "source").length, "source", "sources")} · ${plural(kids.filter((k) => k.kind === "claim").length, "claim", "claims")} · ${plural(p.questions.length, "open question", "open questions")}`), h("button", { type: "button", onClick: () => go(`#/sleuth/${p.id}`) }, "Open research")), section("Interviews (Quill)", h("p", null, `${plural(kids.filter((k) => k.kind === "interview").length, "interview", "interviews")} · ${plural(kids.filter((k) => k.kind === "quote" && !k.supersededBy).length, "quote", "quotes")}`), h("button", { type: "button", onClick: () => go(`#/quill/${p.id}`) }, "Open interviews")), section("Drafts (Inkling)", h("p", null, `${plural(kids.filter((k) => k.kind === "draft").length, "draft", "drafts")}`), h("button", { type: "button", onClick: () => go(`#/drafts/${p.id}`) }, "Open drafts")), section("Graphics (Pixel)", h("p", null, `${plural(kids.filter((k) => k.kind === "graphic").length, "graphic", "graphics")}`), h("button", { type: "button", onClick: () => go(`#/graphics/${p.id}`) }, "Open graphics")), section("Matches (Whistle)", (() => {
        const ms = kids.filter((k) => k.kind === "match").sort((a, b) => (b.date || "").localeCompare(a.date || "") || b.updatedAt - a.updatedAt);
        return ms.length ? h("ul", { class: "items" }, ...ms.slice(0, 4).map((m) => { const s = score(m); return h("li", null, link(`#/match/${m.id}`, `${m.home} ${s.home}-${s.away} ${m.away}`), h("span", { class: "meta" }, m.status === "FT" ? "Full-time" : m.status === "pre" ? (m.date || "Not started") : "Live")); })) : h("p", null, "No matches yet.");
    })(), h("button", { type: "button", onClick: () => go("#/tool/whistle") }, "Open matchday")), section("Social (Ripple)", h("p", null, `${plural(kids.filter((k) => k.kind === "post").length, "post", "posts")} · ${kids.filter((k) => k.kind === "post" && k.status === "posted").length} posted`), h("button", { type: "button", onClick: () => go(`#/social/${p.id}`) }, "Open social")), section("Notes", h("button", { type: "button", onClick: async () => { const s = await persist(() => app.store.save(newNote(p.id, "Untitled note")), "Note created"); if (s)
            go(`#/note/${s[0].id}`); } }, "New note"), notes.length ? h("ul", { class: "items" }, ...notes.map((n) => h("li", null, link(`#/note/${n.id}`, n.title), h("span", { class: "meta" }, ago(n.updatedAt))))) : empty("No notes yet.")), section("Tasks and deadlines", addTask, tasks.length ? h("ul", { class: "items tasks" }, ...tasks.map((t) => taskRow(t))) : empty("No tasks yet.")), section("Key dates", addDate, p.keyDates.length ? h("ul", { class: "items" }, ...p.keyDates.map((d, i) => h("li", null, h("span", null, `${fmtDate(d.date)}: ${d.label}`), h("button", { type: "button", class: "small", "aria-label": `Remove key date ${d.label}`, onClick: () => void persist(() => app.store.save({ ...p, keyDates: p.keyDates.filter((_, j) => j !== i) }), "Key date removed") }, "Remove")))) : empty("No key dates. Add fixtures, interview dates or publication dates."))));
}
function taskRow(t) {
    const box = h("input", { type: "checkbox", checked: t.done, "aria-label": `Done: ${t.title}`, onChange: () => void persist(() => app.store.save({ ...t, done: box.checked }), box.checked ? "Task done" : "Task reopened") });
    return h("li", { class: t.done ? "done" : "" }, h("label", { class: "check" }, box, h("span", null, t.title)), h("span", { class: "row" }, t.due ? h("span", { class: "meta" + (isOverdue(t, today()) ? " overdue" : "") }, (isOverdue(t, today()) ? "Overdue · " : "") + fmtDate(t.due)) : null, h("button", { type: "button", class: "small", "aria-label": `Delete task ${t.title}`, onClick: () => void persist(() => app.store.trash(t.id), "Task moved to Trash") }, "Delete")));
}
function noteEditor(n) {
    const p = projectOf(n);
    const title = h("input", { type: "text", value: n.title, "aria-label": "Note title", class: "title-input" });
    const body = h("textarea", { rows: 18, value: n.body, "aria-label": "Note text", class: "note-body" });
    let timer;
    let current = n;
    const save = () => { window.clearTimeout(timer); timer = undefined; const next = { ...current, title: title.value.trim() || "Untitled note", body: body.value }; if (next.title === current.title && next.body === current.body)
        return; void persist(async () => { const [s] = await app.store.save(next); current = s; }, "Note saved", { rerender: false }); };
    const later = () => { setStatus("Unsaved changes…", "busy"); window.clearTimeout(timer); timer = window.setTimeout(save, 700); };
    title.addEventListener("input", later);
    body.addEventListener("input", later);
    title.addEventListener("blur", save);
    body.addEventListener("blur", save);
    app.flush = save;
    return h("div", null, h("p", { class: "crumbs" }, link("#/projects", "Projects"), " / ", p ? link(`#/project/${p.id}`, p.title) : "(missing project)", " / "), h("div", { class: "page-head" }, title, h("button", { class: "danger", type: "button", onClick: async () => { if (!confirm("Move this note to the Trash?"))
            return; window.clearTimeout(timer); app.flush = null; if (await persist(() => app.store.trash(n.id).then(() => true), "Note moved to Trash"))
            go(p ? `#/project/${p.id}` : "#/"); } }, "Delete")), body, h("p", { class: "hint" }, "Saved automatically as you type. Notes stay on this device until you export them."));
}
function searchPage(q) {
    const input = h("input", { type: "search", value: q, placeholder: "Search projects, notes, tasks, sources and claims", "aria-label": "Search" });
    const results = q ? searchRecords([...app.store.records()], q) : [];
    const describe = (r) => r.kind === "project" ? ["Project", `#/project/${r.id}`] : r.kind === "note" ? ["Note", `#/note/${r.id}`] : r.kind === "task" ? ["Task", `#/project/${r.projectId}`] : r.kind === "source" ? ["Source", `#/source/${r.id}`] : r.kind === "claim" ? ["Claim", `#/claim/${r.id}`] : r.kind === "interview" ? ["Interview", `#/interview/${r.id}`] : r.kind === "quote" ? ["Quote", `#/quote/${r.id}`] : r.kind === "draft" ? ["Draft", `#/draft/${r.id}`] : r.kind === "graphic" ? ["Graphic", `#/graphic/${r.id}`] : r.kind === "post" ? ["Post", `#/post/${r.id}`] : r.kind === "brand" ? ["Brand kit", `#/brand/${r.id}`] : ["Campaign", `#/social/${r.projectId}`];
    return h("div", null, h("h1", null, "Search"), h("form", { class: "row", role: "search", onSubmit: (e) => { e.preventDefault(); go("#/search?q=" + encodeURIComponent(input.value.trim())); } }, input, h("button", { type: "submit" }, "Search")), q ? (results.length ? h("ul", { class: "items panel" }, ...results.map((r) => { const [k, href] = describe(r); return h("li", null, link(href, r.title), h("span", { class: "meta" }, `${k}${r.kind !== "project" && r.kind !== "brand" ? " · " + (projectOf(r)?.title ?? "") : ""}`)); }))
        : empty(`Nothing matches “${q}”.`)) : null);
}
function toolPage(id) {
    const t = TOOLS.find((x) => x.id === id);
    if (!t)
        return notFound();
    return h("div", null, h("h1", null, t.name), section("Not built yet", h("p", null, t.job), h("p", null, `${t.name} is planned for phase ${t.phase}. It will read from and save to your existing projects, so anything you add now will be available to it.`), id === "inkling" ? h("p", null, "The Inkling Chrome extension already proofreads on websites you enable. Load it from chrome://extensions (see the project README).") : null));
}
const notFound = () => h("div", null, h("h1", null, "Not found"), h("p", null, "That item does not exist or was permanently deleted. "), link("#/", "Back to the dashboard"));
// ---------------------------------------------------------------- shell
function render() {
    app.flush?.();
    app.flush = null;
    const [path, query = ""] = location.hash.replace(/^#/, "").split("?");
    const parts = (path || "/").split("/").filter(Boolean);
    let view;
    const rec = parts[1] ? app.store.get(parts[1]) : undefined;
    if (!parts.length)
        view = dashboard();
    else if (parts[0] === "handoff")
        view = handoffPage();
    else if (parts[0] === "projects")
        view = projectList();
    else if (parts[0] === "project" && parts[1] === "new")
        view = projectForm();
    else if (parts[0] === "project" && rec?.kind === "project" && live(rec))
        view = parts[2] === "edit" ? projectForm(rec) : projectPage(rec);
    else if (parts[0] === "note" && rec?.kind === "note" && live(rec))
        view = noteEditor(rec);
    else if (parts[0] === "search")
        view = searchPage(new URLSearchParams(query).get("q") ?? "");
    else if (parts[0] === "tool" && parts[1] === "sleuth")
        view = sleuthHome();
    else if (parts[0] === "tool" && parts[1] === "quill")
        view = quillHome();
    else if (parts[0] === "tool" && parts[1] === "inkling")
        view = inklingHome();
    else if (parts[0] === "tool" && parts[1] === "pixel")
        view = pixelHome();
    else if (parts[0] === "tool" && parts[1] === "ripple")
        view = rippleHome();
    else if (parts[0] === "tool" && parts[1] === "whistle")
        view = whistleHome();
    else if (parts[0] === "match" && rec?.kind === "match" && live(rec))
        view = matchPage(rec);
    else if (parts[0] === "social" && rec?.kind === "project" && live(rec))
        view = socialProject(rec);
    else if (parts[0] === "post" && rec?.kind === "post" && live(rec))
        view = postPage(rec);
    else if (parts[0] === "graphics" && rec?.kind === "project" && live(rec))
        view = graphicsProject(rec);
    else if (parts[0] === "graphic" && rec?.kind === "graphic" && live(rec))
        view = graphicPage(rec);
    else if (parts[0] === "make" && rec?.kind === "graphic" && live(rec))
        view = makerPage(rec);
    else if (parts[0] === "brand" && rec?.kind === "brand" && live(rec))
        view = brandPage(rec);
    else if (parts[0] === "drafts" && rec?.kind === "project" && live(rec))
        view = draftsProject(rec);
    else if (parts[0] === "draft" && rec?.kind === "draft" && live(rec))
        view = draftEditor(rec);
    else if (parts[0] === "quill" && rec?.kind === "project" && live(rec))
        view = quillProject(rec);
    else if (parts[0] === "interview" && rec?.kind === "interview" && live(rec))
        view = interviewPage(rec);
    else if (parts[0] === "quote" && rec?.kind === "quote" && live(rec))
        view = quotePage(rec);
    else if (parts[0] === "tool" && parts[1])
        view = toolPage(parts[1]);
    else if (parts[0] === "sleuth" && rec?.kind === "project" && live(rec))
        view = sleuthProject(rec);
    else if (parts[0] === "source" && rec?.kind === "source" && live(rec))
        view = sourcePage(rec);
    else if (parts[0] === "claim" && rec?.kind === "claim" && live(rec))
        view = claimPage(rec);
    else if (parts[0] === "settings")
        view = settingsPage();
    else
        view = notFound();
    const active = "#/" + (parts[0] === "project" || parts[0] === "note" ? "projects" : parts[0] === "tool" ? `tool/${parts[1]}` : ["sleuth", "source", "claim"].includes(parts[0] ?? "") ? "tool/sleuth" : ["quill", "interview", "quote"].includes(parts[0] ?? "") ? "tool/quill" : ["drafts", "draft"].includes(parts[0] ?? "") ? "tool/inkling" : ["graphics", "graphic", "make", "brand"].includes(parts[0] ?? "") ? "tool/pixel" : ["social", "post"].includes(parts[0] ?? "") ? "tool/ripple" : parts[0] === "match" ? "tool/whistle" : parts[0] ?? "");
    for (const a of document.querySelectorAll("#nav a")) {
        if (a.getAttribute("href") === (active === "#/" ? "#/" : active))
            a.setAttribute("aria-current", "page");
        else
            a.removeAttribute("aria-current");
    }
    // Each tool has its own accent colour and icon, so it is always clear which tool you are in.
    const tool = /^#\/tool\/(\w+)$/.exec(active)?.[1] ?? "";
    if (tool)
        document.body.dataset.tool = tool;
    else
        delete document.body.dataset.tool;
    const focusTarget = document.activeElement;
    main().replaceChildren(view);
    const heading = main().querySelector("h1");
    if (heading && tool && !heading.querySelector(".icon"))
        heading.prepend(icon(tool, 28));
    // A tool's home page opens with a banner in the tool's colour (title and its one-line description).
    if (heading && parts[0] === "tool" && heading.parentElement === view && !heading.closest(".tool-banner")) {
        const lead = heading.nextElementSibling?.classList.contains("lead") ? heading.nextElementSibling : null;
        const banner = h("div", { class: "tool-banner" });
        heading.replaceWith(banner);
        banner.append(heading);
        if (lead)
            banner.append(lead);
    }
    // Sections about one tool carry its colour.
    for (const sec of main().querySelectorAll("section.panel")) {
        const t = /\((Sleuth|Quill|Inkling|Pixel|Ripple|Whistle)\)/.exec(sec.querySelector("h2")?.textContent ?? "")?.[1]?.toLowerCase();
        if (t)
            sec.dataset.tool = t;
    }
    document.title = heading?.textContent ? `${heading.textContent.trim()} · Inkling Suite` : "Inkling Suite";
    // Keep focus where the writer was for in-page updates; move it to the heading on navigation.
    const h1 = main().querySelector("h1");
    if (h1)
        h1.tabIndex = -1;
    if (!focusTarget || !main().contains(focusTarget) || focusTarget === document.body)
        h1?.focus({ preventScroll: false });
}
async function start() {
    app.render = render;
    const brand = document.getElementById("brand-icon");
    brand?.replaceChildren(squidIcon());
    const navLink = (href, label, ic) => h("a", { href }, icon(ic), h("span", null, label));
    document.getElementById("nav").replaceChildren(h("p", { class: "nav-group" }, "Workspace"), navLink("#/", "Dashboard", "dashboard"), navLink("#/projects", "Projects", "projects"), navLink("#/search", "Search", "search"), h("p", { class: "nav-group" }, "Tools"), ...TOOLS.map((t) => { const a = navLink(`#/tool/${t.id}`, t.name, t.id); a.dataset.tool = t.id; return a; }), h("div", { class: "nav-spacer" }), navLink("#/settings", "Settings", "settings"));
    try {
        app.store = new SuiteStore(await IdbBackend.open());
        await app.store.load();
    }
    catch (e) {
        main().replaceChildren(h("h1", null, "Inkling Suite could not open its storage"), h("p", { class: "status err" }, e.message), h("p", null, "Private browsing windows and some browser settings block local storage. Try a normal window."));
        setStatus("Storage unavailable", "err");
        return;
    }
    setStatus("All changes saved");
    void initBackupFolder(app.store).then(() => { if (!location.hash || location.hash === "#/")
        app.render(); }); // the dashboard shows whether backup is on
    askToKeepData();
    window.addEventListener("hashchange", () => render());
    // Another tab changed something: reload, but never pull the page out from under a note being typed.
    onOtherTabChange(async () => { await app.store.load(); if (!app.flush)
        render(); });
    window.addEventListener("beforeunload", () => app.flush?.());
    window.addEventListener("offline", () => setStatus("Offline: everything still saves on this device"));
    render();
    if ("serviceWorker" in navigator && location.protocol !== "file:")
        navigator.serviceWorker.register("sw.js").catch(() => { });
}
void start();
