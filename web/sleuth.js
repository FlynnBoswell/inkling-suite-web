import { h } from "../extension/dom.js";
import { CLAIM_STATUSES, childrenOf, claimWarnings, cleanUrl, live, newClaim, newSource, PRIMARY_TYPES, researchMarkdown, SOURCE_TYPES } from "../core/suite/model.js";
import { app, download, empty, extLink, field, fmtDate, go, link, persist, projects, section, setStatus, today, plural } from "./ui.js";
import { ai, aiBox, runAi } from "./ai.js";
import { crossCheckSection, newsSection, officialNewsSection, readSourceSection, tierBadge } from "./newsdesk.js";
/** Claims the AI suggested that failed the checks: shown so nothing is hidden, but they cannot be added. */
export function heldBackList(r) {
    const parts = [];
    if (r.heldBack?.length)
        parts.push(h("details", null, h("summary", null, `${r.heldBack.length} suggestion(s) held back: the quoted words do not say exactly that, or put a name with the wrong action`), h("ul", null, ...r.heldBack.map((c) => h("li", { class: "hint" }, c.claim, h("span", { class: "extract" }, `“${c.excerpt}”`), h("span", { class: "meta" }, ` (${c.reason})`))))));
    if (r.doubleChecked === false)
        parts.push(h("p", { class: "status warn" }, "The second check could not run this time, so these suggestions were not double-checked. Compare each with its quoted words."));
    return parts.length ? h("div", null, ...parts) : null;
}
export const SOURCE_LABEL = { official: "Official club or league announcement", "governing-body": "Governing body (FA, EFL, National League…)", interview: "Direct interview", statistics: "Official statistics", journalism: "Reputable journalism", social: "Social media post", other: "Other" };
export const STATUS_LABEL = { unverified: "Unverified", attributed: "Attributed (we know who said it)", confirmed: "Confirmed", disputed: "Disputed" };
const STATUS_HELP = {
    unverified: "Not yet checked. Do not publish as fact.",
    attributed: "You can say who said it, but not that it is true. Publish only as their claim.",
    confirmed: "You have checked it against reliable evidence.",
    disputed: "Reliable sources disagree, or evidence contradicts it.",
};
const sourcesOf = (p) => childrenOf([...app.store.records()], p.id).filter((r) => r.kind === "source" && live(r)).sort((a, b) => a.title.localeCompare(b.title));
const claimsOf = (p) => childrenOf([...app.store.records()], p.id).filter((r) => r.kind === "claim" && live(r)).sort((a, b) => b.updatedAt - a.updatedAt);
const sourceMap = () => new Map(app.store.records().filter((r) => r.kind === "source").map((s) => [s.id, s]));
const pill = (s) => h("span", { class: `pill status-${s}` }, STATUS_LABEL[s].split(" (")[0]);
export function sleuthHome() {
    const ps = projects().sort((a, b) => b.updatedAt - a.updatedAt);
    return h("div", null, h("h1", null, "Sleuth"), h("p", { class: "lead" }, "Research and fact-checking. Record your sources, write each claim as a checkable statement, attach the evidence for and against, and set its status yourself."), ps.length ? section("Choose a project", h("ul", { class: "items" }, ...ps.map((p) => {
        const c = claimsOf(p);
        const s = sourcesOf(p);
        return h("li", null, link(`#/sleuth/${p.id}`, p.title), h("span", { class: "meta" }, `${plural(s.length, "source", "sources")} · ${plural(c.length, "claim", "claims")} · ${c.filter((x) => x.status === "confirmed").length} confirmed`));
    })))
        : empty("Create a project first.", h("button", { class: "primary", type: "button", onClick: () => go("#/project/new") }, "Create a project")), section("How Sleuth finds things", h("p", null, "Free and on this laptop (with Start Inkling running): recent news from Bing News, your clubs' own news feeds, articles read in full, and Wikipedia. It never marks anything true: you check each claim and set its status.")));
}
export function sleuthProject(p) {
    const sources = sourcesOf(p);
    const claims = claimsOf(p);
    const smap = sourceMap();
    const t = today();
    const q = h("input", { type: "text", placeholder: "For example: When did he sign his first professional contract?", "aria-label": "New research question" });
    const claimText = h("input", { type: "text", placeholder: "For example: He scored 14 league goals in 2025-26", "aria-label": "New claim" });
    const byStatus = (s) => claims.filter((c) => c.status === s).length;
    return h("div", null, h("p", { class: "crumbs" }, link("#/tool/sleuth", "Sleuth"), " / ", link(`#/project/${p.id}`, p.title)), h("div", { class: "page-head" }, h("h1", null, `Research: ${p.title}`), h("button", { type: "button", onClick: () => { download(`research-${p.title.replace(/[^\w-]+/g, "-").toLowerCase()}.md`, researchMarkdown(p, claims, sources), "text/markdown"); setStatus("Research file created"); } }, "Export research")), h("p", { class: "meta" }, `${plural(claims.length, "claim", "claims")}: ${byStatus("confirmed")} confirmed, ${byStatus("attributed")} attributed, ${byStatus("unverified")} unverified, ${byStatus("disputed")} disputed · ${plural(sources.length, "source", "sources")}`), h("div", { class: "grid" }, section("Research questions", h("form", { class: "row", onSubmit: async (e) => { e.preventDefault(); if (!q.value.trim())
            return; await persist(() => app.store.save({ ...p, questions: [...p.questions, q.value.trim()] }), "Question added"); } }, q, h("button", { type: "submit" }, "Add")), p.questions.length ? h("ol", { class: "items" }, ...p.questions.map((x, i) => h("li", null, h("span", null, x), h("button", { type: "button", class: "small", "aria-label": `Remove question: ${x}`, onClick: () => void persist(() => app.store.save({ ...p, questions: p.questions.filter((_, j) => j !== i) }), "Question removed") }, "Remove"))))
        : empty("What do you need to find out? List it here.")), section("Claims", h("form", { class: "row", onSubmit: async (e) => { e.preventDefault(); if (!claimText.value.trim()) {
            claimText.focus();
            return;
        } const s = await persist(() => app.store.save(newClaim(p.id, claimText.value)), "Claim added"); if (s)
            go(`#/claim/${s[0].id}`); } }, claimText, h("button", { type: "submit" }, "Add claim")), claims.length ? h("ul", { class: "items" }, ...claims.map((c) => {
        const w = claimWarnings(c, smap, t);
        const probs = w.filter((x) => x.level === "problem").length;
        return h("li", null, link(`#/claim/${c.id}`, c.title), h("span", { class: "row" }, pill(c.status), w.length ? h("span", { class: "meta" + (probs ? " overdue" : "") }, `${w.length} check${w.length > 1 ? "s" : ""}`) : null));
    }))
        : empty("No claims yet. Write each fact you might publish as a separate claim."))), newsSection(p), aiResearch(p), officialNewsSection(p), footballData(p), sourceForm(p), section(`Sources (${sources.length})`, sources.length ? h("ul", { class: "items" }, ...sources.map((s) => h("li", null, h("span", null, link(`#/source/${s.id}`, s.title), h("br"), h("span", { class: "meta" }, [s.publisher, SOURCE_LABEL[s.type], s.published ? "published " + fmtDate(s.published) : ""].filter(Boolean).join(" · ")), " ", s.url ? tierBadge(s.url, p) : null), s.url ? extLink(s.url, "Open") : h("span", { class: "meta" }, "no link")))) : empty("No sources yet.")));
}
/** AI web research. Every finding shown comes with the pages it was taken from; the journalist decides what to keep. */
function aiResearch(p) {
    const q = h("input", { type: "text", placeholder: "What do you want to find out?", "aria-label": "AI research question", value: p.questions[0] ?? "" });
    const out = h("div");
    const btn = h("button", { type: "button", class: "primary" }, "Research the web");
    btn.addEventListener("click", () => {
        if (!q.value.trim()) {
            q.focus();
            return;
        }
        void runAi(btn, out, () => ai("/v1/sleuth/research", { question: q.value.trim(), context: [p.title, p.description, ...p.clubs, ...p.people].filter(Boolean).join("; ") }, 180_000), (r) => aiBox(`Findings (${r.searches} web searches)`, r.cited.length ? h("ul", { class: "findings" }, ...r.cited.map((f) => h("li", null, h("p", null, f.text), h("ul", { class: "cites" }, ...f.citations.map((c) => h("li", null, extLink(c.url, c.title || hostOf(c.url)), h("span", { class: "extract" }, `“${c.citedText.slice(0, 240)}${c.citedText.length > 240 ? "…" : ""}”`)))), h("div", { class: "row" }, h("button", { type: "button", class: "small", onClick: async (e) => { const saved = await saveSources(p, f.citations); if (saved)
                e.target.replaceWith(h("span", { class: "status ok" }, "Sources saved")); } }, "Save sources"), h("button", { type: "button", class: "small", onClick: async (e) => { const ok = await saveFindingAsClaim(p, f); if (ok)
                e.target.replaceWith(h("span", { class: "status ok" }, "Saved as an unverified claim")); } }, "Save as claim (unverified)"))))) : h("p", null, "None of the articles found answers this, checked against their own words. Try different wording, or look at the clubs' own news and the football data below."), r.beyond?.length ? h("details", null, h("summary", null, `${r.beyond.length} statement(s) held back: their source does not say exactly that`), h("ul", null, ...r.beyond.map((b) => h("li", { class: "hint" }, b.text, h("span", { class: "meta" }, b.missing.length ? ` (not in the quoted words: ${b.missing.join(", ")})` : ` (${b.reason || "not supported by its quote"})`))))) : null, r.uncited.length ? h("details", null, h("summary", null, `${r.uncited.length} statement(s) with no cited source (not saveable)`), h("ul", null, ...r.uncited.map((t) => h("li", { class: "hint" }, t)))) : null, h("p", { class: "hint" }, "Open each source before relying on it. Claims are saved as unverified; you set the status once you have checked them.")));
    });
    return section("Research with AI", h("p", { class: "hint" }, "Reads recent news and Wikipedia and answers with statements, each with the exact words it came from (checked). Free on this laptop with Start Inkling; slower than a paid AI, and only as good as the articles it finds."), h("div", { class: "row" }, q, btn), out);
}
/**
 * Free football data from TheSportsDB (community-maintained, free key "123" for personal use). Covers many
 * non-league clubs, including the National League. Treated as a lead, never as confirmation.
 */
