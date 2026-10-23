import { h } from "../extension/dom.js";
import { childrenOf, cleanUrl, live, newSource } from "../core/suite/model.js";
import { TIER_INFO, tierOf } from "../core/suite/sourcetier.js";
import { app, extLink, fmtDate, go, persist, section, setStatus, today, plural } from "./ui.js";
import { ai, runAi } from "./ai.js";
import { heldBackList, sportsdb } from "./sleuth.js";
const sourcesOf = (p) => childrenOf([...app.store.records()], p.id).filter((r) => r.kind === "source" && live(r));
/** A small badge saying how much weight a site can carry. */
export function tierBadge(url, p) {
    const t = tierOf(url, p.officialSites);
    return h("span", { class: `tier tier-${t}`, title: TIER_INFO[t].advice }, TIER_INFO[t].label);
}
/** Save an article (or news item) as a source, with the type suggested by its site. Returns the source. */
export async function saveArticle(p, a, note = "") {
    const url = cleanUrl(a.url);
    if (!url) {
        setStatus("That article has no usable link.", "err");
        return undefined;
    }
    const have = sourcesOf(p).find((s) => s.url === url);
    if (have) {
        setStatus("Already saved as a source.");
        return have;
    }
    const tier = tierOf(url, p.officialSites);
    const s = newSource(p.id, { title: a.title.slice(0, 300) || url, url, publisher: a.publisher.slice(0, 200), author: (a.author ?? "").slice(0, 200), type: tier === "official" ? "official" : TIER_INFO[tier].type,
        published: /^\d{4}-\d{2}-\d{2}$/.test(a.published) ? a.published : "", accessed: today(), notes: `${note}Site: ${TIER_INFO[tier].label}. ${TIER_INFO[tier].advice}` });
    return (await persist(() => app.store.save(s), "Saved as a source", { rerender: false }))?.[0];
}
/** Read an article and show it with its details, a save button and claim extraction. */
export function readerFor(p, url, onSaved, item) {
    const box = h("div", { class: "reader" });
    const btn = h("button", { type: "button", class: "small" }, "Read it here");
    btn.addEventListener("click", async () => {
        btn.disabled = true;
        box.replaceChildren(h("p", { class: "hint", role: "status" }, "Reading the article…"));
        try {
            box.replaceChildren(articleView(p, await ai("/v1/sleuth/read", { url }, 60_000), onSaved));
        }
        catch (e) {
            box.replaceChildren(pasteFallback(p, url, e.message, item, onSaved));
        }
        finally {
            btn.disabled = false;
        }
    });
    return h("div", null, btn, box);
}
/**
 * When a page cannot be read automatically (a paywall, a site that blocks automated reading), the journalist can
 * paste the text they can see in their own browser; it is then handled exactly like a read article.
 */
