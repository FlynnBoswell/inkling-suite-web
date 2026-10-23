import { h } from "../extension/dom.js";
import { childrenOf, DESIGN_FONTS, DESIGN_STYLES, IMAGE_DATA_URL, live, MAX_IMAGE_CHARS, TEMPLATES } from "../core/suite/model.js";
import { altText, STYLE_LABEL, fixtureLines, tidyTableRow, defaultDesign, DISPLAY_FONTS, layout, TEMPLATE_FOR, TEMPLATE_LABEL } from "../core/suite/design.js";
import { PLATFORM_PRESETS, presetById } from "../core/suite/pixel.js";
import { brands, defaultBrand } from "./brand.js";
import { app, field, go, link, persist, setStatus, plural } from "./ui.js";
import { sportsdb } from "./sleuth.js";
import { ai, aiBox, AiFailure, runAi } from "./ai.js";
import { graphicTextChecks } from "../core/suite/graphictext.js";
import { dict, loadDictionary } from "./dictionary.js";
import { brandMark, loadFonts, render, imageFor, toBase64, readPhoto } from "./render.js";
import { exportPsd } from "./psd.js";
/**
 * Pixel's graphic maker: builds the graphic in the browser at the platform's exact size, from templates and the
 * project's own material (saved quotes, fixtures, drafts). Fonts are bundled (open licence); photos stay on this device.
 */