const SPORTSDB = "https://www.thesportsdb.com/api/v1/json/123/";
export async function sportsdb(path) {
    const r = await fetch(SPORTSDB + path, { signal: AbortSignal.timeout(15_000) }).catch(() => null);
    if (!r?.ok)
        throw new Error("Could not reach TheSportsDB. Check the internet connection, or try again later (the free service has limits).");
    return r.json();
}
function footballData(p) {
    const q = h("input", { type: "text", value: p.clubs[0] ?? "", placeholder: "Club name, e.g. Aldershot Town", "aria-label": "Club to look up" });
    const out = h("div");
    const btn = h("button", { type: "button" }, "Look up");
    const saveFact = async (text, pageUrl, pageTitle, extract) => {
        const ids = await saveSources(p, [{ url: pageUrl, title: pageTitle, citedText: extract }]);
        if (!ids)
            return false;
        const c = { ...newClaim(p.id, text), notes: "From TheSportsDB (community-maintained). Confirm against an official source before publishing.", evidence: [{ sourceId: ids[0], stance: "supports", extract }] };
        return !!(await persist(() => app.store.save(c), "Saved as an unverified claim", { rerender: false }));
    };
    const factBtn = (text, url, title, extract) => h("button", { type: "button", class: "small", onClick: async (e) => { if (await saveFact(text, url, title, extract))
            e.target.replaceWith(h("span", { class: "status ok" }, "Saved")); } }, "Save as claim");
    btn.addEventListener("click", async () => {
        if (!q.value.trim()) {
            q.focus();
            return;
        }
        btn.disabled = true;
        out.replaceChildren(h("p", { class: "hint", role: "status" }, "Looking up…"));
        try {
            const teams = ((await sportsdb(`searchteams.php?t=${encodeURIComponent(q.value.trim())}`)).teams ?? []).filter((t) => t.strSport === "Soccer").slice(0, 3);
            if (!teams.length) {
                out.replaceChildren(h("p", null, "No club found with that name. Try the full name (e.g. “Aldershot Town”)."));
                return;
            }
            const t = teams[0];
            const page = `https://www.thesportsdb.com/team/${t.idTeam}`;
            const [last, next] = await Promise.all([sportsdb(`eventslast.php?id=${t.idTeam}`).catch(() => ({})), sportsdb(`eventsnext.php?id=${t.idTeam}`).catch(() => ({}))]);
            const results = (last.results ?? []).slice(0, 5);
            const fixtures = (next.events ?? []).slice(0, 5);
            const line = (ev, done) => `${fmtDate(ev.dateEvent)}: ${ev.strHomeTeam} ${done && ev.intHomeScore != null ? `${ev.intHomeScore}-${ev.intAwayScore}` : "v"} ${ev.strAwayTeam}${ev.strLeague ? ` (${ev.strLeague})` : ""}`;
            out.replaceChildren(h("div", { class: "data-box" }, h("h3", null, t.strTeam), h("p", { class: "meta" }, [t.strLeague, t.strStadium, t.intFormedYear && `formed ${t.intFormedYear}`].filter(Boolean).join(" · ")), h("h4", null, "Recent results"), results.length ? h("ul", { class: "items" }, ...results.map((ev) => { const s = line(ev, true); return h("li", null, h("span", null, s), factBtn(s, page, `${t.strTeam} on TheSportsDB`, s)); })) : h("p", { class: "hint" }, "None listed."), h("h4", null, "Coming up"), fixtures.length ? h("ul", { class: "items" }, ...fixtures.map((ev) => h("li", null, h("span", null, line(ev, false))))) : h("p", { class: "hint" }, "None listed."), h("p", { class: "hint" }, "Source: ", extLink(page, "TheSportsDB"), ", a free community-maintained database. Check scores and dates against the club or league before you publish.")));
        }
        catch (e) {
            out.replaceChildren(h("p", { class: "status err" }, e.message));
        }
        finally {
            btn.disabled = false;
        }
    });
    return section("Football data (free)", h("p", { class: "hint" }, "Results and fixtures from TheSportsDB, including non-league clubs. No sign-up needed."), h("div", { class: "row" }, q, btn), out);
}
const hostOf = (u) => { try {
    return new URL(u).hostname.replace(/^www\./, "");
}
catch {
    return u;
} };
/** Save cited pages as sources, reusing any already saved with the same link. Returns their ids. */
async function saveSources(p, cites) {
    const existing = sourcesOf(p);
    const ids = [];
    const fresh = [];
    for (const c of cites) {
        const url = cleanUrl(c.url);
        if (!url)
            continue;
        const have = existing.find((s) => s.url === url) ?? fresh.find((s) => s.url === url);
        if (have) {
            ids.push(have.id);
            continue;
        }
        const s = newSource(p.id, { title: c.title || hostOf(url), url, publisher: hostOf(url), type: "journalism", notes: `Found by AI research. Extract: “${c.citedText.slice(0, 400)}”. Check the type of source and the publication date.` });
        fresh.push(s);
        ids.push(s.id);
    }
    if (fresh.length && !(await persist(() => app.store.save(...fresh), `${fresh.length} source(s) saved`, { rerender: false })))
        return undefined;
    return ids;
}
async function saveFindingAsClaim(p, f) {
    const ids = await saveSources(p, f.citations);
    if (!ids)
        return false;
    const c = newClaim(p.id, f.text.slice(0, 300));
    const claim = { ...c, notes: "Drafted from AI web research. Check every source before changing the status.", evidence: ids.map((sid, i) => ({ sourceId: sid, stance: "supports", extract: (f.citations[i]?.citedText ?? "").slice(0, 400) })) };
    return !!(await persist(() => app.store.save(claim), "Claim saved as unverified", { rerender: false }));
}
/** AI help on a source's own text: suggest the checkable claims in it, each traced to its exact words. */
function aiClaims(s) {
    const text = h("textarea", { rows: 6, placeholder: "Paste the text of this source (an article, statement or press release you have the right to use).", "aria-label": "Source text for AI" });
    const out = h("div");
    const btn = h("button", { type: "button" }, "Suggest claims");
    btn.addEventListener("click", () => {
        if (!text.value.trim()) {
            text.focus();
            return;
        }
        void runAi(btn, out, () => ai("/v1/sleuth/claims", { text: text.value }), (r) => aiBox(`${r.claims.length} claim(s) found`, r.claims.length ? h("ul", { class: "items" }, ...r.claims.map((c) => h("li", null, h("span", null, c.claim, h("span", { class: "extract" }, `“${c.excerpt}”`), c.caution ? h("span", { class: "status caution" }, ` ${c.caution}`) : null), h("button", { type: "button", class: "small", onClick: async (e) => {
                const cl = { ...newClaim(s.projectId, c.claim), notes: "Suggested by AI from a saved source.", evidence: [{ sourceId: s.id, stance: "supports", extract: c.excerpt.slice(0, 400) }] };
                if (await persist(() => app.store.save(cl), "Claim added (unverified)", { rerender: false }))
                    e.target.replaceWith(h("span", { class: "status ok" }, "Added"));
            } }, "Add claim")))) : h("p", null, "No checkable claims found."), heldBackList(r)));
    });
    return section("Find claims with AI", text, btn, out);
}
function sourceForm(p, s) {
    const title = h("input", { type: "text", required: true, value: s?.title ?? "" });
    const url = h("input", { type: "url", value: s?.url ?? "", placeholder: "https://…" });
    const publisher = h("input", { type: "text", value: s?.publisher ?? "", placeholder: "e.g. Aldershot Town FC, BBC Sport" });
    const author = h("input", { type: "text", value: s?.author ?? "" });
    const type = h("select", null, ...SOURCE_TYPES.map((x) => h("option", { value: x, selected: (s?.type ?? "journalism") === x }, SOURCE_LABEL[x])));
    const published = h("input", { type: "date", value: s?.published ?? "" });
    const accessed = h("input", { type: "date", value: s?.accessed ?? today() });
    const notes = h("textarea", { rows: 3, value: s?.notes ?? "" });
    const err = h("p", { class: "status err", role: "alert" });
    const form = h("form", { onSubmit: async (e) => {
            e.preventDefault();
            err.textContent = "";
            if (!title.value.trim()) {
                err.textContent = "Give the source a title.";
                title.focus();
                return;
            }
            const u = cleanUrl(url.value);
            if (u === null) {
                err.textContent = "The link must be a web address starting with http:// or https://.";
                url.focus();
                return;
            }
            const data = { title: title.value.trim(), url: u, publisher: publisher.value.trim(), author: author.value.trim(), type: type.value, published: published.value, accessed: accessed.value, notes: notes.value };
            const saved = await persist(() => app.store.save(s ? { ...s, ...data } : newSource(p.id, data)), s ? "Source saved" : "Source added");
            if (saved && s)
                go(`#/sleuth/${p.id}`);
        } }, h("div", { class: "grid tight" }, field("Title or headline", title), field("Link", url, "Optional. Only http and https links are accepted.")), h("div", { class: "grid tight" }, field("Publisher", publisher), field("Author", author)), h("div", { class: "grid tight" }, field("Type of source", type, "Primary sources (official, governing body, interview, statistics) carry most weight."), field("Published", published), field("You accessed it", accessed)), field("Notes", notes, "What it says, in your own words. Keep any quoted extract short."), err, h("div", { class: "row" }, h("button", { class: s ? "primary" : "", type: "submit" }, s ? "Save source" : "Add source"), s ? link(`#/sleuth/${p.id}`, "Cancel") : null));
    return s ? form : h("details", { class: "panel" }, h("summary", null, h("strong", null, "Add a source")), form);
}
export function sourcePage(s) {
    const p = app.store.get(s.projectId);
    if (!p)
        return empty("This source's project is missing.");
    const using = claimsOf(p).filter((c) => c.evidence.some((e) => e.sourceId === s.id));
    return h("div", null, h("p", { class: "crumbs" }, link("#/tool/sleuth", "Sleuth"), " / ", link(`#/sleuth/${p.id}`, p.title)), h("div", { class: "page-head" }, h("h1", null, s.title), h("div", { class: "row" }, s.url ? extLink(s.url, "Open source") : null, h("button", { class: "danger", type: "button", onClick: async () => { if (!confirm(`Move this source to the Trash?${using.length ? ` ${using.length} claim(s) will lose this evidence until you restore it.` : ""}`))
            return; if (await persist(() => app.store.trash(s.id).then(() => true), "Source moved to Trash"))
            go(`#/sleuth/${p.id}`); } }, "Delete"))), section("Edit source", sourceForm(p, s)), readSourceSection(s, p), aiClaims(s), section("Claims using this source", using.length ? h("ul", { class: "items" }, ...using.map((c) => h("li", null, link(`#/claim/${c.id}`, c.title), pill(c.status)))) : empty("Not attached to any claim yet.")));
}
export function claimPage(c) {
    const p = app.store.get(c.projectId);
    if (!p)
        return empty("This claim's project is missing.");
    const sources = sourcesOf(p);
    const smap = sourceMap();
    const warnings = claimWarnings(c, smap, today());
    const text = h("textarea", { rows: 2, value: c.title, "aria-label": "Claim" });
    const status = h("select", null, ...CLAIM_STATUSES.map((s) => h("option", { value: s, selected: c.status === s }, STATUS_LABEL[s])));
    const help = h("p", { class: "hint" }, STATUS_HELP[c.status]);
    status.addEventListener("change", () => { help.textContent = STATUS_HELP[status.value]; });
    const asOf = h("input", { type: "date", value: c.asOf });
    const checked = h("input", { type: "checkbox", checked: c.independentlyChecked });
    const notes = h("textarea", { rows: 3, value: c.notes });
    const evSource = h("select", { "aria-label": "Source for this evidence" }, h("option", { value: "" }, sources.length ? "Choose a source…" : "Add a source in Sleuth first"), ...sources.map((s) => h("option", { value: s.id }, s.title)));
    const evStance = h("select", { "aria-label": "Does it support or contradict the claim?" }, h("option", { value: "supports" }, "Supports"), h("option", { value: "contradicts" }, "Contradicts"));
    const evExtract = h("input", { type: "text", placeholder: "Short extract or summary of what it says", "aria-label": "Evidence extract", maxLength: 2000 });
    return h("div", null, h("p", { class: "crumbs" }, link("#/tool/sleuth", "Sleuth"), " / ", link(`#/sleuth/${p.id}`, p.title)), h("div", { class: "page-head" }, h("h1", null, "Claim"), h("div", { class: "row" }, pill(c.status), h("button", { class: "danger", type: "button", onClick: async () => { if (!confirm("Move this claim to the Trash?"))
            return; if (await persist(() => app.store.trash(c.id).then(() => true), "Claim moved to Trash"))
            go(`#/sleuth/${p.id}`); } }, "Delete"))), warnings.length ? h("section", { class: "panel warn", "aria-label": "Checks" }, h("h2", null, "Checks before you publish"), h("ul", null, ...warnings.map((w) => h("li", { class: w.level }, w.text))), h("p", { class: "hint" }, "These are prompts, not verdicts. Only you decide the status.")) : h("p", { class: "status ok" }, "No outstanding checks."), h("form", { class: "panel", onSubmit: async (e) => {
            e.preventDefault();
            if (!text.value.trim()) {
                setStatus("The claim cannot be empty.", "err");
                return;
            }
            await persist(() => app.store.save({ ...c, title: text.value.trim(), status: status.value, asOf: asOf.value, independentlyChecked: checked.checked, notes: notes.value }), "Claim saved");
        } }, field("Claim", text, "One checkable statement: who, what, when, how many."), h("div", { class: "grid tight" }, h("div", null, field("Status", status), help), field("Refers to the date", asOf, "Optional. For figures, the date they were correct.")), h("label", { class: "check" }, checked, h("span", null, "Independently checked (against a source other than the one it came from)")), field("Notes", notes), h("button", { class: "primary", type: "submit" }, "Save claim")), section("Evidence", c.evidence.length ? h("ul", { class: "items" }, ...c.evidence.map((ev, i) => evidenceRow(c, ev, i, smap))) : empty("No evidence attached yet."), h("form", { class: "evidence-form", onSubmit: async (e) => {
            e.preventDefault();
            if (!evSource.value) {
                setStatus("Choose a source for this evidence.", "err");
                evSource.focus();
                return;
            }
            const ev = { sourceId: evSource.value, stance: evStance.value, extract: evExtract.value.trim() };
            await persist(() => app.store.save({ ...c, evidence: [...c.evidence, ev] }), "Evidence attached");
        } }, h("div", { class: "row" }, evSource, evStance), evExtract, h("button", { type: "submit" }, "Attach evidence"))), crossCheckSection(c, p));
}
function evidenceRow(c, ev, i, smap) {
    const s = smap.get(ev.sourceId);
    const label = !s ? "(source deleted permanently)" : s.deletedAt ? `${s.title} (in the Trash)` : s.title;
    return h("li", null, h("span", null, h("strong", { class: ev.stance === "contradicts" ? "contra" : "" }, ev.stance === "supports" ? "Supports: " : "Contradicts: "), s && !s.deletedAt ? link(`#/source/${s.id}`, label) : label, s && PRIMARY_TYPES.includes(s.type) ? h("span", { class: "pill" }, "primary") : null, ev.extract ? h("span", { class: "extract" }, `“${ev.extract}”`) : null), h("button", { type: "button", class: "small", "aria-label": `Remove evidence from ${label}`, onClick: () => void persist(() => app.store.save({ ...c, evidence: c.evidence.filter((_, j) => j !== i) }), "Evidence removed") }, "Remove"));
}