function pasteFallback(p, url, why, item, onSaved) {
    const text = h("textarea", { rows: 6, placeholder: "Open the article in your browser (signed in if you subscribe), copy the text, and paste it here.", "aria-label": "Paste the article text" });
    const out = h("div");
    return h("div", { class: "data-box" }, h("p", { class: "status warn" }, why), h("p", { class: "row" }, extLink(url, "Open the article in your browser")), text, h("button", { type: "button", class: "small", onClick: () => {
            if (text.value.trim().length < 80) {
                text.focus();
                setStatus("Paste the article text first.", "err");
                return;
            }
            out.replaceChildren(articleView(p, { url, title: item?.title ?? url, publisher: item?.source ?? "", author: "", published: item?.published ?? "", text: text.value.trim().slice(0, 60_000) }, onSaved));
        } }, "Use this text"), out);
}
export function articleView(p, a, onSaved) {
    const claimsOut = h("div");
    const claimsBtn = h("button", { type: "button", class: "small" }, "Find the claims in it (AI)");
    let saved = sourcesOf(p).find((s) => s.url === cleanUrl(a.url));
    const ensureSaved = async () => (saved ??= await saveArticle(p, a, "Read with Sleuth. "));
    claimsBtn.addEventListener("click", () => void runAi(claimsBtn, claimsOut, async () => {
        const s = await ensureSaved();
        if (!s)
            throw new Error("not saved");
        return { s, r: await ai("/v1/sleuth/claims", { text: a.text.slice(0, 30_000) }) };
    }, ({ s, r }) => h("div", null, r.claims.length ? h("ul", { class: "items" }, ...r.claims.map((c) => h("li", null, h("span", null, c.claim, h("span", { class: "extract" }, `“${c.excerpt}”`), c.caution ? h("span", { class: "status caution" }, ` ${c.caution}`) : null), h("button", { type: "button", class: "small", onClick: async (e) => {
            const { newClaim } = await import("../core/suite/model.js");
            const cl = { ...newClaim(p.id, c.claim), notes: `Suggested by AI from ${a.publisher || "a saved article"}.`, evidence: [{ sourceId: s.id, stance: "supports", extract: c.excerpt.slice(0, 400) }] };
            if (await persist(() => app.store.save(cl), "Claim added (unverified)", { rerender: false }))
                e.target.replaceWith(h("span", { class: "status ok" }, "Added"));
        } }, "Add claim")))) : h("p", null, "No checkable claims found."), heldBackList(r))));
    const saveBtn = h("button", { type: "button", class: "small primary", onClick: async (e) => { const s = await ensureSaved(); if (s) {
            e.target.replaceWith(h("span", { class: "status ok" }, "Saved as a source"));
            onSaved?.(s);
        } } }, saved ? "Saved" : "Save as source");
    if (saved)
        saveBtn.setAttribute("disabled", "");
    return h("div", { class: "data-box" }, h("h3", null, a.title || a.url), h("p", { class: "meta" }, [a.publisher, a.author && `by ${a.author}`, a.published && fmtDate(a.published)].filter(Boolean).join(" · "), " ", tierBadge(a.url, p)), h("details", null, h("summary", null, `Article text (${plural(a.text.split(/\s+/).length, "word", "words")})`), h("div", { class: "article-text" }, ...a.text.split(/\n{2,}/).slice(0, 80).map((para) => h("p", null, para)))), h("div", { class: "row" }, saveBtn, claimsBtn, extLink(a.url, "Open the original")), claimsOut, h("p", { class: "hint" }, "Text read automatically from the page: check anything you use against the original."));
}
/** Search recent news. */
export function newsSection(p) {
    const q = h("input", { type: "text", value: [p.clubs[0], p.people[0]].filter(Boolean).join(" ") || p.title, "aria-label": "Search the news" });
    const out = h("div");
    const btn = h("button", { type: "button", class: "primary" }, "Search the news");
    btn.addEventListener("click", () => {
        if (!q.value.trim()) {
            q.focus();
            return;
        }
        void runAi(btn, out, () => ai("/v1/sleuth/news", { query: q.value.trim() }, 60_000), (r) => r.items.length ? itemList(p, r.items) : h("p", null, "No recent news found. Try fewer or different words."));
    });
    return section("Latest news", h("p", { class: "hint" }, "Recent articles from Bing News (free, for your own research). Read any of them here, save it as a source and pull out its claims. Needs Start Inkling."), h("form", { class: "row", onSubmit: (e) => { e.preventDefault(); btn.click(); } }, q, btn), out);
}
function itemList(p, items) {
    return h("ul", { class: "items news" }, ...items.map((n) => h("li", null, h("div", null, h("a", { href: n.url, target: "_blank", rel: "noopener noreferrer" }, n.title), h("p", { class: "meta" }, [n.source, n.published && fmtDate(n.published)].filter(Boolean).join(" · "), " ", tierBadge(n.url, p)), n.summary ? h("p", { class: "hint" }, n.summary) : null, readerFor(p, n.url, undefined, n)))));
}
/** The clubs' own news: find their websites' feeds and list the latest. */
export function officialNewsSection(p) {
    const out = h("div");
    const site = h("input", { type: "url", placeholder: "Club website, e.g. https://www.theshots.co.uk", "aria-label": "Club website" });
    const list = h("ul", { class: "items" });
    const drawSites = () => list.replaceChildren(...p.officialSites.map((s) => h("li", null, h("span", null, s), h("div", { class: "row" }, h("button", { type: "button", class: "small", onClick: (e) => void showFeed(s, e.target) }, "Latest news"), h("button", { type: "button", class: "small", onClick: async () => { await persist(() => app.store.save({ ...p, officialSites: p.officialSites.filter((x) => x !== s) }), "Site removed"); } }, "Remove")))));
    const showFeed = (s, b) => runAi(b, out, () => ai("/v1/sleuth/feed", { url: s }, 60_000), (r) => h("div", null, h("p", { class: "meta" }, `From ${r.feed}`), itemList(p, r.items)));
    const add = async (raw) => {
        const u = cleanUrl(raw);
        if (!u) {
            setStatus("Enter the club website's address, starting with https://", "err");
            return;
        }
        if (p.officialSites.includes(u))
            return;
        await persist(() => app.store.save({ ...p, officialSites: [...p.officialSites, u] }), "Official site added");
    };
    // Suggest the clubs' websites from TheSportsDB (free).
    const suggest = h("div");
    const findBtn = h("button", { type: "button", class: "small", onClick: async () => {
            suggest.replaceChildren(h("p", { class: "hint" }, "Looking up…"));
            const found = [];
            for (const c of p.clubs.slice(0, 4)) {
                // TheSportsDB first (free, in the browser), then Wikidata through Start Inkling.
                let site = "";
                try {
                    const t = ((await sportsdb(`searchteams.php?t=${encodeURIComponent(c)}`)).teams ?? []).find((x) => x.strSport === "Soccer");
                    if (t?.strWebsite)
                        site = /^https?:/.test(t.strWebsite) ? t.strWebsite : `https://${t.strWebsite}`;
                }
                catch { /* next */ }
                if (!site) {
                    try {
                        site = (await ai("/v1/sleuth/clubsite", { club: c }, 60_000)).found?.site ?? "";
                    }
                    catch { /* none */ }
                }
                if (site)
                    found.push(site);
            }
            suggest.replaceChildren(found.length ? h("ul", { class: "items" }, ...found.filter((f) => !p.officialSites.includes(f)).map((f) => h("li", null, h("span", null, f), h("button", { type: "button", class: "small", onClick: () => void add(f) }, "Add"))))
                : h("p", { class: "hint" }, "No websites found for this project's clubs. Type the address instead."));
        } }, "Find the clubs' websites");
    drawSites();
    return section("Official club news", h("p", { class: "hint" }, "Add your clubs' own websites. Their news counts as official evidence, and Sleuth reads their news feeds."), list, h("form", { class: "row", onSubmit: (e) => { e.preventDefault(); void add(site.value); } }, site, h("button", { type: "submit" }, "Add site")), p.clubs.length ? h("div", { class: "row" }, findBtn) : null, suggest, out);
}
/** On a source's page: read its link and fill in what is missing (publisher, author, date). */
export function readSourceSection(s, p) {
    if (!s.url)
        return h("div");
    const out = h("div");
    const btn = h("button", { type: "button" }, "Read the page");
    const show = (a) => {
        const fill = { publisher: s.publisher || a.publisher, author: s.author || a.author, published: s.published || a.published };
        const changed = fill.publisher !== s.publisher || fill.author !== s.author || fill.published !== s.published;
        return h("div", null, changed ? h("button", { type: "button", class: "small", onClick: async () => { await persist(() => app.store.save({ ...app.store.get(s.id), ...fill }), "Details filled in"); go(`#/source/${s.id}`); } }, `Fill in ${[fill.publisher !== s.publisher && "publisher", fill.author !== s.author && "author", fill.published !== s.published && "date"].filter(Boolean).join(", ")} from the page`) : null, articleView(p, a));
    };
    btn.addEventListener("click", async () => {
        btn.disabled = true;
        out.replaceChildren(h("p", { class: "hint", role: "status" }, "Reading the page…"));
        try {
            out.replaceChildren(show(await ai("/v1/sleuth/read", { url: s.url }, 60_000)));
        }
        catch (e) {
            out.replaceChildren(pasteFallback(p, s.url, e.message, { title: s.title, source: s.publisher, published: s.published }));
        }
        finally {
            btn.disabled = false;
        }
    });
    return section("Read this source", h("p", { class: "hint" }, "Reads the linked page on this computer (needs Start Inkling), shows its text, and finds its claims."), btn, out);
}
/** Publishers already supporting a claim, to tell whether a new source is independent. */
function supportingPublishers(c) {
    const out = new Set();
    for (const e of c.evidence) {
        const s = app.store.get(e.sourceId);
        if (s && e.stance === "supports")
            out.add((s.publisher || hostOf(s.url)).toLowerCase());
    }
    return out;
}
const hostOf = (u) => { try {
    return new URL(u).hostname.replace(/^www\./, "");
}
catch {
    return "";
} };
/**
 * Cross-check a saved claim: look for other articles that support or contradict it, each with the passage that
 * does so, and attach any of them as evidence in one click. The journalist still decides the claim's status.
 */
