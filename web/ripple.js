import { h } from "../extension/dom.js";
import { childrenOf, cleanUrl, live, newCampaign, newPost, PLATFORMS } from "../core/suite/model.js";
import { articleThread, bestTimes, countChars, engagementRate, formatComparison, GROWTH_TIPS, latest, parseMetricsCsv, PLATFORM_INFO, postNotes, suggestPosts, threadParts } from "../core/suite/ripple.js";
import { app, empty, extLink, field, fmtDate, go, link, persist, projectOf, projects, section, setStatus, today, plural } from "./ui.js";
import { ai, aiBox, runAi } from "./ai.js";
import { loadFonts, render } from "./render.js";
import { reachSection, studioSection, trendingSection } from "./studio.js";
import { atUriFromUrl, blueskyAccount, BlueskyError, blueskyPublish, blueskyPublishThread, blueskyStats, BLUESKY_IMAGE_BYTES } from "./bluesky.js";
/**
 * Ripple: social posts, planning and real figures. Posts are drafts until the writer confirms they published
 * them (with the link). Figures come only from what the writer enters or imports.
 */
const FORMAT_LABEL = { headline: "Headline and summary", quote: "Quote", thread: "Thread", graphic: "Graphic", other: "Other" };
const STATUS_LABEL = { draft: "Draft", ready: "Ready to post", posted: "Posted" };
const postsOf = (p) => childrenOf([...app.store.records()], p.id).filter((r) => r.kind === "post" && live(r));
const campaignsOf = (p) => childrenOf([...app.store.records()], p.id).filter((r) => r.kind === "campaign" && live(r));
const quoteMap = () => new Map(app.store.records().filter((r) => r.kind === "quote").map((q) => [q.id, q]));
const fmtWhen = (s) => (s ? new Date(s).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "not planned");
const graphicsOf = (p) => childrenOf([...app.store.records()], p.id).filter((r) => r.kind === "graphic" && live(r) && !!r.image);
/** The graphic as a JPEG small enough for Bluesky, keeping its proportions. */
async function imageForBluesky(g) {
    // A graphic made in Pixel is drawn afresh at its full size, so the post is as sharp as the PNG download.
    let img;
    let w, hh;
    if (g.design) {
        const c = document.createElement("canvas");
        await loadFonts();
        await render(c, g.design, g.preset, g.design.brandId ? app.store.get(g.design.brandId) ?? null : null);
        img = c;
        w = c.width;
        hh = c.height;
    }
    else {
        const im = new Image();
        im.src = g.image;
        await im.decode();
        img = im;
        w = im.naturalWidth;
        hh = im.naturalHeight;
    }
    for (let attempt = 0; attempt < 8; attempt++) {
        const c = document.createElement("canvas");
        c.width = w;
        c.height = hh;
        c.getContext("2d").drawImage(img, 0, 0, w, hh);
        for (const q of [0.9, 0.8, 0.7]) {
            const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", q));
            if (blob && blob.size <= BLUESKY_IMAGE_BYTES)
                return { blob, alt: g.altText || g.design?.altText || "", width: w, height: hh };
        }
        w = Math.round(w * 0.8);
        hh = Math.round(hh * 0.8);
    }
    throw new BlueskyError("Could not make the image small enough for Bluesky.");
}
const pct = (x) => (x * 100).toFixed(1) + "%";
export function rippleHome() {
    const ps = projects().sort((a, b) => b.updatedAt - a.updatedAt);
    const all = app.store.records().filter((r) => r.kind === "post" && live(r));
    return h("div", null, h("h1", null, "Ripple"), h("p", { class: "lead" }, "Make content that travels: hooks, threads, carousels, short-video scripts and polls from your articles, tied to what is trending, planned on a calendar, and improved from how your posts really did."), trendingSection(), calendar(all), ps.length ? section("Choose a project", h("ul", { class: "items" }, ...ps.map((p) => { const ps2 = postsOf(p); return h("li", null, link(`#/social/${p.id}`, p.title), h("span", { class: "meta" }, `${plural(ps2.length, "post", "posts")} · ${ps2.filter((x) => x.status === "posted").length} posted`)); })))
        : empty("Create a project first."), bestTimesSection(all), section("Growing your audience, honestly", h("ul", null, ...GROWTH_TIPS.map((t) => h("li", null, t)))), section("What Ripple does not do", h("p", null, "It cannot promise anything goes viral, and it never trades accuracy for clicks: every name, number and quote it writes is checked against your article. It does not post for you (except Bluesky, if you choose); copy the text, or open the platform's compose box from a post.")));
}
/** Four weeks of planned and published posts, Monday first, starting this week (or a week you move to). */
let calendarStart = 0; // weeks from this week
function calendar(all) {
    const box = h("div");
    const draw = () => {
        const now = new Date();
        const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7) + calendarStart * 7);
        const days = Array.from({ length: 28 }, (_, i) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i));
        const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const on = (k) => all.filter((p) => (p.status === "posted" ? p.postedAt : p.plannedFor.slice(0, 10)) === k).sort((a, b) => a.plannedFor.localeCompare(b.plannedFor));
        const todayKey = key(now);
        box.replaceChildren(section("Calendar", h("div", { class: "row" }, h("button", { type: "button", class: "small", onClick: () => { calendarStart -= 4; draw(); } }, "‹ Earlier"), h("button", { type: "button", class: "small", onClick: () => { calendarStart = 0; draw(); } }, "This week"), h("button", { type: "button", class: "small", onClick: () => { calendarStart += 4; draw(); } }, "Later ›"), h("span", { class: "meta" }, `${fmtDate(key(days[0]))} – ${fmtDate(key(days[27]))}`)), h("div", { class: "cal", role: "grid", "aria-label": "Posts by day" }, ...["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => h("div", { class: "cal-head", role: "columnheader" }, d)), ...days.map((d) => {
            const k = key(d);
            const items = on(k);
            return h("div", { class: "cal-day" + (k === todayKey ? " today" : "") + (k < todayKey ? " past" : ""), role: "gridcell" }, h("span", { class: "cal-date" }, String(d.getDate()) + (d.getDate() === 1 ? " " + d.toLocaleDateString("en-GB", { month: "short" }) : "")), ...items.map((p) => h("a", { href: `#/post/${p.id}`, class: `cal-post post-${p.status}`, title: p.title }, h("span", { class: "cal-time" }, p.status === "posted" ? "✓" : p.plannedFor.slice(11, 16) || ""), ` ${PLATFORM_INFO[p.platform].label.split(" ")[0]}: ${p.title}`)));
        })), h("p", { class: "hint" }, "Planned posts show at their planned time; posted ones (✓) on the day they went out. Nothing is scheduled on the platforms: publish when the time comes.")));
    };
    draw();
    return box;
}
/** When your posts have done best, from your own figures (never general advice dressed up as data). */
function bestTimesSection(all) {
    const r = bestTimes(all);
    if (!r.enough)
        return section("Best times to post", h("p", null, `Not enough of your own data yet: ${r.measured} posted post(s) with figures. After 8 or more (Bluesky figures are fetched with one click on each post; X and Facebook/Instagram figures come in by importing their export file on a project's social page), Ripple shows which days and times worked best for you.`));
    const top = r.byDay[0];
    return section("Best times to post (your own figures)", top ? h("p", null, h("strong", null, `${top.day}s`), ` have done best for you: about ${top.avg.toFixed(1)} engagements per post (${plural(top.posts, "post", "posts")}).`) : null, h("table", null, h("thead", null, h("tr", null, h("th", null, "Day"), h("th", null, "Posts"), h("th", null, "Average engagements"))), h("tbody", null, ...r.byDay.map((x) => h("tr", null, h("td", null, x.day), h("td", null, String(x.posts)), h("td", null, x.avg.toFixed(1)))))), r.byPart.length ? h("table", null, h("thead", null, h("tr", null, h("th", null, "Time of day"), h("th", null, "Posts"), h("th", null, "Average engagements"))), h("tbody", null, ...r.byPart.map((x) => h("tr", null, h("td", null, x.part), h("td", null, String(x.posts)), h("td", null, x.avg.toFixed(1)))))) : null, h("p", { class: "hint" }, `From ${plural(r.measured, "post", "posts")}. Small numbers can mislead: one big story makes a day look good. Treat this as a hint and keep testing.`));
}
export function socialProject(p) {
    const posts = postsOf(p).sort((a, b) => (a.plannedFor || "9").localeCompare(b.plannedFor || "9") || b.updatedAt - a.updatedAt);
    const camps = campaignsOf(p);
    const drafts = childrenOf([...app.store.records()], p.id).filter((r) => r.kind === "draft" && live(r));
    const draftPick = h("select", { "aria-label": "Article to promote" }, h("option", { value: "" }, drafts.length ? "Choose an article…" : "No drafts in this project"), ...drafts.map((d) => h("option", { value: d.id }, d.title)));
    const url = h("input", { type: "url", placeholder: "Article link (optional)", "aria-label": "Article link" });
    draftPick.addEventListener("change", () => { const d = drafts.find((x) => x.id === draftPick.value); if (d?.publishedUrl)
        url.value = d.publishedUrl; });
    const platform = h("select", { "aria-label": "Platform" }, ...PLATFORMS.map((x) => h("option", { value: x }, PLATFORM_INFO[x].label)));
    const campTitle = h("input", { type: "text", placeholder: "e.g. Striker signing week", "aria-label": "Campaign name" });
    const comparison = formatComparison(posts);
    const csv = h("input", { type: "file", accept: ".csv,text/csv", "aria-label": "Figures CSV file" });
    const csvResult = h("div", { role: "status" }, lastCsv);
    lastCsv = null; // the last import's message survives the redraw
    return h("div", null, h("p", { class: "crumbs" }, link("#/tool/ripple", "Ripple"), " / ", link(`#/project/${p.id}`, p.title)), h("h1", null, `Social: ${p.title}`), studioSection(p), h("div", { class: "grid" }, section("Posts from an article", h("p", { class: "hint" }, "First drafts built only from your headline, standfirst and saved quotes. Edit each one before you use it."), draftPick, url, h("button", { type: "button", onClick: async () => {
            const d = drafts.find((x) => x.id === draftPick.value);
            if (!d) {
                setStatus("Choose an article first.", "err");
                return;
            }
            const u = cleanUrl(url.value);
            if (u === null) {
                setStatus("The article link must be a web address.", "err");
                return;
            }
            const made = suggestPosts(d, p, [...quoteMap().values()], u).map((s) => newPost(p.id, s.platform, s.text, { format: s.format, draftId: d.id, title: `${PLATFORM_INFO[s.platform].label}: ${FORMAT_LABEL[s.format]}` }));
            await persist(() => app.store.save(...made), `${plural(made.length, "draft post", "draft posts")} created`);
        } }, "Create draft posts"), h("button", { type: "button", onClick: async () => {
            const d = drafts.find((x) => x.id === draftPick.value);
            if (!d) {
                setStatus("Choose an article first.", "err");
                return;
            }
            const u = cleanUrl(url.value);
            if (u === null) {
                setStatus("The article link must be a web address.", "err");
                return;
            }
            const t = newPost(p.id, "bluesky", articleThread(d, [...quoteMap().values()], u, 300), { format: "thread", draftId: d.id, title: `Bluesky thread: ${d.title}`.slice(0, 60) });
            const s2 = await persist(() => app.store.save(t), "Thread drafted");
            if (s2)
                go(`#/post/${t.id}`);
        } }, "Create a thread")), aiPosts(p, drafts), section("Blank post", h("form", { class: "row", onSubmit: async (e) => { e.preventDefault(); const s = await persist(() => app.store.save(newPost(p.id, platform.value, "", { title: `${PLATFORM_INFO[platform.value].label} post` })), "Post created"); if (s)
            go(`#/post/${s[0].id}`); } }, platform, h("button", { type: "submit" }, "New post"))), section("Campaigns", h("form", { class: "row", onSubmit: async (e) => { e.preventDefault(); if (!campTitle.value.trim())
            return; await persist(() => app.store.save(newCampaign(p.id, campTitle.value)), "Campaign created"); } }, campTitle, h("button", { type: "submit" }, "Add")), camps.length ? h("ul", { class: "items" }, ...camps.map((c) => h("li", null, h("span", null, c.title), h("span", { class: "meta" }, `${plural(posts.filter((x) => x.campaignId === c.id).length, "post", "posts")}`)))) : empty("No campaigns. Group posts for one story or week."))), section(`Posts (${posts.length})`, posts.length ? h("ul", { class: "items" }, ...posts.map((x) => {
        const m = latest(x);
        const r = m && engagementRate(m);
        return h("li", null, link(`#/post/${x.id}`, x.title), h("span", { class: "row" }, h("span", { class: "meta" }, `${fmtWhen(x.plannedFor)}${r != null ? ` · ${pct(r)} engagement` : ""}`), h("span", { class: `pill post-${x.status}` }, STATUS_LABEL[x.status])));
    })) : empty("No posts yet.")), section("What is working", comparison ? h("table", null, h("thead", null, h("tr", null, h("th", null, "Format"), h("th", null, "Posts measured"), h("th", null, "Average engagement rate"))), h("tbody", null, ...comparison.map((r) => h("tr", null, h("td", null, FORMAT_LABEL[r.format]), h("td", null, String(r.posts)), h("td", null, pct(r.avgRate))))))
        : h("p", null, "Not enough data yet. Once at least two formats each have three posted posts with figures, Ripple compares them here."), h("p", { class: "hint" }, "Engagement rate = engagements ÷ impressions, from the figures you entered.")), section("Import figures", h("p", null, "Download your figures from X (Analytics › Export data) or Meta Business Suite (Insights › Content › Export) and import the file here. Rows are matched to the posts you marked as posted, by their link; importing the same file again adds nothing new."), h("p", { class: "hint" }, "Your own spreadsheet works too, with columns: url, date (YYYY-MM-DD), impressions, engagements, clicks, follower_change."), h("div", { class: "row" }, csv, h("button", { type: "button", onClick: async () => {
            const f = csv.files?.[0];
            if (!f) {
                csvResult.textContent = "Choose a CSV file first.";
                return;
            }
            const { updates, errors, unmatched, source } = parseMetricsCsv(await f.text(), posts);
            // The same figures twice (the same file imported again) are not added again.
            const same = (a, b) => a.date === b.date && a.impressions === b.impressions && a.engagements === b.engagements && a.clicks === b.clicks;
            let added = 0;
            const changed = [...updates].flatMap(([id, entries]) => {
                const cur = app.store.get(id);
                const fresh = entries.filter((e) => !cur.metrics.some((m) => same(m, e)));
                added += fresh.length;
                return fresh.length ? [{ ...cur, metrics: [...cur.metrics, ...fresh] }] : [];
            });
            lastCsv = h("div", { class: "status " + (errors.length ? "err" : "ok") }, h("p", null, `${source && source !== "simple" && source !== "CSV" ? `Read as ${source === "X" ? "an X" : "a " + source} export. ` : ""}Added ${added} new figure${added === 1 ? "" : "s"} for ${changed.length} post${changed.length === 1 ? "" : "s"}.`), unmatched ? h("p", { class: "hint" }, `${unmatched} row${unmatched === 1 ? " is" : "s are"} for posts not marked as posted in Ripple, so ${unmatched === 1 ? "it was" : "they were"} skipped. To include a post, open it, choose “I have posted it” and paste its link.`) : null, ...(errors.length ? [h("ul", null, ...errors.slice(0, 20).map((e) => h("li", null, e)))] : []));
            if (changed.length)
                await persist(() => app.store.save(...changed), `Figures imported for ${plural(changed.length, "post", "posts")}`); // redraws the page, which shows the message
            else
                csvResult.replaceChildren(lastCsv);
        } }, "Import")), csvResult));
}
let lastCsv = null;
/** The writer's own published posts (newest first), so AI drafts can match their voice. */
const myVoice = () => app.store.records().filter((r) => r.kind === "post" && live(r) && r.status === "posted" && r.text.trim().length > 30)
    .sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6).map((r) => r.text.slice(0, 600));