// ---------------------------------------------------------------- football data
const KICKER_DEFAULT = (t) => defaultDesign(t, { text: "#ffffff", bg: "#000000" }).kicker;
export function kickoff(ev) {
    const ts = typeof ev.strTimestamp === "string" && ev.strTimestamp ? new Date(ev.strTimestamp.endsWith("Z") || /[+-]\d\d:?\d\d$/.test(ev.strTimestamp) ? ev.strTimestamp : ev.strTimestamp + "Z") : null;
    if (ts && !isNaN(ts.getTime())) {
        const day = ts.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
        const hr = ts.getHours(), mi = ts.getMinutes();
        const time = `${hr % 12 || 12}${mi ? ":" + String(mi).padStart(2, "0") : ""}${hr < 12 ? "am" : "pm"}`;
        return /^00:00/.test(ev.strTime ?? "") ? day : `${day}, ${time}`;
    }
    return ev.dateEvent ? new Date(ev.dateEvent + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : "";
}
// ---------------------------------------------------------------- the editor
export function makerPage(g0) {
    const p = app.store.get(g0.projectId);
    if (!p)
        return h("p", null, "This graphic's project is missing.");
    const fresh = () => app.store.get(g0.id);
    const kids = childrenOf([...app.store.records()], p.id);
    const quotes = kids.filter((r) => r.kind === "quote" && live(r) && !r.supersededBy);
    const drafts = kids.filter((r) => r.kind === "draft" && live(r));
    let presetId = presetById(g0.preset) ? g0.preset : "ig-portrait";
    let quoteId = g0.quoteId;
    let rights = g0.rightsConfirmed;
    const d = g0.design ? { ...g0.design } : (() => {
        const x = defaultDesign(TEMPLATE_FOR[g0.purpose], { text: g0.textColour, bg: g0.backgroundColour });
        const q = quotes.find((q) => q.id === g0.quoteId);
        if (q && x.template === "quote") {
            x.main = q.title;
            x.sub = q.speaker;
        }
        else
            x.main = (x.template === "quote" ? g0.headline.replace(/[“”]/g, "") : g0.headline).trim();
        const b = defaultBrand();
        if (b)
            Object.assign(x, { brandId: b.id, bg: b.bg, accent: b.accent, text: b.text, font: x.template === "quote" ? x.font : b.font });
        return x;
    })();
    const brandOf = () => (d.brandId ? app.store.get(d.brandId) : undefined) ?? null;
    // ---- saving
    let timer;
    const save = () => {
        window.clearTimeout(timer);
        timer = undefined;
        const cur = fresh();
        if (!cur || !live(cur))
            return;
        const next = { ...cur, design: { ...d }, altText: d.altText, preset: presetId, headline: d.main, quoteId, textColour: d.text, backgroundColour: d.bg, rightsConfirmed: rights, status: cur.status === "planning" ? "in-progress" : cur.status };
        void persist(() => app.store.save(next), "Graphic saved", { rerender: false });
    };
    const later = () => { setStatus("Unsaved changes…", "busy"); window.clearTimeout(timer); timer = window.setTimeout(save, 700); };
    app.flush = () => { if (timer !== undefined)
        save(); };
    // ---- preview
    const canvas = h("canvas", { class: "maker-canvas", role: "img", "aria-label": "Graphic preview" });
    const safe = h("div", { class: "safe-zone", "aria-hidden": "true" });
    const frame = h("div", { class: "frame maker-frame" }, canvas, safe);
    // Drag the photo to move it; scroll (or pinch) over it to zoom. The sliders do the same from the keyboard.
    let drag = null;
    const photoBox = () => layout(d, presetId, () => 0, brandMark(brandOf())).ops.find((o) => o.t === "photo");
    const syncSliders = () => { for (const k of ["focusX", "focusY", "zoom"]) {
        const el = sliders[k];
        if (el)
            el.value = String(d[k]);
    } };
    canvas.addEventListener("pointerdown", (e) => { if (!d.photo)
        return; e.preventDefault(); canvas.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY, fx: d.focusX, fy: d.focusY }; canvas.classList.add("dragging"); });
    canvas.addEventListener("pointermove", (e) => {
        const box = drag && photoBox();
        if (!drag || !box || !d.photoWidth)
            return;
        const k = canvas.width / canvas.getBoundingClientRect().width; // screen px → canvas px
        const sc = Math.max(box.w / d.photoWidth, box.h / d.photoHeight) * d.zoom;
        const overX = d.photoWidth * sc - box.w, overY = d.photoHeight * sc - box.h;
        if (overX > 1)
            d.focusX = Math.min(1, Math.max(0, drag.fx - (e.clientX - drag.x) * k / overX));
        if (overY > 1)
            d.focusY = Math.min(1, Math.max(0, drag.fy - (e.clientY - drag.y) * k / overY));
        syncSliders();
        void redraw();
    });
    const endDrag = () => { if (!drag)
        return; drag = null; canvas.classList.remove("dragging"); later(); };
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);
    canvas.addEventListener("wheel", (e) => { if (!d.photo)
        return; e.preventDefault(); d.zoom = Math.min(3, Math.max(1, d.zoom * (e.deltaY < 0 ? 1.06 : 1 / 1.06))); syncSliders(); changed(); }, { passive: false });
    const issuesBox = h("div", { "aria-live": "polite" });
    const sizeNote = h("p", { class: "hint" });
    let drawing = 0;
    /** Show the full-size canvas scaled to fit (so the safe-area guide lines up with it exactly). */
    const fitCanvas = () => {
        const avail = frame.parentElement?.clientWidth || 600;
        const maxW = frame.classList.contains("phone") ? Math.min(360, avail) : avail;
        const sc = Math.min(1, maxW / canvas.width, (window.innerHeight * 0.7) / canvas.height);
        canvas.style.width = `${Math.floor(canvas.width * sc)}px`;
        canvas.style.height = `${Math.floor(canvas.height * sc)}px`;
    };
    window.addEventListener("resize", function onResize() { if (!canvas.isConnected) {
        window.removeEventListener("resize", onResize);
        return;
    } fitCanvas(); });
    const redraw = async () => {
        const mine = ++drawing;
        await loadFonts();
        const issues = await render(canvas, d, presetId, brandOf());
        if (mine !== drawing)
            return;
        fitCanvas();
        if (d.photo && !rights)
            issues.unshift({ level: "fix", text: "Confirm you have the right to use this photo (tick the box under Photo)." });
        if (d.template === "quote" && quoteId) {
            const q = quotes.find((x) => x.id === quoteId);
            if (!q)
                issues.unshift({ level: "fix", text: "The linked quote is missing or was corrected. Choose the current version." });
            else if (d.main.replace(/\s+/g, " ").trim() !== q.title.replace(/\s+/g, " ").trim())
                issues.unshift({ level: "fix", text: "The words differ from the saved quote. Use the exact wording (choose the quote again to restore it)." });
        }
        else if (d.template === "quote" && d.main.trim())
            issues.unshift({ level: "consider", text: "Choose the saved quote this card uses, so its wording is checked." });
        const L = layout(d, presetId, () => 0, brandMark(brandOf())).safe;
        const pr = presetById(presetId);
        safe.style.inset = `${L.y / pr.height * 100}% ${(pr.width - L.x - L.w) / pr.width * 100}% ${(pr.height - L.y - L.h) / pr.height * 100}% ${L.x / pr.width * 100}%`;
        sizeNote.textContent = `${pr.label}: ${pr.width}×${pr.height} px. The dashed box is the safe area: text stays inside it.`;
        // Spelling, grammar and names in the words actually drawn.
        const fields = textFields();
        const textIssues = graphicTextChecks(fields, { names: projectNames(), lexicon: dict.lexicon, common: dict.common })
            .map((t) => ({ ...t, key: fields.find((x) => x.label === t.field)?.key }));
        const all = [...issues, ...textIssues];
        const order = { fix: 0, consider: 1 };
        issuesBox.replaceChildren(all.length ? h("ol", { class: "design-notes" }, ...all.sort((a, b) => order[a.level] - order[b.level]).map((i) => h("li", { class: i.level }, h("strong", null, i.level === "fix" ? "Fix: " : "Consider: "), i.text, i.key && i.to !== undefined && i.start !== undefined ? h("button", { type: "button", class: "small", onClick: () => {
                const k = i.key;
                const v = String(d[k]);
                if (v.slice(i.start, i.end) !== i.from)
                    return; // text changed since the check
                d[k] = v.slice(0, i.start) + i.to + v.slice(i.end);
                const el = inputs[k];
                if (el)
                    el.value = String(d[k]);
                changed();
            } }, `Change to “${i.to}”`) : null)))
            : h("p", { class: "status ok" }, "No problems found. Check names, dates and scores against an official source before you publish."));
    };
    // Undo/redo: snapshots of the design, taken when editing pauses.
    const snap = () => JSON.stringify({ d, presetId });
    // The state before a burst of edits is kept, so Undo always returns to exactly what was there before.
    let stable = snap();
    let editing = false;
    const undoStack = [];
    const redoStack = [];
    let snapTimer;
    const remember = () => { if (!editing) {
        undoStack.push(stable);
        if (undoStack.length > 60)
            undoStack.shift();
        redoStack.length = 0;
        editing = true;
    } window.clearTimeout(snapTimer); snapTimer = window.setTimeout(() => { stable = snap(); editing = false; refreshUndo(); }, 450); };
    const restore = (s2) => {
        const v = JSON.parse(s2);
        Object.assign(d, v.d);
        presetId = v.presetId;
        for (const [k, el] of Object.entries(inputs))
            if (el)
                el.value = String(d[k]);
        template.value = d.template;
        preset.value = presetId;
        font.value = d.font;
        styleSel.value = d.style;
        for (const k of ["bg", "accent", "text"])
            if (colourInputs[k])
                colourInputs[k].value = d[k];
        alt.value = d.altText;
        labels(d.template);
        drawPhotoTools();
        void redraw();
        later();
        refreshUndo();
    };
    const settle = () => { window.clearTimeout(snapTimer); if (editing) {
        stable = snap();
        editing = false;
    } };
    const undo = () => { settle(); const prev = undoStack.pop(); if (!prev)
        return; redoStack.push(snap()); stable = prev; restore(prev); };
    const redo = () => { settle(); const next = redoStack.pop(); if (!next)
        return; undoStack.push(snap()); stable = next; restore(next); };
    const undoBtn = h("button", { type: "button", class: "small", onClick: undo }, "Undo");
    const redoBtn = h("button", { type: "button", class: "small", onClick: redo }, "Redo");
    const refreshUndo = () => { undoBtn.disabled = !undoStack.length; redoBtn.disabled = !redoStack.length; };
    document.addEventListener("keydown", function onKey(e) {
        if (!canvas.isConnected) {
            document.removeEventListener("keydown", onKey);
            return;
        }
        const typing = e.target?.matches?.("input[type=text], textarea");
        if (typing || !(e.ctrlKey || e.metaKey))
            return;
        if (e.key.toLowerCase() === "z" && !e.shiftKey) {
            e.preventDefault();
            undo();
        }
        else if (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey)) {
            e.preventDefault();
            redo();
        }
    });
    const changed = () => { void redraw(); later(); remember(); refreshUndo(); };
    void loadDictionary().then(() => redraw());
    /** The text fields the current template draws, with their labels. */
    const textFields = () => {
        const t = d.template;
        const L = (key, label, quote = false) => ({ key, label, text: String(d[key]), quote });
        if (t === "bigmatch")
            return [L("kicker", "Date"), L("main", "Big words"), L("sub", "Opponent"), L("when", "Kick-off"), L("lines", "Tickets"), L("extra", "Ticket note"), L("credit", "Credit")];
        return [...(t === "quote" ? [] : [L("kicker", "Label")]), ...(t === "matchday" || t === "result" ? [L("home", "Home team"), L("away", "Away team"), L("competition", "Competition"), ...(t === "matchday" ? [L("when", "Date"), L("venue", "Venue")] : [L("sub", "Scorers")])]
                : [L("main", t === "quote" ? "Quote" : t === "announcement" || t === "award" || t === "stats" ? "Name" : t === "lineup" ? "Team" : t === "table" ? "Title" : "Headline", t === "quote"), L("sub", t === "quote" ? "Speaker" : t === "announcement" ? "Detail" : "Standfirst")]),
            ...(["lineup", "table", "stats", "award"].includes(t) ? [L("lines", t === "lineup" ? "Players" : t === "table" ? "Table" : "Stats")] : []), ...(t === "lineup" ? [L("extra", "Substitutes")] : []), L("credit", "Credit")];
    };
    /** Names this project knows: people, clubs and the speakers of its saved quotes. */
    const projectNames = () => [...p.people, ...p.clubs, ...quotes.map((q) => q.speaker)].filter(Boolean);
    // ---- controls
    const inputs = {};
    const input = (key, label, attrs = {}, hint) => {
        const el = (attrs.rows ? h("textarea", { rows: attrs.rows, value: String(d[key]) }) : h("input", { type: "text", value: String(d[key]), ...attrs }));
        inputs[key] = el;
        el.addEventListener("input", () => { d[key] = el.value; changed(); });
        return { el, node: field(label, el, hint) };
    };
    const kicker = input("kicker", "Label at the top", { maxLength: 60 }, "Short: Matchday, Full time, Confirmed, Exclusive. Leave empty for none.");
    const main = input("main", "Quote", { rows: 4 });
    const sub = input("sub", "Speaker", { maxLength: 600 });
    const credit = input("credit", "Credit", { maxLength: 200, placeholder: "e.g. Photo: Jane Smith / Agency" });
    const rowsIn = input("lines", "Rows", { rows: 8 });
    const extra = input("extra", "Substitutes (optional)", { maxLength: 600 });
    const highlight = input("highlight", "Team to highlight", { maxLength: 80 });
    if (!d.highlight && p.clubs[0])
        d.highlight = p.clubs[0];
    // A table copied from a website (BBC, the league's site...) usually has more columns: keep position, team, played, goal difference, points.
    const tidyBtn = h("button", { type: "button", class: "small", onClick: () => {
            const out = rowsIn.el.value.split(/\n/).map((l) => tidyTableRow(l)).filter((x) => !!x);
            if (!out.length) {
                setStatus("Could not find table rows. Paste the rows with the team name and numbers.", "err");
                return;
            }
            d.lines = out.join("\n");
            rowsIn.el.value = d.lines;
            changed();
            setStatus(`Tidied ${plural(out.length, "row", "rows")}. Check them against the league's official table.`);
        } }, "Tidy a pasted table");
    const home = input("home", "Home team", { maxLength: 80 });
    const away = input("away", "Away team", { maxLength: 80 });
    const hs = input("homeScore", "Home score", { maxLength: 3, inputMode: "numeric" });
    const as = input("awayScore", "Away score", { maxLength: 3, inputMode: "numeric" });
    const when = input("when", "Date and kick-off", { maxLength: 120, placeholder: "e.g. Sat 14 Mar, 3pm" });
    const venue = input("venue", "Venue", { maxLength: 120 });
    const comp = input("competition", "Competition", { maxLength: 120 });
    const people = h("datalist", { id: "maker-people" }, ...p.people.map((x) => h("option", { value: x })));
    const template = h("select", { "aria-label": "Template" }, ...TEMPLATES.map((t) => h("option", { value: t, selected: d.template === t }, TEMPLATE_LABEL[t])));
    const preset = h("select", { "aria-label": "Size" }, ...PLATFORM_PRESETS.map((x) => h("option", { value: x.id, selected: presetId === x.id }, `${x.label}: ${x.width}×${x.height}`)));
    preset.addEventListener("change", () => { presetId = preset.value; changed(); });
    // Fill from the project
    const fillBox = h("div");
    const quotePick = h("select", null, h("option", { value: "" }, quotes.length ? "Choose a saved quote…" : "No saved quotes in this project (add them in Quill)"), ...quotes.map((q) => h("option", { value: q.id, selected: q.id === quoteId }, `${q.speaker}: “${q.title.slice(0, 70)}${q.title.length > 70 ? "…" : ""}”${q.uncertain ? " (wording uncertain)" : ""}`)));
    quotePick.addEventListener("change", () => {
        quoteId = quotePick.value;
        const q = quotes.find((x) => x.id === quoteId);
        if (q) {
            d.main = q.title;
            d.sub = q.speaker;
            main.el.value = d.main;
            sub.el.value = d.sub;
            if (q.uncertain)
                setStatus("This quote is marked as uncertain wording. Check it before you publish.", "err");
        }
        changed();
    });
    const draftPick = h("select", { "aria-label": "Draft for the headline" }, h("option", { value: "" }, drafts.length ? "Use a draft's headline…" : "No drafts in this project"), ...drafts.map((x) => h("option", { value: x.id }, x.title || "Untitled draft")));
    draftPick.addEventListener("change", () => { const x = drafts.find((y) => y.id === draftPick.value); if (x) {
        d.main = x.title;
        d.sub = x.standfirst;
        main.el.value = d.main;
        sub.el.value = d.sub;
        changed();
    } });
    const hlOut = h("div");
    const hlBtn = h("button", { type: "button", class: "small" }, "Suggest short headlines (AI)");
    hlBtn.addEventListener("click", () => {
        // The chosen draft; otherwise the one this graphic's quote or headline comes from; otherwise the latest.
        const q = quotes.find((x) => x.id === quoteId);
        const dr = drafts.find((x) => x.id === draftPick.value) ?? drafts.find((x) => (q && x.quoteIds.includes(q.id)) || (d.main && x.title === d.main)) ?? drafts[0];
        if (!dr || !dr.body.trim()) {
            hlOut.replaceChildren(h("p", { class: "status err" }, "Write the article in Inkling first: headlines are suggested from its text."));
            return;
        }
        void runAi(hlBtn, hlOut, () => ai("/v1/pixel/headlines", { article: dr.body, headline: dr.title }), (r) => aiBox(`Short headlines from “${dr.title || "your draft"}”`, h("ul", { class: "items" }, ...r.options.map((o) => h("li", null, h("span", { class: o.withheld ? "withheld" : "" }, o.text), o.withheld ? h("span", { class: "status err" }, `Not offered: ${o.problem}`)
            : h("button", { type: "button", class: "small", onClick: () => { d.main = o.text; main.el.value = d.main; changed(); } }, "Use")))), h("p", { class: "hint" }, "Options that add a name or number not in the article are withheld.")));
    });
    const headlineAi = h("div", null, hlBtn, hlOut);
    const club = h("input", { type: "text", value: p.clubs[0] ?? "", placeholder: "Club, e.g. Aldershot Town", "aria-label": "Club for fixtures" });
    const findBtn = h("button", { type: "button" }, "Find matches");
    const found = h("div");
    findBtn.addEventListener("click", async () => {
        if (!club.value.trim()) {
            club.focus();
            return;
        }
        findBtn.disabled = true;
        found.replaceChildren(h("p", { class: "hint", role: "status" }, "Looking up…"));
        try {
            const team = ((await sportsdb(`searchteams.php?t=${encodeURIComponent(club.value.trim())}`)).teams ?? []).find((t) => t.strSport === "Soccer");
            if (!team) {
                found.replaceChildren(h("p", null, "No club found with that name. Try the full name."));
                return;
            }
            const res = d.template === "result" ? (await sportsdb(`eventslast.php?id=${team.idTeam}`)).results ?? [] : (await sportsdb(`eventsnext.php?id=${team.idTeam}`)).events ?? [];
            if (!res.length) {
                found.replaceChildren(h("p", null, `No ${d.template === "result" ? "recent results" : "upcoming fixtures"} listed for ${team.strTeam}.`));
                return;
            }
            found.replaceChildren(h("ul", { class: "items" }, ...res.slice(0, 5).map((ev) => h("li", null, h("span", null, `${kickoff(ev)}: ${ev.strHomeTeam} ${d.template === "result" && ev.intHomeScore != null ? `${ev.intHomeScore}-${ev.intAwayScore}` : "v"} ${ev.strAwayTeam}`), h("button", { type: "button", class: "small", onClick: () => {
                    Object.assign(d, { home: ev.strHomeTeam ?? "", away: ev.strAwayTeam ?? "", when: kickoff(ev), venue: ev.strVenue ?? "", competition: ev.strLeague ?? "" });
                    if (d.template === "result")
                        Object.assign(d, { homeScore: ev.intHomeScore == null ? "" : String(ev.intHomeScore), awayScore: ev.intAwayScore == null ? "" : String(ev.intAwayScore) });
                    if (d.template === "bigmatch") {
                        const f = fixtureLines(ev, club.value || p.clubs[0] || "");
                        Object.assign(d, { kicker: f.date, sub: f.opponent, when: f.kickoff || d.when });
                        kicker.el.value = d.kicker;
                        sub.el.value = d.sub;
                    }
                    for (const [k, x] of [["home", home], ["away", away], ["when", when], ["venue", venue], ["competition", comp], ["homeScore", hs], ["awayScore", as]])
                        x.el.value = d[k];
                    found.replaceChildren(h("p", { class: "status warn" }, `Filled from TheSportsDB: ${d.home} v ${d.away}. Check every detail against the club or league before you publish.`));
                    changed();
                } }, "Use")))), h("p", { class: "hint" }, "From TheSportsDB, a free community-maintained database. Check against an official source."));
        }
        catch (e) {
            found.replaceChildren(h("p", { class: "status err" }, e.message));
        }
        finally {
            findBtn.disabled = false;
        }
    });
    const show = (node, on) => { node.hidden = !on; };
    const labels = (t) => {
        const lab = (x, text) => { x.node.querySelector("label").textContent = text; };
        lab(main, t === "quote" ? "Quote" : t === "announcement" || t === "award" || t === "stats" ? "Player name" : t === "lineup" ? "Team" : t === "table" ? "Title (e.g. National League)" : "Headline");
        lab(sub, t === "quote" ? "Speaker" : t === "result" ? "Scorers" : t === "announcement" ? "Detail line" : t === "lineup" ? "Formation (optional)" : t === "award" ? "Detail (e.g. October 2026)" : t === "stats" || t === "table" ? "Detail (e.g. 2026/27 season, after 13 games)" : "Standfirst (optional)");
        lab(rowsIn, t === "lineup" ? "Players, one per line (number first, e.g. “1 Smith”)" : t === "table" ? "Rows, one per line: position | team | played | goal difference | points" : t === "stats" ? "Stats, one per line: label | number (e.g. Goals | 19)" : "Stats line (optional), one per line: label | number");
        show(rowsIn.node, ["lineup", "table", "stats", "award"].includes(t));
        show(extra.node, t === "lineup");
        show(highlight.node, t === "table");
        show(tidyBtn, t === "table");
        show(main.node, t !== "matchday" && t !== "result");
        show(sub.node, t !== "matchday");
        for (const x of [home, away, when, venue, comp])
            show(x.node, t === "matchday" || t === "result");
        show(when.node, t === "matchday");
        show(venue.node, t === "matchday");
        show(hs.node, t === "result");
        show(as.node, t === "result");
        if (t === "announcement" || t === "award" || t === "stats")
            main.el.setAttribute("list", "maker-people");
        else
            main.el.removeAttribute("list");
        lab(kicker, t === "bigmatch" ? "Date line (top), e.g. Saturday 10th October 2026" : "Label at the top");
        if (t === "bigmatch") {
            lab(main, "Big words, one per line");
            lab(sub, "Opponent, with (H) or (A)");
            lab(when, "Kick-off line, e.g. Kick off 15:00");
            lab(rowsIn, "Ticket prices (optional), one per line: label | price");
            lab(extra, "Ticket note (optional), e.g. On general sale now!");
            for (const x of [main, sub, when, rowsIn, extra])
                show(x.node, true);
            for (const x of [home, away, venue, comp, hs, as, highlight])
                show(x.node, false);
        }
        else
            lab(extra, "Substitutes (optional)");
        show(bigTools, t === "bigmatch");
        fillBox.replaceChildren(t === "quote" ? field("Use a saved quote", quotePick, "Quotes come from Quill, word for word.")
            : t === "matchday" || t === "result" || t === "bigmatch" ? h("div", null, h("div", { class: "row" }, club, findBtn), found)
                : t === "headline" ? h("div", null, field("Use a draft", draftPick), headlineAi) : h("p", { class: "hint" }, p.people.length ? "Names from this project are suggested as you type." : "Add people to the project to have their names suggested."));
    };
    template.addEventListener("change", () => {
        const t = template.value;
        const was = d.template;
        if (d.kicker === KICKER_DEFAULT(was)) {
            d.kicker = KICKER_DEFAULT(t);
            kicker.el.value = d.kicker;
        }
        if ((was === "quote") !== (t === "quote") && d.font === defaultDesign(was, d).font) {
            d.font = defaultDesign(t, d).font;
            font.value = d.font;
        }
        if (t === "bigmatch" && !d.main.includes("\n")) {
            d.main = "MATCH\nDAY";
            main.el.value = d.main;
        }
        d.template = t;
        labels(t);
        changed();
    });
    // Photo
    const photoFile = h("input", { type: "file", accept: "image/png,image/jpeg,image/webp", "aria-label": "Choose a photo" });
    const photoTools = h("div");
    const sliders = {};
    const slider = (key, label, min, max, step) => {
        const el = h("input", { type: "range", min, max, step, value: d[key], "aria-label": label });
        sliders[key] = el;
        el.addEventListener("input", () => { d[key] = Number(el.value); changed(); });
        return h("label", { class: "slider" }, h("span", null, label), el);
    };
    const rightsBox = h("input", { type: "checkbox", checked: rights });
    // Player cut-out: the people model on this laptop finds the player; the photo with everything else made transparent
    // is drawn in front of the big type (ghost word, MATCH DAY letters).
    const cutOut = h("div");
    const cutBtn = h("button", { type: "button", class: "small" }, "Cut out the player");
    cutBtn.addEventListener("click", () => void runAi(cutBtn, cutOut, async () => {
        const img = await imageFor(d.photo);
        const N = 1024; // the detailed model works on 1024×1024 (about 10 seconds on the laptop)
        cutOut.replaceChildren(h("p", { class: "hint" }, "Finding the player: about 10 seconds (the first time, the model downloads: about 224 MB)…"));
        const small = document.createElement("canvas");
        small.width = small.height = N;
        const sc = small.getContext("2d", { willReadFrequently: true });
        sc.drawImage(img, 0, 0, N, N);
        const px = sc.getImageData(0, 0, N, N).data;
        const rgb = new Uint8Array(N * N * 3);
        for (let i = 0; i < N * N; i++) {
            rgb[i * 3] = px[i * 4];
            rgb[i * 3 + 1] = px[i * 4 + 1];
            rgb[i * 3 + 2] = px[i * 4 + 2];
        }
        const r = await ai("/v1/pixel/cutout", { rgb: toBase64(rgb) }, 300_000);
        if (r.coverage < 0.01)
            throw new AiFailure("No person was found in this photo, so there is nothing to cut out.");
        // Scale the mask up to the photo, soften its edge a little, and use it as the photo's transparency.
        const m = atob(r.mask);
        const mc = document.createElement("canvas");
        mc.width = mc.height = r.size;
        const mx = mc.getContext("2d");
        const mi = mx.createImageData(r.size, r.size);
        for (let i = 0; i < r.size * r.size; i++) {
            const v = m.charCodeAt(i);
            mi.data[i * 4] = mi.data[i * 4 + 1] = mi.data[i * 4 + 2] = v;
            mi.data[i * 4 + 3] = 255;
        }
        mx.putImageData(mi, 0, 0);
        const W = img.naturalWidth, H = img.naturalHeight;
        const big = document.createElement("canvas");
        big.width = W;
        big.height = H;
        const bx = big.getContext("2d", { willReadFrequently: true });
        bx.imageSmoothingQuality = "high";
        bx.drawImage(mc, 0, 0, W, H);
        const md = bx.getImageData(0, 0, W, H).data;
        bx.clearRect(0, 0, W, H);
        bx.drawImage(img, 0, 0);
        const out = bx.getImageData(0, 0, W, H);
        for (let i = 0; i < W * H; i++) {
            const a = (md[i * 4] / 255 - 0.35) / 0.3;
            out.data[i * 4 + 3] = Math.round(255 * Math.min(1, Math.max(0, a)));
        }
        bx.putImageData(out, 0, 0);
        let url = big.toDataURL("image/webp", 0.9);
        if (url.length > MAX_IMAGE_CHARS)
            url = big.toDataURL("image/webp", 0.7);
        if (url.length > MAX_IMAGE_CHARS || !IMAGE_DATA_URL.test(url))
            throw new AiFailure("The cut-out is too large to store. Use a smaller photo.");
        d.cutout = url;
        changed();
        drawPhotoTools();
        return r;
    }, (r) => h("p", { class: "status ok" }, `Player cut out (${Math.round(r.coverage * 100)}% of the photo${r.model === "U2-Net" ? ", with the quicker, rougher model because the detailed one could not be loaded" : ""}). They now stand in front of the big type. Check the edges at full size, especially hair, fingers and the ball.`)));
    rightsBox.addEventListener("change", () => { rights = rightsBox.checked; changed(); });
    const drawPhotoTools = () => {
        frame.classList.toggle("has-photo", !!d.photo);
        photoTools.replaceChildren(...(d.photo ? [
            h("div", { class: "sliders" }, h("p", { class: "hint" }, "Drag the photo on the preview to move it; scroll over it to zoom."), slider("focusX", "Left / right", 0, 1, 0.01), slider("focusY", "Up / down", 0, 1, 0.01), slider("zoom", "Zoom", 1, 3, 0.01), slider("shade", "Shade (darkens the photo)", 0, 0.8, 0.01)),
            h("label", { class: "check" }, rightsBox, h("span", null, "I have the right to use this photo")),
            h("div", { class: "row" }, cutBtn, d.cutout ? h("button", { type: "button", class: "small", onClick: () => { d.cutout = ""; drawPhotoTools(); changed(); } }, "Remove cut-out") : null),
            cutOut,
            h("button", { type: "button", class: "small", onClick: () => { d.photo = ""; d.photoWidth = 0; d.photoHeight = 0; d.cutout = ""; drawPhotoTools(); changed(); } }, "Remove photo"),
        ] : [h("p", { class: "hint" }, "No photo. Templates also work on a plain background.")]));
    };
    photoFile.addEventListener("change", async () => {
        const f = photoFile.files?.[0];
        if (!f)
            return;
        try {
            const r = await readPhoto(f);
            Object.assign(d, { photo: r.url, photoWidth: r.width, photoHeight: r.height, focusX: 0.5, focusY: 0.4, zoom: 1, cutout: "" });
            drawPhotoTools();
            changed();
        }
        catch (e) {
            setStatus(e.message, "err");
        }
        photoFile.value = "";
    });
    drawPhotoTools();
    // Big-letter matchday: artwork inside the letters, competition logo, sponsor strip.
    const imageInput = (label, onPick) => {
        const el = h("input", { type: "file", accept: "image/png,image/jpeg,image/webp", "aria-label": label });
        el.addEventListener("change", async () => { const f = el.files?.[0]; if (!f)
            return; try {
            onPick(await readPhoto(f));
            changed();
            drawBigTools();
        }
        catch (e) {
            setStatus(e.message, "err");
        } el.value = ""; });
        return el;
    };
    const num = (key, label) => { const el = h("input", { type: "number", min: 0, max: 12, value: d[key], "aria-label": label, class: "small-num" }); el.addEventListener("input", () => { d[key] = Math.max(0, Math.min(12, Math.round(Number(el.value) || 0))); changed(); }); return h("label", { class: "inline" }, label, " ", el); };
    const sponsorsBox = h("input", { type: "checkbox", checked: d.showSponsors });
    sponsorsBox.addEventListener("change", () => { d.showSponsors = sponsorsBox.checked; changed(); });
    const bigTools = h("fieldset", { class: "maker-group" });
    const drawBigTools = () => {
        const kit = brandOf();
        bigTools.replaceChildren(...[h("legend", null, "Big letters, logos and sponsors"),
            h("p", { class: "field-label" }, "Artwork inside the letters"),
            d.letterFill ? h("div", { class: "row" }, h("img", { src: d.letterFill, alt: "Letter artwork", class: "thumb" }), h("button", { type: "button", class: "small", onClick: () => { Object.assign(d, { letterFill: "", letterFillWidth: 0, letterFillHeight: 0 }); drawBigTools(); changed(); } }, "Remove")) : null,
            imageInput("Choose letter artwork", (r) => Object.assign(d, { letterFill: r.url, letterFillWidth: r.width, letterFillHeight: r.height })),
            h("div", { class: "row" }, num("fillA", "Letters filled in the first word"), num("fillB", "in the second word")),
            h("p", { class: "hint" }, "E.g. your club crest or a pattern: it shows through the first letters of each word, like MAT|CH and DA|Y. Use artwork you have the right to use."),
            h("p", { class: "field-label" }, "Competition logo (optional)"),
            d.compLogo ? h("div", { class: "row" }, h("img", { src: d.compLogo, alt: "Competition logo", class: "thumb" }), h("button", { type: "button", class: "small", onClick: () => { Object.assign(d, { compLogo: "", compLogoWidth: 0, compLogoHeight: 0 }); drawBigTools(); changed(); } }, "Remove")) : null,
            imageInput("Choose competition logo", (r) => Object.assign(d, { compLogo: r.url, compLogoWidth: r.width, compLogoHeight: r.height })),
            h("label", { class: "check" }, sponsorsBox, h("span", null, kit ? `Show ${kit.title}'s sponsor logos along the bottom (${kit.sponsors.length} in the brand kit)` : "Show sponsor logos (add them to a brand kit first)")),
            kit ? link(`#/brand/${kit.id}`, "Edit sponsor logos") : null].filter((x) => x !== null));
    };
    drawBigTools();
    // Style
    const styleSel = h("select", null, ...DESIGN_STYLES.map((x) => h("option", { value: x, selected: d.style === x }, STYLE_LABEL[x])));
    styleSel.addEventListener("change", () => { d.style = styleSel.value; changed(); });
    const font = h("select", { "aria-label": "Main font" }, ...DESIGN_FONTS.map((f) => h("option", { value: f, selected: d.font === f }, DISPLAY_FONTS[f].label)));
    font.addEventListener("change", () => { d.font = font.value; changed(); });
    const colourInputs = {};
    const colour = (key, label) => { const el = h("input", { type: "color", value: d[key] }); colourInputs[key] = el; el.addEventListener("input", () => { d[key] = el.value; changed(); }); return h("label", { class: "colour" }, el, ` ${label}`); };
    const kits = brands();
    const brandPick = h("select", null, h("option", { value: "" }, kits.length ? "No brand kit" : "No brand kits yet (create one on Pixel's page)"), ...kits.map((b) => h("option", { value: b.id, selected: d.brandId === b.id }, b.title)));
    brandPick.addEventListener("change", () => {
        d.brandId = brandPick.value;
        const b = brandOf();
        if (b) {
            Object.assign(d, { bg: b.bg, accent: b.accent, text: b.text });
            for (const k of ["bg", "accent", "text"])
                colourInputs[k].value = d[k];
            if (d.template !== "quote") {
                d.font = b.font;
                font.value = d.font;
            }
        }
        changed();
    });
    // Alt text
    const alt = h("textarea", { rows: 3, value: d.altText, "aria-label": "Alt text" });
    alt.addEventListener("input", () => { d.altText = alt.value; later(); });
    const altBtn = h("button", { type: "button", class: "small", onClick: () => { d.altText = altText(d); alt.value = d.altText; later(); } }, "Write it from the graphic");
    // AI alt text: the model looks at the finished graphic; the words Pixel placed on it are checked against its answer.
    const altAiOut = h("div");
    const altAiBtn = h("button", { type: "button", class: "small" }, "Write it with AI");
    // Only the fields the current template draws.
    const onGraphic = () => textFields().filter((f) => f.key !== "lines" && f.key !== "main" || f.key === "main" && d.template !== "bigmatch")
        .map((f) => f.text).concat(brandOf()?.handle ?? "").map((x) => x.trim()).filter(Boolean);
    altAiBtn.addEventListener("click", () => void runAi(altAiBtn, altAiOut, async () => {
        await redraw();
        let image = canvas.toDataURL("image/jpeg", 0.85);
        if (image.length > 4_500_000)
            image = canvas.toDataURL("image/jpeg", 0.6);
        return ai("/v1/pixel/alttext", { image, words: onGraphic().join("\n") });
    }, (r) => aiBox("Suggested alt text", h("p", null, r.altText), r.missingWords.length ? h("p", { class: "status warn" }, `It leaves out words that are on the graphic: “${r.missingWords.join("”, “")}”. Add them before using it.`) : h("p", { class: "status ok" }, "Includes every piece of text Pixel put on the graphic."), h("button", { type: "button", class: "small", onClick: () => { d.altText = r.altText; alt.value = d.altText; later(); } }, "Use this alt text"))));
    // Export
    const fileName = () => `${(fresh().title || "graphic").replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "").toLowerCase()}-${canvas.width}x${canvas.height}.png`;
    const exportBtn = h("button", { class: "primary", type: "button", onClick: async () => {
            await redraw();
            save();
            const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
            if (!blob) {
                setStatus("Could not create the image.", "err");
                return;
            }
            const a = h("a", { href: URL.createObjectURL(blob), download: fileName() });
            document.body.append(a);
            a.click();
            a.remove();
            setStatus(`Downloaded ${fileName()}`);
        } }, "Download PNG");
    const allBtn = h("button", { type: "button", onClick: async () => {
            save();
            const off = document.createElement("canvas");
            const files = [];
            const problems = [];
            for (const pr of PLATFORM_PRESETS) {
                const iss = (await render(off, d, pr.id, brandOf())).filter((i) => i.level === "fix");
                if (iss.length)
                    problems.push(`${pr.label}: ${iss.map((i) => i.text).join(" ")}`);
                const blob = await new Promise((r) => off.toBlob(r, "image/png"));
                if (blob)
                    files.push({ name: `${(fresh().title || "graphic").replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "").toLowerCase()}-${pr.id}-${pr.width}x${pr.height}.png`, blob });
            }
            const pick = window.showDirectoryPicker;
            try {
                if (pick) {
                    const dir = await pick({ mode: "readwrite", id: "inkling-graphics" });
                    for (const f of files) {
                        const w = await (await dir.getFileHandle(f.name, { create: true })).createWritable();
                        await w.write(f.blob);
                        await w.close();
                    }
                }
                else
                    for (const f of files) {
                        const a = h("a", { href: URL.createObjectURL(f.blob), download: f.name });
                        document.body.append(a);
                        a.click();
                        a.remove();
                        await new Promise((r) => setTimeout(r, 300));
                    }
                setStatus(`Saved ${files.length} sizes`);
            }
            catch (e) {
                if (e?.name !== "AbortError")
                    setStatus("Could not save the files.", "err");
                return;
            }
            allOut.replaceChildren(problems.length ? h("div", { class: "status warn" }, h("p", null, "Some sizes need attention:"), h("ul", null, ...problems.map((x) => h("li", null, x)))) : h("p", { class: "status ok" }, `All ${files.length} sizes saved with no problems.`));
        } }, "Download all sizes");
    const allOut = h("div", { "aria-live": "polite" });
    const psdBtn = h("button", { type: "button", onClick: async () => {
            psdBtn.disabled = true;
            setStatus("Making the Photoshop file…", "busy");
            try {
                save();
                const blob = await exportPsd(d, presetId, brandOf());
                const name = fileName().replace(/\.png$/, ".psd");
                const a = h("a", { href: URL.createObjectURL(blob), download: name });
                document.body.append(a);
                a.click();
                a.remove();
                setStatus(`Downloaded ${name}`);
                allOut.replaceChildren(h("p", { class: "hint" }, "Open it in Photoshop: every part is on its own layer (photo, player cut-out, accents, each line of text, logos). Text arrives as pixels, so retype a line with the Type tool if you need to change it."));
            }
            catch (e) {
                setStatus(e.message || "Could not make the Photoshop file.", "err");
            }
            finally {
                psdBtn.disabled = false;
            }
        } }, "Export for Photoshop (.psd)");
    const useBtn = h("button", { type: "button", onClick: async () => {
            await redraw();
            let url = canvas.toDataURL("image/jpeg", 0.92);
            if (url.length > MAX_IMAGE_CHARS)
                url = canvas.toDataURL("image/jpeg", 0.75);
            window.clearTimeout(timer);
            timer = undefined;
            const cur = fresh();
            const ok = await persist(() => app.store.save({ ...cur, design: { ...d }, altText: d.altText, preset: presetId, headline: d.main, quoteId, textColour: d.text, backgroundColour: d.bg, rightsConfirmed: rights, image: url, imageWidth: canvas.width, imageHeight: canvas.height, status: cur.status === "planning" ? "in-progress" : cur.status }), "Saved as the graphic's preview", { rerender: false });
            if (ok)
                go(`#/graphic/${g0.id}`);
        } }, "Check it in Pixel");
    const phone = h("button", { type: "button", class: "small", "aria-pressed": "false", onClick: () => { const on = frame.classList.toggle("phone"); fitCanvas(); phone.setAttribute("aria-pressed", String(on)); phone.textContent = on ? "Full size view" : "See it at phone size"; } }, "See it at phone size");
    labels(d.template);
    void redraw();
    refreshUndo();
    const panel = (title, ...k) => h("fieldset", { class: "maker-group" }, h("legend", null, title), ...k);
    return h("div", null, h("p", { class: "crumbs" }, link("#/tool/pixel", "Pixel"), " / ", link(`#/graphics/${p.id}`, p.title), " / ", link(`#/graphic/${g0.id}`, g0.title)), h("div", { class: "page-head" }, h("h1", null, `Make: ${g0.title}`)), h("div", { class: "maker" }, h("div", { class: "maker-preview" }, frame, sizeNote, h("div", { class: "row" }, exportBtn, allBtn, psdBtn, useBtn), h("div", { class: "row" }, phone, undoBtn, redoBtn), allOut, h("h2", null, "What needs attention"), issuesBox), h("div", { class: "maker-controls" }, panel("Template and size", h("div", { class: "grid tight" }, field("Template", template), field("Size", preset))), panel("Fill from this project", fillBox), panel("Words", kicker.node, main.node, sub.node, h("div", { class: "grid tight" }, home.node, away.node, hs.node, as.node), when.node, venue.node, comp.node, rowsIn.node, tidyBtn, extra.node, highlight.node, credit.node, people), panel("Photo", photoFile, photoTools), bigTools, panel("Style", field("Finish", styleSel, "Bold and Poster grade the photo and add accents, shadows and grain."), field("Brand kit", brandPick, "Applies its colours and font, and adds its logo and handle."), field("Main font", font), h("div", { class: "row" }, colour("bg", "Background"), colour("accent", "Accent"), colour("text", "Text"))), panel("Alt text (for the post)", alt, h("div", { class: "row" }, altBtn, altAiBtn), altAiOut, h("p", { class: "hint" }, "Describes the graphic for people using screen readers. Check it says what the graphic says.")))));
}
