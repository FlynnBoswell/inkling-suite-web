import { h } from "../extension/dom.js";
import { childrenOf, live, newGraphic, newNote, newPost } from "../core/suite/model.js";
import { defaultDesign } from "../core/suite/design.js";
import { reachCheck } from "../core/suite/ripple.js";
import { app, go, persist, section, setStatus } from "./ui.js";
import { ai, aiBox, runAi } from "./ai.js";
import { defaultBrand } from "./brand.js";
const TREND_KEY = "inkling-suite.trend";
const chosenTrend = () => { try {
    return sessionStorage.getItem(TREND_KEY) ?? "";
}
catch {
    return "";
} };
async function copy(text) {
    try {
        await navigator.clipboard.writeText(text);
        setStatus("Copied");
    }
    catch {
        setStatus("Copy blocked by the browser: select the text and press Ctrl+C.", "err");
    }
}
const copyBtn = (text) => h("button", { type: "button", class: "small", onClick: () => void copy(text) }, "Copy");
const withheldNote = (m) => (m.withheld ? h("span", { class: "status err" }, ` Not usable: ${m.problem}.`) : m.caution ? h("span", { class: "status caution" }, ` Check: ${m.caution.replace(/\.$/, "")}.`) : null);
const myVoice = () => app.store.records().filter((r) => r.kind === "post" && live(r) && r.status === "posted" && r.text.trim().length > 30).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6).map((r) => r.text.slice(0, 600));
export function studioSection(p) {
    const kids = childrenOf([...app.store.records()], p.id);
    const drafts = kids.filter((r) => r.kind === "draft" && live(r));
    const quotes = kids.filter((r) => r.kind === "quote" && live(r) && !r.supersededBy && !r.uncertain);
    const pick = h("select", { "aria-label": "Article for the content studio" }, h("option", { value: "" }, drafts.length ? "Choose an article…" : "No drafts in this project (write one in Inkling)"), ...drafts.map((d) => h("option", { value: d.id }, d.title)));
    if (drafts.length === 1)
        pick.value = drafts[0].id;
    const trend = h("input", { type: "text", value: chosenTrend(), placeholder: "Optional: a trending topic to tie in (see Trending now on Ripple's page)", "aria-label": "Trending topic to tie in" });
    const out = h("div");
    const run = (kind, label, render) => {
        const b = h("button", { type: "button" }, label);
        b.addEventListener("click", () => {
            const d = drafts.find((x) => x.id === pick.value);
            if (!d) {
                out.replaceChildren(h("p", { class: "status err" }, "Choose an article first."));
                return;
            }
            void runAi(b, out, () => ai("/v1/ripple/studio", { kind, headline: d.title, body: [d.standfirst, d.body].filter(Boolean).join("\n\n"), quotes: quotes.map((q) => `${q.title} (${q.speaker})`), examples: myVoice(), trend: trend.value.trim() }, 300_000), (r) => render(r, d));
        });
        return b;
    };
    const link = (d) => d.publishedUrl || "[link]";
    const savePost = async (platform, text, title, format, d) => {
        const x = newPost(p.id, platform, text, { title: title.slice(0, 60), format, draftId: d.id });
        if (await persist(() => app.store.save(x), "Saved as a draft post", { rerender: false }))
            go(`#/post/${x.id}`);
    };
    const hooks = run("hooks", "Hooks", (r, d) => aiBox("Hooks", h("ul", { class: "items" }, ...r.hooks.map((x) => h("li", null, h("span", { class: x.withheld ? "withheld" : "" }, h("strong", null, `${x.style}: `), x.text, withheldNote(x)), x.withheld ? null : h("div", { class: "row" }, copyBtn(x.text), h("button", { type: "button", class: "small", onClick: () => void savePost("bluesky", `${x.text}\n\n${link(d)}`, `Hook (${x.style}): ${d.title}`, "headline", d) }, "Start a post with it"))))), h("p", { class: "hint" }, "The first line decides whether people stop scrolling. Try the two strongest on different days and compare their figures.")));
    const carousel = run("carousel", "Instagram carousel", (r, d) => {
        const usable = r.slides.filter((s) => !s.withheld);
        return aiBox(`Carousel (${r.slides.length} slides)`, h("ol", { class: "steps" }, ...r.slides.map((s) => h("li", { class: s.withheld ? "withheld" : "" }, h("strong", null, s.heading), h("br"), s.text, withheldNote(s)))), h("h4", null, "Caption"), h("p", { class: "pre" + (r.caption.withheld ? " withheld" : "") }, r.caption.text), withheldNote(r.caption), h("div", { class: "row" }, usable.length ? h("button", { type: "button", class: "small primary", onClick: async () => {
                // One Pixel graphic per slide, in the default brand kit, ready to adjust and export.
                const kit = defaultBrand();
                const n = usable.length;
                const made = usable.map((s, i) => {
                    const g = newGraphic(p.id, `Carousel ${i + 1}/${n}: ${s.heading}`.slice(0, 120), "social", "ig-portrait");
                    const design = { ...defaultDesign("headline", { text: g.textColour, bg: g.backgroundColour }), kicker: `${i + 1}/${n}`, main: s.heading, sub: s.text };
                    if (kit)
                        Object.assign(design, { brandId: kit.id, bg: kit.bg, accent: kit.accent, text: kit.text, font: kit.font });
                    return { ...g, design, headline: s.heading, textColour: design.text, backgroundColour: design.bg, brief: `Carousel slide ${i + 1} of ${n} for “${d.title}”.` };
                });
                if (await persist(() => app.store.save(...made), `${n} slides created in Pixel`, { rerender: false }))
                    go(`#/graphics/${p.id}`);
            } }, "Make the slides in Pixel") : null, r.caption.withheld ? null : h("button", { type: "button", class: "small", onClick: () => void savePost("instagram", r.caption.text, `Carousel caption: ${d.title}`, "graphic", d) }, "Save the caption as a post"), r.caption.withheld ? null : copyBtn(r.caption.text)));
    });
    const video = run("video", "Short-video script", (r, d) => {
        const script = [`HOOK (0–2s): ${r.hook.text}`, ...r.beats.filter((b) => !b.withheld).map((b, i) => `${i + 1}. SAY: ${b.say}\n   ON SCREEN: ${b.onScreen}\n   SHOT: ${b.shot}`), `CAPTION: ${r.caption.text} ${r.hashtags.join(" ")}`].join("\n\n");
        return aiBox("Short-video script (TikTok, Reels, Shorts)", h("p", null, h("strong", null, "Hook (first 2 seconds): "), r.hook.text, withheldNote(r.hook)), h("table", null, h("thead", null, h("tr", null, h("th", null, "Say"), h("th", null, "On screen"), h("th", null, "Shot"))), h("tbody", null, ...r.beats.map((b) => h("tr", { class: b.withheld ? "withheld" : "" }, h("td", null, b.say, withheldNote(b)), h("td", null, b.onScreen), h("td", null, b.shot))))), h("p", null, h("strong", null, "Caption: "), r.caption.text, " ", r.hashtags.join(" ")), h("div", { class: "row" }, copyBtn(script), h("button", { type: "button", class: "small", onClick: async () => {
                const note = newNote(p.id, `Video script: ${d.title}`.slice(0, 200), script);
                if (await persist(() => app.store.save(note), "Script saved as a note", { rerender: false }))
                    go(`#/note/${note.id}`);
            } }, "Save the script as a note")), h("p", { class: "hint" }, "Film only what you have the right to use: yourself, your own footage and photos, or graphics from Pixel."));
    });
    const engage = run("engage", "Get fans talking", (r, d) => aiBox("Polls and debate", r.polls.length ? h("div", null, h("h4", null, "Polls"), h("ul", { class: "items" }, ...r.polls.map((x) => {
        const text = `${x.question}\n\n${x.options.map((o) => `• ${o}`).join("\n")}`;
        return h("li", null, h("span", { class: x.withheld ? "withheld" : "pre" }, text, withheldNote(x)), x.withheld ? null : h("div", { class: "row" }, copyBtn(text), h("button", { type: "button", class: "small", onClick: () => void savePost("x", text, `Poll: ${d.title}`, "other", d) }, "Save as a post")));
    }))) : null, ...[["Debate questions", r.debate], ["Replies to post under your link", r.replyPrompts]].map(([title, list]) => list.length ? h("div", null, h("h4", null, title), h("ul", { class: "items" }, ...list.map((x) => h("li", null, h("span", { class: x.withheld ? "withheld" : "" }, x.text, withheldNote(x)), x.withheld ? null : copyBtn(x.text))))) : null), h("p", { class: "hint" }, "Replies are what spread a post: ask questions fans can't resist answering, and answer the first replies yourself.")));
    const angles = run("angles", "New angles", (r, d) => aiBox("Angles that reach new people", h("ul", { class: "items" }, ...r.angles.map((x) => h("li", null, h("span", { class: x.withheld ? "withheld" : "" }, h("strong", null, x.angle), h("span", { class: "meta followup" }, `${x.why} · Best as: ${x.format}`), withheldNote(x))))), h("div", { class: "row" }, h("button", { type: "button", class: "small", onClick: async () => {
            const note = newNote(p.id, `Angles: ${d.title}`.slice(0, 200), r.angles.filter((x) => !x.withheld).map((x) => `- ${x.angle} (${x.format}): ${x.why}`).join("\n"));
            if (await persist(() => app.store.save(note), "Angles saved as a note", { rerender: false }))
                go(`#/note/${note.id}`);
        } }, "Save as a note"))));
    return section("Content studio", h("p", { class: "hint" }, "Turn one article into the formats that travel. Everything is written from your article and saved quotes, in your own voice once you have published posts, and checked: anything with a name, number or quote not in your material is held back. Needs Start Inkling."), pick, trend, h("div", { class: "row" }, hooks, carousel, video, engage, angles), out);
}
/** On Ripple's page: what the UK is searching for now, football first, with "use this" to tie a story to it. */
export function trendingSection() {
    const out = h("div");
    const btn = h("button", { type: "button" }, "What's trending now");
    btn.addEventListener("click", () => void runAi(btn, out, () => ai("/v1/ripple/trends", {}, 60_000), (r) => {
        const list = [...r.trending].sort((a, b) => Number(b.football) - Number(a.football));
        return h("ul", { class: "items news" }, ...list.map((t) => h("li", null, h("div", null, h("strong", null, t.title), h("span", { class: "meta" }, ` · ${t.traffic} searches`), t.football ? h("span", { class: "tier tier-media" }, "Football") : null, ...t.news.slice(0, 2).map((n) => h("p", { class: "meta" }, h("a", { href: n.url, target: "_blank", rel: "noopener noreferrer" }, n.title), ` (${n.source})`)), h("button", { type: "button", class: "small", onClick: () => { try {
                sessionStorage.setItem(TREND_KEY, t.title);
            }
            catch { /* private window */ } setStatus(`“${t.title}” will be offered in the content studio`); } }, "Tie a story to this")))));
    }));
    return section("Trending now", h("p", { class: "hint" }, "What people in the UK are searching for (Google Trends, free), football first. Linking your story to a moment people already care about is one of the surest ways to reach new readers, but only where the link is real. Needs Start Inkling."), btn, out);
}
/** On a post's page: what will help it travel, as a checklist with points. */
export function reachSection(post, hasPicture, current) {
    const box = h("div");
    const draw = () => {
        const r = reachCheck(current(), hasPicture());
        box.replaceChildren(h("div", { class: "reach" }, h("div", { class: "reach-score", "data-band": r.score >= 75 ? "high" : r.score >= 50 ? "mid" : "low" }, h("strong", null, String(r.score)), h("span", null, "/100")), h("ul", { class: "checks" }, ...r.checks.map((c) => h("li", { class: c.ok ? "ok" : "caution" }, `${c.ok ? "✓" : "○"} ${c.item}`, c.ok ? null : h("span", { class: "meta followup" }, c.tip))))));
    };
    draw();
    return h("div", null, box, h("p", { class: "hint" }, "A checklist of what tends to help football posts travel. It is not a prediction: nothing can promise a post goes viral, and true and specific beats loud."), h("button", { type: "button", class: "small", onClick: draw }, "Check again"));
}