/** AI-written promotion for an article. Quotes are limited to saved quotes; any post that strays is withheld by the server. */
function aiPosts(p, drafts) {
    const pick = h("select", { "aria-label": "Article for AI posts" }, h("option", { value: "" }, drafts.length ? "Choose an article…" : "No drafts in this project"), ...drafts.map((d) => h("option", { value: d.id }, d.title)));
    const out = h("div");
    const btn = h("button", { type: "button" }, "Write posts with AI");
    btn.addEventListener("click", () => {
        const d = drafts.find((x) => x.id === pick.value);
        if (!d) {
            out.replaceChildren(h("p", { class: "status err" }, "Choose an article first."));
            return;
        }
        const quotes = [...quoteMap().values()].filter((q) => q.projectId === p.id && !q.deletedAt && !q.supersededBy && !q.uncertain);
        void runAi(btn, out, () => ai("/v1/ripple/posts", { examples: myVoice(), headline: d.title, body: [d.standfirst, d.body].filter(Boolean).join("\n\n"), url: d.publishedUrl, quotes: quotes.map((q) => `${q.title} (${q.speaker})`), platforms: ["x", "bluesky", "instagram", "linkedin"] }), (r) => aiBox(`${plural(r.posts.length, "draft post", "draft posts")}`, h("ul", { class: "items" }, ...r.posts.map((x) => h("li", null, h("span", null, h("strong", null, PLATFORM_INFO[x.platform].label + ": "), h("span", { class: "pre" }, x.text), x.withheld ? h("span", { class: "status err" }, " " + x.problem) : countChars(x.text, x.platform) > PLATFORM_INFO[x.platform].limit ? h("span", { class: "status err" }, ` ${countChars(x.text, x.platform)}/${PLATFORM_INFO[x.platform].limit}: too long for ${PLATFORM_INFO[x.platform].label}, shorten it before posting.`) : h("span", { class: "meta" }, ` (${countChars(x.text, x.platform)}/${PLATFORM_INFO[x.platform].limit})`), x.caution ? h("span", { class: "status caution" }, ` Check: ${x.caution.replace(/\.$/, "")}.`) : null), x.withheld ? null : h("button", { type: "button", class: "small", onClick: async (e) => { if (await persist(() => app.store.save(newPost(p.id, x.platform, x.text, { format: x.format, draftId: d.id, title: `${PLATFORM_INFO[x.platform].label}: AI ${FORMAT_LABEL[x.format].toLowerCase()}` })), "Draft post saved", { rerender: false }))
                e.target.replaceWith(h("span", { class: "status ok" }, "Saved as draft")); } }, "Save as draft"))))));
    });
    const n = myVoice().length;
    return section("Posts with AI", h("p", { class: "hint" }, `Written from the article and your saved quotes${n ? `, in the style of your ${n} most recent published posts` : ""}. Posts stay drafts until you publish them yourself.`), pick, btn, out);
}
export function postPage(x) {
    const p = projectOf(x);
    if (!p)
        return empty("This post's project is missing.");
    const fresh = () => app.store.get(x.id);
    const camps = campaignsOf(p);
    const platform = h("select", null, ...PLATFORMS.map((v) => h("option", { value: v, selected: x.platform === v }, PLATFORM_INFO[v].label)));
    const format = h("select", null, ...Object.keys(FORMAT_LABEL).map((v) => h("option", { value: v, selected: x.format === v }, FORMAT_LABEL[v])));
    const campaign = h("select", null, h("option", { value: "" }, "No campaign"), ...camps.map((c) => h("option", { value: c.id, selected: x.campaignId === c.id }, c.title)));
    const planned = h("input", { type: "datetime-local", value: x.plannedFor });
    const status = h("select", null, h("option", { value: "draft", selected: x.status === "draft" }, "Draft"), h("option", { value: "ready", selected: x.status === "ready" }, "Ready to post"), ...(x.status === "posted" ? [h("option", { value: "posted", selected: true }, "Posted")] : []));
    const text = h("textarea", { rows: 8, value: x.text, "aria-label": "Post text" });
    const gfx = graphicsOf(p);
    const graphic = h("select", null, h("option", { value: "" }, gfx.length ? "No graphic" : "No graphics with an image yet (make one in Pixel)"), ...gfx.map((g) => h("option", { value: g.id, selected: x.graphicId === g.id }, g.title)));
    const chosen = () => gfx.find((g) => g.id === graphic.value) ?? null;
    const graphicBox = h("div");
    const showGraphic = () => {
        const g = chosen();
        if (!g) {
            graphicBox.replaceChildren();
            return;
        }
        const alt = g.altText || g.design?.altText || "";
        graphicBox.replaceChildren(h("div", { class: "post-graphic" }, h("img", { src: g.image, alt: alt || `Graphic: ${g.title}` }), h("div", null, alt ? h("p", null, h("strong", null, "Alt text: "), alt) : h("p", { class: "status warn" }, "This graphic has no alt text yet. Add it on the graphic's page so everyone can read it."), h("div", { class: "row" }, link(`#/graphic/${g.id}`, "Open in Pixel"), h("button", { type: "button", class: "small", onClick: () => { const a = h("a", { href: g.image, download: `${g.title.replace(/[^\w-]+/g, "-").toLowerCase()}.jpg` }); document.body.append(a); a.click(); a.remove(); } }, "Download the image")))));
    };
    graphic.addEventListener("change", showGraphic);
    showGraphic();
    const counter = h("span", { class: "meta", "aria-live": "polite" });
    const notesBox = h("div");
    const refresh = () => {
        const info = PLATFORM_INFO[platform.value];
        const parts = threadParts(text.value);
        const sizes = parts.map((x) => countChars(x, platform.value));
        const n = Math.max(0, ...sizes);
        counter.textContent = parts.length > 1 ? `Thread of ${plural(parts.length, "post", "posts")} · longest ${n} / ${info.limit}` : `${n} / ${info.limit}`;
        counter.className = "meta" + (n > info.limit ? " overdue" : "");
        const notes = postNotes({ ...fresh(), platform: platform.value, text: text.value, status: status.value, plannedFor: planned.value }, quoteMap());
        notesBox.replaceChildren(notes.length ? h("ul", { class: "checks" }, ...notes.map((n2) => h("li", { class: n2.level }, n2.text))) : h("p", { class: "status ok" }, "No problems found."));
    };
    text.addEventListener("input", refresh);
    platform.addEventListener("change", refresh);
    refresh();
    const save = () => persist(() => app.store.save({ ...fresh(), platform: platform.value, format: format.value, campaignId: campaign.value, graphicId: graphic.value, plannedFor: planned.value, status: status.value, text: text.value, title: fresh().title }), "Post saved");
    const postedUrl = h("input", { type: "url", placeholder: "Link to the live post", "aria-label": "Link to the live post" });
    const info = () => PLATFORM_INFO[fresh().platform];
    const m = { date: h("input", { type: "date", value: today(), "aria-label": "Date read" }), imp: h("input", { type: "number", min: 0, placeholder: "Impressions", "aria-label": "Impressions" }), eng: h("input", { type: "number", min: 0, placeholder: "Engagements", "aria-label": "Engagements" }), clk: h("input", { type: "number", min: 0, placeholder: "Link clicks", "aria-label": "Link clicks" }), fol: h("input", { type: "number", placeholder: "Follower change", "aria-label": "Follower change" }) };
    const num = (el) => (el.value.trim() === "" ? null : Math.round(Number(el.value)));
    return h("div", null, h("p", { class: "crumbs" }, link("#/tool/ripple", "Ripple"), " / ", link(`#/social/${p.id}`, p.title)), h("div", { class: "page-head" }, h("h1", null, x.title), h("span", { class: `pill post-${x.status}` }, STATUS_LABEL[x.status])), h("div", { class: "grid" }, section("Write", h("form", { onSubmit: (e) => { e.preventDefault(); void save(); } }, h("div", { class: "grid tight" }, field("Platform", platform), field("Format", format), field("Campaign", campaign), field("Planned for", planned, "A plan for you; nothing is scheduled on the platform."), field("Status", status)), text, h("div", { class: "row" }, counter), field("Graphic", graphic, "Posted with the text on Bluesky; download it to post elsewhere."), graphicBox, h("button", { class: "primary", type: "submit" }, "Save post"))), section("Checks", notesBox), section("Will it travel?", reachSection(x, () => !!chosen(), () => ({ ...fresh(), platform: platform.value, text: text.value, graphicId: graphic.value })))), section("Publish it yourself", h("div", { class: "row" }, h("button", { type: "button", onClick: async () => { try {
            await navigator.clipboard.writeText(text.value);
            setStatus("Post text copied");
        }
        catch {
            text.select();
            setStatus("Copy blocked by the browser: the text is selected, press Ctrl+C.", "err");
        } } }, "Copy text"), info().compose ? h("button", { type: "button", onClick: () => { void save(); window.open(info().compose(text.value), "_blank", "noopener,noreferrer"); } }, `Open ${info().label} to post`) : h("span", { class: "hint" }, `${info().label} has no web compose link: copy the text and post from the app.`), x.status !== "posted" && fresh().platform === "bluesky" ? h("button", { type: "button", class: "primary", onClick: async () => {
            const acct = blueskyAccount();
            if (!acct) {
                setStatus("Connect your Bluesky account in Settings first.", "err");
                return;
            }
            const body = text.value.trim();
            if (!body) {
                setStatus("The post is empty.", "err");
                return;
            }
            const problems = postNotes({ ...fresh(), text: body }, quoteMap()).filter((n) => n.level === "problem");
            if (problems.length) {
                setStatus("Fix the problems in Checks before publishing.", "err");
                return;
            }
            const g = chosen();
            if (g && !(g.altText || g.design?.altText)) {
                setStatus("Add alt text to the graphic first (on its page in Pixel).", "err");
                return;
            }
            const parts = threadParts(body);
            if (!confirm(`Publish this ${parts.length > 1 ? `thread of ${plural(parts.length, "post", "posts")}` : "post"} publicly on Bluesky as @${acct.handle}?${g ? `\n\nWith the graphic “${g.title}”.` : ""}\n\n${body}`))
                return;
            try {
                const img = g ? await imageForBluesky(g) : undefined;
                const url = parts.length > 1 ? await blueskyPublishThread(parts, img) : await blueskyPublish(body, img);
                await persist(() => app.store.save({ ...fresh(), text: body, graphicId: graphic.value, format: g ? "graphic" : fresh().format, status: "posted", postedUrl: url, postedAt: today() }), "Published on Bluesky");
            }
            catch (e) {
                setStatus(e instanceof BlueskyError ? e.message : "Publishing failed.", "err");
            }
        } }, "Publish to Bluesky now") : null), x.status === "posted" ? h("p", null, "Posted ", x.postedAt ? fmtDate(x.postedAt) + " " : "", extLink(x.postedUrl, "view post"))
        : h("form", { class: "row", onSubmit: async (e) => {
                e.preventDefault();
                const u = cleanUrl(postedUrl.value);
                if (!u) {
                    setStatus("Paste the link to the live post first.", "err");
                    postedUrl.focus();
                    return;
                }
                if (!confirm("Confirm you have published this post yourself on the platform?"))
                    return;
                await persist(() => app.store.save({ ...fresh(), text: text.value, status: "posted", postedUrl: u, postedAt: today() }), "Marked as posted");
            } }, postedUrl, h("button", { type: "submit" }, "I have posted it")), h("p", { class: "hint" }, "A post only shows as posted after you confirm it and give its link.")), x.status === "posted" ? section("Figures", h("p", { class: "hint" }, "Copy these from the platform's own insights. Leave a box empty if the platform does not show that figure."), atUriFromUrl(x.postedUrl) ? h("div", { class: "row" }, h("button", { type: "button", onClick: async () => {
            try {
                const s = await blueskyStats(x.postedUrl);
                const entry = { date: today(), impressions: null, engagements: s.likes + s.reposts + s.replies + s.quotes, clicks: null, followerChange: null, origin: "import" };
                await persist(() => app.store.save({ ...fresh(), metrics: [...fresh().metrics, entry] }), `From Bluesky: ${s.likes} likes, ${s.reposts} reposts, ${s.replies} replies, ${plural(s.quotes, "quote", "quotes")}`);
            }
            catch (e) {
                setStatus(e instanceof BlueskyError ? e.message : "Could not fetch figures.", "err");
            }
        } }, "Fetch figures from Bluesky"), h("span", { class: "hint" }, "Free and public: likes, reposts, replies and quotes. Bluesky does not publish impressions.")) : null, h("form", { class: "row", onSubmit: async (e) => {
            e.preventDefault();
            const entry = { date: m.date.value, impressions: num(m.imp), engagements: num(m.eng), clicks: num(m.clk), followerChange: num(m.fol), origin: "manual" };
            if (!entry.date) {
                setStatus("Add the date you read the figures.", "err");
                return;
            }
            if ([entry.impressions, entry.engagements, entry.clicks, entry.followerChange].every((v) => v === null)) {
                setStatus("Enter at least one figure.", "err");
                return;
            }
            if ([entry.impressions, entry.engagements, entry.clicks].some((v) => v !== null && (v < 0 || !Number.isFinite(v)))) {
                setStatus("Figures cannot be negative.", "err");
                return;
            }
            await persist(() => app.store.save({ ...fresh(), metrics: [...fresh().metrics, entry] }), "Figures saved");
        } }, m.date, m.imp, m.eng, m.clk, m.fol, h("button", { type: "submit" }, "Add figures")), x.metrics.length ? h("table", null, h("thead", null, h("tr", null, ...["Date", "Impressions", "Engagements", "Rate", "Clicks", "Followers", "From", ""].map((c) => h("th", null, c)))), h("tbody", null, ...x.metrics.map((e, i) => {
        const r = engagementRate(e);
        return h("tr", null, h("td", null, fmtDate(e.date)), h("td", null, e.impressions?.toLocaleString("en-GB") ?? "—"), h("td", null, e.engagements?.toLocaleString("en-GB") ?? "—"), h("td", null, r != null ? pct(r) : "—"), h("td", null, e.clicks?.toLocaleString("en-GB") ?? "—"), h("td", null, e.followerChange != null ? (e.followerChange > 0 ? "+" : "") + e.followerChange : "—"), h("td", null, e.origin), h("td", null, h("button", { type: "button", class: "small", "aria-label": `Remove figures from ${e.date}`, onClick: () => void persist(() => app.store.save({ ...fresh(), metrics: fresh().metrics.filter((_, j) => j !== i) }), "Figures removed") }, "Remove")));
    })))
        : empty("No figures yet.")) : null, h("div", { class: "row" }, h("button", { class: "danger", type: "button", onClick: async () => { if (!confirm("Move this post to the Trash?"))
            return; if (await persist(() => app.store.trash(x.id).then(() => true), "Post moved to Trash"))
            go(`#/social/${p.id}`); } }, "Delete post")));
}