export function crossCheckSection(c0, p) {
    const out = h("div");
    const btn = h("button", { type: "button", class: "primary" }, "Find other sources");
    const run = () => runAi(btn, out, () => {
        const c = app.store.get(c0.id);
        const exclude = c.evidence.map((e) => app.store.get(e.sourceId)?.url ?? "").filter(Boolean);
        return ai("/v1/sleuth/crosscheck", { claim: c.title, exclude }, 300_000);
    }, (r) => {
        const have = supportingPublishers(app.store.get(c0.id));
        const row = (x) => h("li", null, h("div", null, h("a", { href: x.url, target: "_blank", rel: "noopener noreferrer" }, x.title || x.url), h("p", { class: "meta" }, [x.publisher, x.published && fmtDate(x.published)].filter(Boolean).join(" · "), " ", tierBadge(x.url, p), x.stance === "supports" && !have.has((x.publisher || hostOf(x.url)).toLowerCase()) ? h("span", { class: "tier tier-official" }, "Independent") : null), h("span", { class: "extract" }, `“${x.passage.slice(0, 500)}${x.passage.length > 500 ? "…" : ""}”`)), h("div", { class: "row" }, ...(x.stance === "supports" ? ["supports"] : ["supports", "contradicts"]).map((stance) => h("button", { type: "button", class: "small", onClick: async (e) => {
                const s = await saveArticle(p, x, "Found by Sleuth's cross-check. ");
                if (!s)
                    return;
                const cur = app.store.get(c0.id);
                if (!cur.evidence.some((ev) => ev.sourceId === s.id))
                    await persist(() => app.store.save({ ...cur, evidence: [...cur.evidence, { sourceId: s.id, stance, extract: x.passage.slice(0, 400) }] }), stance === "supports" ? "Attached as supporting evidence" : "Attached as contradicting evidence");
                e.target.closest(".row").replaceWith(h("span", { class: "status ok" }, "Attached"));
            } }, stance === "supports" ? (x.stance === "supports" ? "Attach as support" : "It supports it: attach") : "It contradicts it: attach"))));
        const sup = r.results.filter((x) => x.stance === "supports"), rel = r.results.filter((x) => x.stance === "related");
        return h("div", null, h("p", { class: "meta" }, `Searched the news, read ${r.read} article(s).`), sup.length ? h("div", null, h("h3", null, `${sup.length} source(s) support it (checked against their own words)`), h("ul", { class: "items news" }, ...sup.map(row))) : h("p", null, "No other source was found that clearly says this."), rel.length ? h("div", null, h("h3", null, `${rel.length} other report(s) mention it: read them`), h("p", { class: "hint" }, "These name the same people or teams but were not judged to confirm the claim. If one disagrees (a different score, date or fee), attach it as a contradiction. Spotting contradictions is left to you: the free AI got them wrong in testing."), h("ul", { class: "items news" }, ...rel.map(row))) : null, !r.results.length ? h("p", { class: "hint" }, "Try an official source (the club or league), or the football data in Sleuth.") : null, h("p", { class: "hint" }, "Each passage was judged by the free AI on its own words. Read it before attaching: you decide the claim's status."));
    });
    btn.addEventListener("click", () => void run());
    return section("Cross-check", h("p", { class: "hint" }, "Looks for other articles about this claim: ones that confirm it (checked), and other reports for you to read (needs Start Inkling; about a minute)."), btn, out);
}
