import { contrastRatio, presetById } from "./pixel.js";
/**
 * Pixel's graphic maker: turns a Design into a list of drawing steps for a canvas of the platform's exact size.
 * Pure and deterministic so it can be tested without a browser: text is measured through the `measure`
 * function the caller supplies (the canvas's own measureText in the app).
 */
export const TEMPLATE_LABEL = {
    quote: "Quote card", matchday: "Matchday", result: "Full-time result", announcement: "Player announcement", headline: "Headline / article header",
    lineup: "Team line-up", table: "League table", stats: "Player stats card", award: "Player of the month / award", bigmatch: "Matchday (big letters)",
};
export const TEMPLATE_FOR = {
    "quote-card": "quote", matchday: "matchday", "player-announcement": "announcement", "article-header": "headline", "interview-thumbnail": "headline", social: "headline", feature: "headline",
};
/** Bundled open-licence fonts (SIL OFL, see THIRD_PARTY_NOTICES.md), with system fallbacks. */
export const DISPLAY_FONTS = {
    bebas: { label: "Bebas Neue (tall capitals)", family: "'Bebas Neue', Impact, sans-serif", weight: 400, upper: true, lineHeight: 0.95 },
    oswald: { label: "Oswald (bold capitals)", family: "Oswald, 'Arial Narrow', sans-serif", weight: 700, upper: true, lineHeight: 1.08 },
    playfair: { label: "Playfair Display (italic serif)", family: "'Playfair Display', Georgia, serif", weight: 700, italic: true, lineHeight: 1.15 },
    inter: { label: "Inter (clean sans)", family: "Inter, 'Segoe UI', Arial, sans-serif", weight: 700, lineHeight: 1.14 },
};
const BODY = "Inter, 'Segoe UI', Arial, sans-serif";
const body = (weight, extra = {}) => ({ family: BODY, weight, lineHeight: 1.25, ...extra });
export const cssFont = (f, size) => `${f.italic ? "italic " : ""}${f.weight} ${Math.round(size * 10) / 10}px ${f.family}`;
export function defaultDesign(template, colours) {
    return {
        template, kicker: template === "matchday" ? "Matchday" : template === "result" ? "Full time" : template === "announcement" ? "Confirmed" : template === "lineup" ? "Starting XI" : template === "table" ? "League table" : template === "stats" ? "Season stats" : template === "award" ? "Player of the month" : "",
        main: template === "bigmatch" ? "MATCH\nDAY" : "", sub: "", credit: "", home: "", away: "", homeScore: "", awayScore: "", when: "", venue: "", competition: "",
        photo: "", photoWidth: 0, photoHeight: 0, focusX: 0.5, focusY: 0.4, zoom: 1, shade: 0.35,
        bg: colours.bg, accent: "#ffb703", text: colours.text, font: template === "quote" ? "playfair" : "bebas", altText: "", brandId: "", lines: "", extra: "", highlight: "",
        letterFill: "", letterFillWidth: 0, letterFillHeight: 0, fillA: 3, fillB: 2, compLogo: "", compLogoWidth: 0, compLogoHeight: 0, showSponsors: true, style: "bold", cutout: "",
    };
}
const track = (f, size) => (f.tracking ?? 0) * size;
export const display = (f, text) => (f.upper ? text.toLocaleUpperCase("en-GB") : text);
/** Greedy word wrap. Explicit line breaks are kept. A single word wider than the box stays on its own line. */
export function wrap(text, maxW, f, size, measure) {
    const font = cssFont(f, size);
    const ls = track(f, size);
    const out = [];
    for (const para of display(f, text).split(/\n/)) {
        const words = para.trim().split(/\s+/).filter(Boolean);
        let line = "";
        for (const w of words) {
            const t = line ? `${line} ${w}` : w;
            if (line && measure(t, font, ls) > maxW) {
                out.push(line);
                line = w;
            }
            else
                line = t;
        }
        if (line)
            out.push(line);
    }
    return out;
}
/** The largest size from `max` down to `min` at which the text fits the box (within `maxLines`). */
export function fit(text, box, f, max, min, measure, maxLines = 99) {
    if (!text.trim())
        return { lines: [], size: max, fits: true };
    let size = max;
    for (;;) {
        const lines = wrap(text, box.w, f, size, measure);
        const font = cssFont(f, size);
        const ls = track(f, size);
        const ok = lines.length <= maxLines && lines.length * size * f.lineHeight <= box.h + 0.5 && lines.every((l) => measure(l, font, ls) <= box.w + 0.5);
        if (ok)
            return { lines, size, fits: true };
        if (size <= min)
            return { lines, size: min, fits: false };
        size = Math.max(min, size * 0.95);
    }
}
export const STYLE_LABEL = { clean: "Clean", bold: "Bold (graded photo, ghost type, accents)", poster: "Poster (duotone, grain, frame)" };
/** Where text must stay: a margin on every side, plus the areas a platform's own buttons cover. */
export function safeArea(presetId, w, h) {
    const m = Math.round(Math.min(w, h) * 0.056);
    if (presetId === "story") {
        const top = Math.round(h * 250 / 1920), bottom = Math.round(h * 340 / 1920);
        return { x: m, y: top, w: w - 2 * m, h: h - top - bottom };
    }
    return { x: m, y: m, w: w - 2 * m, h: h - 2 * m };
}
/** Rows typed one per line, cells separated by |, a tab or two or more spaces. */
export const rowsOf = (text) => text.split(/\n/).map((l) => l.trim()).filter(Boolean).map((l) => l.split(/\s*\|\s*|\t|\s{2,}/).map((c) => c.trim()));
export function layout(d, presetId, measure, brand) {
    const p = presetById(presetId);
    const W = p?.width ?? 1080, H = p?.height ?? 1080;
    const S = safeArea(presetId, W, H);
    const u = Math.min(W, H) / 1080;
    const port = H >= W * 0.95;
    const ops = [{ t: "fill", colour: d.bg }];
    const issues = [];
    // The logo sits in a corner of the safe area; text keeps clear of it.
    let TS = S;
    let logoBox = null;
    if (brand && brand.position !== "none" && brand.logoWidth > 0 && brand.logoHeight > 0) {
        const sc = Math.min(280 * u / brand.logoWidth, 110 * u / brand.logoHeight);
        const lw = brand.logoWidth * sc, lh = brand.logoHeight * sc;
        const right = brand.position !== "top-left", top = brand.position !== "bottom-right", gap = 24 * u;
        logoBox = { x: right ? S.x + S.w - lw : S.x, y: top ? S.y : S.y + S.h - lh, w: lw, h: lh };
        TS = top ? { ...S, y: S.y + lh + gap, h: S.h - lh - gap } : { ...S, h: S.h - lh - gap };
    }
    const disp = { ...DISPLAY_FONTS[d.font] };
    // Colour grading by style: a little punch for clean, more for bold, black-and-white for the poster duotone.
    const grade = d.style === "poster" ? "grayscale(1) contrast(1.3) brightness(1.05)" : d.style === "bold" ? "contrast(1.16) saturate(1.22) brightness(0.97)" : "contrast(1.05) saturate(1.06)";
    const photo = (r) => {
        if (!d.photo)
            return;
        ops.push({ t: "photo", ...r, focusX: d.focusX, focusY: d.focusY, zoom: d.zoom, filter: grade });
        if (d.cutout)
            ops.push({ t: "cutout", ...r, focusX: d.focusX, focusY: d.focusY, zoom: d.zoom, filter: grade, layer: 2 });
    };
    const fullBleed = () => {
        if (d.photo) {
            photo({ x: 0, y: 0, w: W, h: H });
            if (d.shade > 0)
                ops.push({ t: "shade", x: 0, y: 0, w: W, h: H, colour: d.bg, a0: d.shade, a1: d.shade, dir: "down" });
            ops.push({ t: "shade", x: 0, y: H * 0.3, w: W, h: H * 0.7, colour: d.bg, a0: 0, a1: 0.96, dir: "down" });
        }
        else
            ops.push({ t: "rect", x: 0, y: 0, w: Math.round(16 * u), h: H, colour: d.accent });
    };
    const pill = (text, gapBefore = 0) => ({ role: "Label", text, font: { family: DISPLAY_FONTS.oswald.family, weight: 700, upper: true, lineHeight: 1.1, tracking: 0.06 }, colour: d.bg, max: 34 * u, min: 26 * u, maxLines: 1, gapBefore, pill: d.accent });
    const small = (role, text, size, weight = 400, colour = d.text, maxLines = 3, gapBefore = 12 * u) => ({ role, text, font: body(weight), colour, max: size * u, min: Math.max(22, size * 0.75) * u, maxLines, gapBefore });
    /** Fits each block to the column and stacks them from the top of the column, or so the last one ends at its bottom. */
    const stackUp = (blocks, col, align, anchor = "bottom") => {
        const live = blocks.filter((b) => b.text.trim());
        const fixedH = (b, f) => f.lines.length * f.size * b.font.lineHeight + (b.pill ? f.size * 0.7 : 0) + b.gapBefore;
        // The big blocks share what the small ones leave.
        const smallBlocks = live.filter((b) => b.max <= 60 * u);
        const fitted = new Map();
        let used = 0;
        const lean = (b) => (b.font.italic ? b.max * 0.05 : 0);
        for (const b of smallBlocks) {
            const f = fit(b.text, { w: col.w - (b.pill ? b.max : 0) - lean(b), h: b.max * b.font.lineHeight * b.maxLines }, b.font, b.max, b.min, measure, b.maxLines);
            fitted.set(b, f);
            used += fixedH(b, f);
        }
        const big = live.filter((b) => !smallBlocks.includes(b));
        const room = Math.max(0, col.h - used - big.reduce((s, b) => s + b.gapBefore, 0));
        const share = big.reduce((t, b) => t + b.max, 0);
        for (const b of big) {
            const f = fit(b.text, { w: col.w - lean(b), h: Math.min(room * b.max / share, b.max * b.font.lineHeight * b.maxLines) }, b.font, b.max, b.min, measure, b.maxLines);
            fitted.set(b, f);
        }
        // Grouped blocks share the smallest size; scaled blocks follow their group.
        const groupSize = new Map();
        for (const b of live)
            if (b.group)
                groupSize.set(b.group, Math.min(groupSize.get(b.group) ?? Infinity, fitted.get(b).size));
        const refit = (b, size) => { const prev = fitted.get(b); const lines = wrap(b.text, col.w - lean(b), b.font, size, measure); fitted.set(b, { lines, size, fits: prev.fits && lines.length <= b.maxLines }); };
        for (const b of live) {
            if (b.group && fitted.get(b).size !== groupSize.get(b.group))
                refit(b, groupSize.get(b.group));
            if (b.scaleOf && groupSize.has(b.scaleOf.group))
                refit(b, Math.max(b.min, groupSize.get(b.scaleOf.group) * b.scaleOf.factor));
        }
        let total = live.reduce((s, b) => s + fixedH(b, fitted.get(b)), 0) - (live[0]?.gapBefore ?? 0);
        let y = anchor === "top" ? col.y : col.y + col.h - total;
        if (y < col.y) {
            y = col.y;
            issues.push({ level: "fix", text: "The text is too long for this size and runs off the graphic. Shorten it." });
            total = col.h;
        }
        const top = y;
        live.forEach((b, i) => {
            const f = fitted.get(b);
            if (i > 0)
                y += b.gapBefore;
            if (!f.fits)
                issues.push({ level: "fix", text: `${b.role} is too long to fit${b.maxLines === 1 ? " on one line" : ""}. Shorten it.` });
            if (b.pill) {
                const font = cssFont(b.font, f.size);
                const tw = measure(f.lines[0] ?? "", font, track(b.font, f.size));
                const pad = f.size * 0.6;
                const px = align === "center" ? col.x + (col.w - tw) / 2 - pad : col.x;
                ops.push({ t: "rect", x: px, y, w: tw + pad * 2, h: f.size * (b.font.lineHeight + 0.7), colour: b.pill, radius: f.size * 0.2 });
                ops.push({ t: "text", role: b.role, lines: f.lines, x: px + pad, y: y + f.size * 0.35, w: tw, size: f.size, font: b.font, colour: b.colour, align: "left" });
                y += f.size * (b.font.lineHeight + 0.7);
            }
            else {
                ops.push({ t: "text", role: b.role, lines: f.lines, x: col.x + lean(b), y, w: col.w - lean(b), size: f.size, font: b.font, colour: b.colour, align });
                y += f.lines.length * f.size * b.font.lineHeight;
            }
        });
        return { top, bottom: live.length ? y : top };
    };
    /**
     * A table of rows (line-ups, league tables, stats) filling `area`. Every row gets the same height and text size,
     * shrunk until the widest cell fits its column. `highlight` rows get the accent colour behind them.
     */
    const table = (rows, cols, area, opts) => {
        const all = opts.header ? [opts.header, ...rows] : rows;
        if (!rows.length)
            return;
        const gap = 18 * u;
        const totalShare = cols.reduce((s, c) => s + c.share, 0);
        const widths = cols.map((c) => (area.w - gap * (cols.length - 1)) * c.share / totalShare);
        const rowH = Math.min(opts.maxRow, area.h / all.length);
        let size = rowH * 0.6;
        const min = 20 * u;
        const fits = (sz) => all.every((r) => r.every((cell, i) => { const c = cols[i]; if (!c)
            return true; const f = cssFont(c.font, sz * (c.scale ?? 1)); return measure(display(c.font, cell), f, track(c.font, sz)) <= widths[i] + 0.5; }));
        while (size > min && !fits(size))
            size *= 0.95;
        if (!fits(size))
            issues.push({ level: "fix", text: `${opts.role}: some entries are too long to fit. Shorten them (e.g. surnames only).` });
        if (rowH < 30 * u)
            issues.push({ level: "fix", text: `${opts.role}: too many rows for this size. Use a taller size or fewer rows.` });
        all.forEach((r, ri) => {
            const y = area.y + ri * rowH;
            const isHead = !!opts.header && ri === 0;
            const hi = !isHead && !!opts.highlight?.(r);
            if (hi)
                ops.push({ t: "rect", x: area.x - 10 * u, y, w: area.w + 20 * u, h: rowH, colour: d.accent, radius: 8 * u });
            let x = area.x;
            r.forEach((cell, ci) => {
                const c = cols[ci];
                if (!c)
                    return;
                const w = widths[ci];
                const sz = size * (c.scale ?? 1) * (isHead ? 0.7 : 1);
                const lh = rowH / sz; // centre the text in the row
                ops.push({ t: "text", role: isHead ? `${opts.role} heading` : opts.role, lines: [display(c.font, cell)], x, y, w, size: sz, font: { ...c.font, lineHeight: lh }, colour: hi ? d.bg : isHead ? d.text : c.colour ?? d.text, align: c.align });
                x += w + gap;
            });
        });
    };
    /** Rows typed one per line, cells separated by | , tab or two or more spaces. */
    const parseRows = rowsOf;
    const credit = small("Credit", d.credit, 24, 400, d.text, 2, 18 * u);
    const handle = small("Handle", brand?.handle ?? "", 26, 700, d.accent, 1, 10 * u);
    if (d.template === "quote") {
        const quoteFont = { ...disp, upper: false }; // never change the case of a quotation
        let T = TS;
        if (d.photo && port) {
            photo({ x: 0, y: 0, w: W, h: H * 0.5 });
            ops.push({ t: "shade", x: 0, y: H * 0.22, w: W, h: H * 0.29, colour: d.bg, a0: 0, a1: 1, dir: "down" });
            const ty = Math.max(H * 0.44, TS.y);
            T = { x: S.x, y: ty, w: S.w, h: TS.y + TS.h - ty };
        }
        else if (d.photo) {
            photo({ x: W * 0.52, y: 0, w: W * 0.48, h: H });
            ops.push({ t: "shade", x: W * 0.52, y: 0, w: W * 0.2, h: H, colour: d.bg, a0: 1, a1: 0, dir: "right" });
            T = { x: S.x, y: TS.y, w: W * 0.52 - S.x - 24 * u, h: TS.h };
        }
        ops.push({ t: "rect", x: T.x, y: T.y, w: 90 * u, h: 10 * u, colour: d.accent });
        const markSize = 300 * u;
        ops.push({ t: "text", role: "Quotation mark", lines: ["“"], x: T.x - 6 * u, y: T.y - 12 * u, w: markSize, size: markSize, font: DISPLAY_FONTS.playfair, colour: d.accent, align: "left" });
        const top = T.y + 130 * u;
        stackUp([
            { role: "The quote", text: d.main, font: quoteFont, colour: d.text, max: 92 * u, min: 34 * u, maxLines: 14, gapBefore: 0 },
            small("Speaker", d.sub, 36, 700, d.accent, 2, 34 * u), credit, handle,
        ], { x: T.x, y: top, w: T.w, h: T.y + T.h - top }, "left", "top");
        if (!d.main.trim())
            issues.push({ level: "fix", text: "Add the quote (choose a saved quote so the wording is exact)." });
        if (!d.sub.trim())
            issues.push({ level: "consider", text: "Credit the speaker under the quote." });
    }
    else if (d.template === "matchday") {
        fullBleed();
        const col = { ...TS, w: port ? S.w : S.w * 0.62 };
        stackUp([pill(d.kicker),
            { role: "Home team", text: d.home, font: disp, colour: d.text, max: 150 * u, min: 48 * u, maxLines: 2, gapBefore: 26 * u, group: "teams" },
            { role: "The “v”", text: d.home && d.away ? "v" : "", font: { ...disp, upper: true }, colour: d.accent, max: 56 * u, min: 30 * u, maxLines: 1, gapBefore: 6 * u, scaleOf: { group: "teams", factor: 0.45 } },
            { role: "Away team", text: d.away, font: disp, colour: d.text, max: 150 * u, min: 48 * u, maxLines: 2, gapBefore: 6 * u, group: "teams" },
            small("Competition", d.competition, 30, 700, d.accent, 1, 30 * u), small("Date and time", d.when, 40, 700, d.text, 2, 8 * u), small("Venue", d.venue, 30, 400, d.text, 2, 6 * u), credit, handle,
        ], col, "left");
        if (!d.home.trim() || !d.away.trim())
            issues.push({ level: "fix", text: "Add both teams." });
        if (!d.when.trim())
            issues.push({ level: "fix", text: "Add the date and kick-off time." });
    }
    else if (d.template === "result") {
        fullBleed();
        const col = { ...TS, w: port ? S.w : S.w * 0.62 };
        const al = port ? "center" : "left";
        const score = d.homeScore.trim() !== "" && d.awayScore.trim() !== "" ? `${d.homeScore.trim()} – ${d.awayScore.trim()}` : "";
        stackUp([pill(d.kicker),
            { role: "Home team", text: d.home, font: disp, colour: d.text, max: 110 * u, min: 44 * u, maxLines: 2, gapBefore: 26 * u, group: "teams" },
            { role: "Score", text: score, font: { ...disp, upper: false }, colour: d.accent, max: 250 * u, min: 90 * u, maxLines: 1, gapBefore: 4 * u },
            { role: "Away team", text: d.away, font: disp, colour: d.text, max: 110 * u, min: 44 * u, maxLines: 2, gapBefore: 4 * u, group: "teams" },
            small("Scorers", d.sub, 30, 400, d.text, 5, 26 * u), small("Competition", d.competition, 28, 700, d.accent, 1, 14 * u), credit, handle,
        ], col, al);
        if (!d.home.trim() || !d.away.trim())
            issues.push({ level: "fix", text: "Add both teams." });
        if (!score)
            issues.push({ level: "fix", text: "Add the score." });
        else if (!/^\d{1,2}$/.test(d.homeScore.trim()) || !/^\d{1,2}$/.test(d.awayScore.trim()))
            issues.push({ level: "consider", text: "Scores are usually whole numbers. Check the score." });
    }
    else if (d.template === "announcement") {
        fullBleed();
        stackUp([pill(d.kicker),
            { role: "Name", text: d.main, font: disp, colour: d.text, max: 190 * u, min: 56 * u, maxLines: 2, gapBefore: 22 * u },
            small("Detail", d.sub, 40, 700, d.text, 3, 14 * u), credit, handle,
        ], { ...TS, w: port ? S.w : S.w * 0.7 }, "left");
        if (!d.main.trim())
            issues.push({ level: "fix", text: "Add the player's name." });
        if (!d.photo)
            issues.push({ level: "consider", text: "Announcements work best with a strong photo of the player (check you have the rights)." });
    }
    else if (d.template === "lineup" || d.template === "table" || d.template === "stats") {
        fullBleed();
        if (d.photo)
            ops.push({ t: "shade", x: 0, y: 0, w: W, h: H, colour: d.bg, a0: 0.55, a1: 0.55, dir: "down" }); // rows need a calm background
        const subsText = d.template === "lineup" && d.extra.trim() ? (/^subs/i.test(d.extra.trim()) ? d.extra.trim() : `Subs: ${d.extra.trim()}`) : "";
        const foot = stackUp([small("Substitutes", subsText, 28, 400, d.text, 4, 0), credit, handle], TS, "left", "bottom");
        const footTop = subsText || d.credit.trim() || brand?.handle ? foot.top : TS.y + TS.h;
        const head = stackUp([pill(d.kicker),
            { role: d.template === "table" ? "Title" : "Name", text: d.main, font: disp, colour: d.text, max: 100 * u, min: 40 * u, maxLines: 2, gapBefore: 18 * u },
            small(d.template === "lineup" ? "Formation" : "Detail", d.sub, 30, 700, d.accent, 2, 8 * u)], { ...TS, h: (footTop - TS.y) * 0.4 }, "left", "top");
        const area = { x: TS.x, y: head.bottom + 30 * u, w: TS.w, h: footTop - 24 * u - (head.bottom + 30 * u) };
        const rows = parseRows(d.lines);
        const bold = body(700), numFont = { ...DISPLAY_FONTS.oswald, upper: false };
        if (d.template === "lineup") {
            const players = rows.map((r) => { const m = /^(\d{1,2})[.):\s-]+(.+)$/.exec(r.join(" ")); return m ? [m[1], m[2]] : ["", r.join(" ")]; });
            // Without shirt numbers the names use the full width (no empty number column).
            if (players.some(([n]) => n))
                table(players, [{ share: 0.13, align: "right", font: numFont, colour: d.accent }, { share: 0.87, align: "left", font: { ...bold, upper: true } }], area, { maxRow: 86 * u, role: "Players" });
            else
                table(players.map(([, name]) => [name]), [{ share: 1, align: "left", font: { ...bold, upper: true } }], area, { maxRow: 86 * u, role: "Players" });
            if (!players.length)
                issues.push({ level: "fix", text: "Add the players, one per line (number first, e.g. “1 Smith”)." });
            else if (players.length !== 11)
                issues.push({ level: "consider", text: `${players.length} players listed. A starting line-up has 11.` });
        }
        else if (d.template === "table") {
            const hl = d.highlight.trim().toLowerCase();
            const teamRows = rows.map((r) => [r[0] ?? "", r[1] ?? "", r[2] ?? "", r[3] ?? "", r[4] ?? ""]);
            table(teamRows, [{ share: 0.09, align: "right", font: bold }, { share: 0.55, align: "left", font: bold }, { share: 0.1, align: "right", font: body(400) }, { share: 0.12, align: "right", font: body(400) }, { share: 0.12, align: "right", font: numFont, colour: d.accent, scale: 1.1 }], area, { header: ["#", "Team", "P", "GD", "Pts"], highlight: (r) => !!hl && (r[1] ?? "").toLowerCase().includes(hl), maxRow: 80 * u, role: "Table" });
            if (!rows.length)
                issues.push({ level: "fix", text: "Add the table rows, one per line: position | team | played | goal difference | points." });
            else if (rows.some((r) => r.length < 5))
                issues.push({ level: "fix", text: "Some table rows are missing columns. Each line needs: position | team | played | goal difference | points." });
        }
        else {
            const stat = rows.map((r) => [r[0] ?? "", r.slice(1).join(" ")]);
            table(stat, [{ share: 0.62, align: "left", font: { ...bold, upper: true } }, { share: 0.38, align: "right", font: { ...disp, upper: false }, colour: d.accent, scale: 1.5 }], area, { maxRow: 150 * u, role: "Stats" });
            if (!stat.length)
                issues.push({ level: "fix", text: "Add the stats, one per line: label | number (e.g. “Goals | 19”)." });
            else if (stat.some((r) => !r[1]))
                issues.push({ level: "fix", text: "Some stats have no number. Write them as: label | number." });
        }
        if (!d.main.trim())
            issues.push({ level: "fix", text: d.template === "table" ? "Add a title (e.g. the league)." : "Add the team or player name." });
    }
    else if (d.template === "bigmatch") {
        // Full photo, giant stacked words (some letters filled with club artwork), fixture details, optional ticket card, sponsor strip.
        if (d.photo)
            photo({ x: 0, y: 0, w: W, h: H });
        ops.push({ t: "shade", x: 0, y: 0, w: W, h: H * 0.58, colour: d.bg, a0: d.photo ? 0.5 + d.shade * 0.5 : 0, a1: 0, dir: "down" });
        const sponsors = d.showSponsors ? (brand?.sponsors ?? []).slice(0, 10) : [];
        const stripH = sponsors.length ? 56 * u : 0;
        if (sponsors.length || d.photo)
            ops.push({ t: "shade", x: 0, y: H * 0.78, w: W, h: H * 0.22, colour: d.bg, a0: 0, a1: d.photo ? 0.85 : 0, dir: "down" });
        const bottom = TS.y + TS.h - (stripH ? stripH + 24 * u : 0);
        // Date line
        const dateFont = { ...body(700), upper: true, tracking: 0.02 };
        const dateFit = fit(d.kicker, { w: TS.w, h: 40 * u }, dateFont, 32 * u, 22 * u, measure, 1);
        if (dateFit.lines.length)
            ops.push({ t: "text", role: "Date", lines: dateFit.lines, x: TS.x, y: TS.y, w: TS.w, size: dateFit.size, font: dateFont, colour: d.text, align: "left" });
        // The big words: every word at the same size, as large as fits the column.
        const bigFont = { family: "'Alfa Slab One', 'Rockwell Extra Bold', Georgia, serif", weight: 400, upper: true, lineHeight: 0.8 }; // capitals only: about 0.72 of the size tall
        const words = d.main.split(/\n/).map((w) => w.trim().toLocaleUpperCase("en-GB")).filter(Boolean).slice(0, 3);
        const colW = port ? TS.w * 0.66 : TS.w * 0.48;
        // Each word is sized to fill the column on its own (so a short word like DAY stands taller than MATCH),
        // then all are scaled down together if they would take more than about half the height.
        const sizes = words.map((w) => { const at100 = measure(w, cssFont(bigFont, 100), 0) || 1; return Math.min(460 * u, Math.max(60 * u, 100 * colW / at100)); });
        const room = (port ? TS.h * 0.5 : TS.h * 0.62);
        const total = sizes.reduce((t, z) => t + z * bigFont.lineHeight, 0);
        if (total > room)
            for (let i = 0; i < sizes.length; i++)
                sizes[i] *= room / total;
        let y = TS.y + (dateFit.lines.length ? dateFit.size * 1.9 : 0);
        const fillCounts = [d.fillA, d.fillB, 0];
        words.forEach((w, wi) => {
            const size = sizes[wi];
            const letters = [];
            let x = TS.x;
            [...w].forEach((ch, ci) => { letters.push({ ch, x, filled: !!d.letterFill && ci < (fillCounts[wi] ?? 0) }); x += measure(ch, cssFont(bigFont, size), 0); });
            const filled = letters.filter((l) => l.filled);
            const fillBox = filled.length ? { x: filled[0].x, y, w: (filled.at(-1).x + measure(filled.at(-1).ch, cssFont(bigFont, size), 0)) - filled[0].x, h: size * bigFont.lineHeight } : null;
            ops.push({ t: "letters", role: "Big words", y, size, font: bigFont, colour: d.text, alpha: 0.92, letters, fillBox });
            y += size * bigFont.lineHeight;
        });
        // Fixture: competition logo, opponent, kick-off.
        y += 28 * u;
        const logoSide = d.compLogo && d.compLogoWidth ? 104 * u : 0;
        if (logoSide) {
            const sc = Math.min(logoSide / d.compLogoWidth, logoSide / d.compLogoHeight);
            ops.push({ t: "image", key: "compLogo", x: TS.x + (logoSide - d.compLogoWidth * sc) / 2, y: y + (logoSide - d.compLogoHeight * sc) / 2, w: d.compLogoWidth * sc, h: d.compLogoHeight * sc });
        }
        const infoX = TS.x + (logoSide ? logoSide + 22 * u : 0);
        const infoW = (port ? TS.w * 0.7 : TS.w * 0.5) - (infoX - TS.x);
        const oppFont = { ...body(700), upper: true }, koFont = { ...body(700), upper: true, lineHeight: 1.1 };
        const opp = fit(d.sub, { w: infoW, h: 44 * u }, oppFont, 36 * u, 24 * u, measure, 1), ko = fit(d.when, { w: infoW, h: 70 * u }, koFont, 62 * u, 32 * u, measure, 1);
        if (!opp.fits || !ko.fits)
            issues.push({ level: "fix", text: "The opponent or kick-off line is too long. Shorten it." });
        if (opp.lines.length)
            ops.push({ t: "text", role: "Opponent", lines: opp.lines, x: infoX, y, w: infoW, size: opp.size, font: oppFont, colour: d.text, align: "left" });
        const koY = y + (opp.lines.length ? opp.size * 1.3 : 0);
        if (ko.lines.length)
            ops.push({ t: "text", role: "Kick-off", lines: ko.lines, x: infoX, y: koY, w: infoW, size: ko.size, font: koFont, colour: d.text, align: "left" });
        y = Math.max(y + logoSide, koY + (ko.lines.length ? ko.size * koFont.lineHeight : 0));
        // Ticket card (optional): white card, header bar in the accent colour, price rows, footer line.
        const tickets = rowsOf(d.lines);
        if (tickets.length) {
            // Under the fixture when there is room (portrait); otherwise in a column beside the big words.
            const need = 96 * u + 48 * u + tickets.length * 60 * u + (d.extra.trim() ? 90 * u : 0);
            const below = bottom - (y + 40 * u) >= need;
            const cw = below ? TS.w * 0.4 : Math.min(TS.w * 0.3, TS.x + TS.w - (TS.x + colW + 40 * u));
            const cx = below ? TS.x + 50 * u : TS.x + TS.w - cw, cy = below ? y + 40 * u : TS.y + 60 * u, pad = 24 * u;
            const avail = bottom - cy;
            const rowH = Math.min(84 * u, (avail - 110 * u - (d.extra.trim() ? 90 * u : 0) - pad * 2) / tickets.length);
            if (rowH < 40 * u)
                issues.push({ level: "fix", text: "The ticket card does not fit. Use fewer price rows or a taller size." });
            const headH = 96 * u, footH = d.extra.trim() ? 90 * u : 0, ch = headH + pad * 2 + tickets.length * rowH + footH;
            ops.push({ t: "rect", x: cx, y: cy, w: cw, h: ch, colour: "#ffffff", radius: 26 * u });
            ops.push({ t: "rect", x: cx + pad, y: cy + pad, w: cw - pad * 2, h: headH - pad * 0.3, colour: d.accent, radius: 4 * u });
            const headFont = { family: DISPLAY_FONTS.oswald.family, weight: 700, upper: true, lineHeight: 1.0 };
            const hf = fit("Ticket information", { w: cw - pad * 4, h: headH - pad }, headFont, 40 * u, 20 * u, measure, 2);
            ops.push({ t: "text", role: "Ticket heading", lines: hf.lines, x: cx + pad, y: cy + pad + (headH - pad * 0.3 - hf.lines.length * hf.size) / 2, w: cw - pad * 2, size: hf.size, font: headFont, colour: contrastRatio("#ffffff", d.accent) >= contrastRatio(d.bg, d.accent) ? "#ffffff" : d.bg, align: "center" });
            const rowFont = { ...body(700), upper: true, lineHeight: 1.1 };
            tickets.forEach((r, i) => {
                const ry = cy + pad + headH + 10 * u + i * rowH;
                const label = r[0] ?? "", price = r.slice(1).join(" ");
                const pw = Math.max(70 * u, measure(price, cssFont(rowFont, 28 * u), 0) + 6 * u);
                const lf = fit(label, { w: cw - pad * 2 - pw - 10 * u, h: rowH * 0.8 }, rowFont, 28 * u, 18 * u, measure, 2);
                ops.push({ t: "text", role: "Ticket price label", lines: lf.lines, x: cx + pad, y: ry + rowH * 0.85 - lf.lines.length * lf.size * 1.1, w: cw - pad * 2 - pw, size: lf.size, font: rowFont, colour: d.bg, align: "left" });
                ops.push({ t: "text", role: "Ticket price", lines: [price.toLocaleUpperCase("en-GB")], x: cx + cw - pad - pw, y: ry + rowH * 0.85 - 28 * u * 1.1, w: pw, size: 28 * u, font: rowFont, colour: contrastRatio(d.accent, "#ffffff") >= 4.5 ? d.accent : d.bg, align: "right" });
                ops.push({ t: "rect", x: cx + pad, y: ry + rowH * 0.88, w: cw - pad * 2, h: 3 * u, colour: d.bg });
            });
            if (footH) {
                const ff = fit(d.extra, { w: cw - pad * 2, h: footH - 10 * u }, { ...rowFont, lineHeight: 1.15 }, 30 * u, 18 * u, measure, 2);
                ops.push({ t: "text", role: "Ticket note", lines: ff.lines, x: cx + pad, y: cy + ch - pad - ff.lines.length * ff.size * 1.15, w: cw - pad * 2, size: ff.size, font: { ...rowFont, lineHeight: 1.15 }, colour: d.bg, align: "center" });
            }
            if (cy + ch > bottom + 1)
                issues.push({ level: "fix", text: "The ticket card runs into the bottom of the graphic. Use fewer price rows or a taller size." });
            if (tickets.some((r) => r.length < 2))
                issues.push({ level: "fix", text: "Each ticket line needs a label and a price, e.g. “General admission | £5”." });
        }
        else if (y > bottom)
            issues.push({ level: "fix", text: "The words do not fit above the sponsors. Use a taller size." });
        // Sponsor strip: logos scaled to the same height, spread evenly across the bottom.
        if (sponsors.length) {
            const gap = 26 * u;
            const maxW = (TS.w - gap * (sponsors.length - 1)) / sponsors.length;
            const sizes = sponsors.map((s) => { const sc = Math.min(stripH / s.height, maxW / s.width); return { w: s.width * sc, h: s.height * sc }; });
            const spare = (TS.w - sizes.reduce((t, s) => t + s.w, 0)) / Math.max(1, sponsors.length - 1);
            let sx = TS.x;
            sizes.forEach((s, i) => { ops.push({ t: "image", key: `sponsor:${i}`, x: sponsors.length === 1 ? TS.x + (TS.w - s.w) / 2 : sx, y: TS.y + TS.h - stripH + (stripH - s.h) / 2, w: s.w, h: s.h }); sx += s.w + spare; });
        }
        if (brand?.handle) {
            const hf = body(700);
            const hd = fit(brand.handle, { w: TS.w * 0.48, h: 34 * u }, hf, 24 * u, 18 * u, measure, 1);
            ops.push({ t: "text", role: "Handle", lines: hd.lines, x: TS.x, y: bottom - hd.size * 1.3, w: TS.w * 0.48, size: hd.size, font: hf, colour: d.text, align: "left" });
        }
        if (d.credit.trim()) {
            const cf = body(400);
            const cr = fit(d.credit, { w: TS.w * 0.5, h: 30 * u }, cf, 20 * u, 16 * u, measure, 1);
            ops.push({ t: "text", role: "Credit", lines: cr.lines, x: TS.x + TS.w * 0.5, y: bottom - cr.size * 1.3, w: TS.w * 0.5, size: cr.size, font: cf, colour: d.text, align: "right" });
        }
        if (!d.kicker.trim())
            issues.push({ level: "fix", text: "Add the date line at the top (e.g. Saturday 10th October 2026)." });
        if (!d.sub.trim())
            issues.push({ level: "fix", text: "Add the opponent, with (H) or (A)." });
        if (!d.when.trim())
            issues.push({ level: "fix", text: "Add the kick-off time." });
        if (!words.length)
            issues.push({ level: "fix", text: "Add the big words (e.g. MATCH on one line, DAY on the next)." });
        if (!d.letterFill)
            issues.push({ level: "consider", text: "Add club artwork to fill some of the big letters (Photo › Letter artwork)." });
        if (!d.photo)
            issues.push({ level: "consider", text: "This style works best with a full action photo of a player (check you have the rights)." });
    }
    else if (d.template === "award") {
        fullBleed();
        const statLine = parseRows(d.lines).map((r) => r.length > 1 ? `${r.slice(1).join(" ")} ${r[0].toLowerCase()}` : r[0]).join("  ·  ");
        stackUp([pill(d.kicker),
            { role: "Name", text: d.main, font: disp, colour: d.text, max: 180 * u, min: 56 * u, maxLines: 2, gapBefore: 22 * u },
            small("Detail", d.sub, 40, 700, d.text, 2, 12 * u), small("Stats", statLine, 34, 700, d.accent, 2, 14 * u), credit, handle,
        ], { ...TS, w: port ? S.w : S.w * 0.7 }, "left");
        if (!d.main.trim())
            issues.push({ level: "fix", text: "Add the player's name." });
        if (!d.photo)
            issues.push({ level: "consider", text: "Award graphics work best with a strong photo of the player (check you have the rights)." });
    }
    else {
        fullBleed();
        stackUp([pill(d.kicker),
            { role: "Headline", text: d.main, font: disp, colour: d.text, max: 120 * u, min: 40 * u, maxLines: 5, gapBefore: 22 * u },
            small("Standfirst", d.sub, 34, 400, d.text, 3, 18 * u), credit, handle,
        ], { ...TS, w: port ? S.w : S.w * 0.78 }, "left");
        if (!d.main.trim())
            issues.push({ level: "fix", text: "Add the headline." });
        if (d.main.trim().split(/\s+/).length > 12)
            issues.push({ level: "consider", text: "Headlines on graphics are read in a second or two; aim for about 8 words or fewer." });
    }
    // ----- finishing by style -----
    const rowsTemplate = ["lineup", "table", "stats"].includes(d.template);
    if (d.photo && d.style === "poster") {
        ops.push({ t: "tint", colour: d.accent, mode: "color", alpha: 0.72, layer: 0.5 }); // duotone: the photo in the brand's colour
        ops.push({ t: "tint", colour: d.bg, colour2: d.bg, mode: "multiply", alpha: 0.35, layer: 0.5 });
    }
    if (d.photo && d.style !== "clean")
        ops.push({ t: "vignette", strength: d.style === "bold" ? 0.55 : 0.4, layer: 0.6 });
    if (d.style !== "clean")
        ops.push({ t: "grain", amount: d.style === "poster" ? 0.1 : 0.05, layer: 2.5 });
    if (d.style === "bold" && !rowsTemplate && d.template !== "quote") {
        // Accent bars cut across the top corner, and a huge outlined word behind the player.
        // Short slashes in the top corner (clear of faces), and a dark angled band behind the words with an accent edge.
        const k = Math.min(W, H);
        ops.push({ t: "poly", points: [[W - k * 0.2, 0], [W - k * 0.13, 0], [W, k * 0.13], [W, k * 0.2]], colour: d.accent, alpha: 0.95, layer: 1 });
        ops.push({ t: "poly", points: [[W - k * 0.1, 0], [W - k * 0.075, 0], [W, k * 0.075], [W, k * 0.1]], colour: d.text, alpha: 0.6, layer: 1 });
        const words = ops.filter((o) => o.t === "text" && o.role !== "Credit" && o.role !== "Handle");
        if (words.length && d.photo && d.template !== "bigmatch") {
            const top = Math.min(...words.map((o) => o.y)) - 40 * u, right = Math.max(...words.map((o) => o.x + Math.min(o.w, Math.max(...o.lines.map((l) => measure(l, cssFont(o.font, o.size), (o.font.tracking ?? 0) * o.size)))))) + 60 * u;
            const lean = 0.18 * (H - top);
            ops.push({ t: "poly", points: [[0, top], [right + lean, top], [right, H], [0, H]], colour: d.bg, alpha: 0.55, layer: 0.8 });
            ops.push({ t: "poly", points: [[0, top - 8 * u], [right + lean + 1.6 * u, top - 8 * u], [right + lean, top], [0, top]], colour: d.accent, alpha: 1, layer: 0.8 });
        }
        const ghostWord = (d.template === "matchday" || d.template === "bigmatch" ? (d.template === "bigmatch" ? "" : "Matchday") : d.template === "result" ? (d.kicker.trim() || "Full time") : d.kicker || (d.template === "headline" ? "News" : "")).toLocaleUpperCase("en-GB");
        if (ghostWord) {
            const gf = { ...DISPLAY_FONTS.bebas, lineHeight: 0.9 };
            let gs = 400 * u;
            const gw = () => measure(ghostWord, cssFont(gf, gs), 0);
            while (gs > 120 * u && gw() > W * 1.05)
                gs *= 0.96;
            ops.push({ t: "text", role: "Ghost", lines: [ghostWord], x: (W - gw()) / 2, y: H * (port ? 0.08 : 0.04), w: gw(), size: gs, font: gf, colour: d.text, align: "left", outline: 3 * u, alpha: 0.3, layer: 1 });
        }
    }
    if (d.style === "poster") {
        const b = 22 * u, t = 6 * u; // a thin frame in the accent colour
        for (const r of [{ x: b, y: b, w: W - 2 * b, h: t }, { x: b, y: H - b - t, w: W - 2 * b, h: t }, { x: b, y: b, w: t, h: H - 2 * b }, { x: W - b - t, y: b, w: t, h: H - 2 * b }])
            ops.push({ t: "rect", ...r, colour: d.accent, layer: 3.5 });
    }
    if (d.style !== "clean")
        for (const o of ops) {
            // Display type gets a soft shadow so it lifts off the photo; bold also slants it, like broadcast graphics.
            if (o.t === "text" && o.role !== "Ghost" && o.role !== "Quotation mark" && o.size >= 70 * u && o.font.family !== body(400).family) {
                o.shadow = d.photo ? 26 * u : 0;
                if (d.style === "bold" && o.font.upper && !o.font.italic)
                    o.skew = -0.12;
            }
        }
    if (logoBox)
        ops.push({ t: "logo", ...logoBox });
    // Draw in layers: background, decoration and big type, cut-out player, content, logo.
    const layerOf = (o) => o.layer ?? (o.t === "fill" || o.t === "photo" || o.t === "shade" ? 0 : o.t === "letters" ? 1 : o.t === "logo" ? 4 : 3);
    const sorted = ops.map((o, i) => [o, i]).sort((a, b) => layerOf(a[0]) - layerOf(b[0]) || a[1] - b[1]).map(([o]) => o);
    ops.length = 0;
    ops.push(...sorted);
    if (d.photo && !d.credit.trim())
        issues.push({ level: "consider", text: "Add a photo credit if the photographer or agency requires one." });
    if (presetId === "yt-thumb")
        issues.push({ level: "consider", text: "YouTube's video length badge covers the bottom-right corner; keep it clear." });
    return { width: W, height: H, safe: S, ops, issues };
}
// ----- measured contrast of rendered text -----
/**
 * Contrast of text over what is actually behind it. `pixels` are RGBA samples of the background where the text
 * sits (drawn before the text). Returns the ratio that 90% of those pixels reach, so a few dark specks do not
 * hide a mostly-bright patch behind the words.
 */
export function measuredContrast(textHex, pixels) {
    const ratios = [];
    for (let i = 0; i + 3 < pixels.length; i += 4) {
        const hex = "#" + [pixels[i], pixels[i + 1], pixels[i + 2]].map((c) => c.toString(16).padStart(2, "0")).join("");
        ratios.push(contrastRatio(textHex, hex));
    }
    if (!ratios.length)
        return 21;
    ratios.sort((a, b) => a - b);
    return ratios[Math.floor(ratios.length * 0.1)];
}
/** Large text (WCAG "large") as it will appear on a phone: the graphic is shown about 400 px wide. */
export const isLargeOnPhone = (sizePx, canvasWidth, bold) => sizePx * (400 / canvasWidth) >= (bold ? 18.66 : 24) * 0.75;
export function contrastIssue(role, ratio, large) {
    const need = large ? 3 : 4.5;
    if (ratio >= need)
        return null;
    return { level: "fix", text: `${role}: contrast with what is behind it is ${ratio.toFixed(1)}:1 (needs ${need}:1). Darken the photo (Shade), move the photo, or change the colours.` };
}
/** Plain description for alt text. Writers should check and edit it. */
export function altText(d) {
    const s = (x) => x.trim().replace(/\s+/g, " ");
    const tail = [s(d.credit)].filter(Boolean).join(". ");
    const parts = d.template === "quote" ? [`Quote card${d.sub ? ` with ${s(d.sub)}` : ""}: “${s(d.main)}”`]
        : d.template === "matchday" ? [`Matchday graphic: ${s(d.home)} v ${s(d.away)}`, s(d.competition), s(d.when), s(d.venue)]
            : d.template === "result" ? [`Full-time result: ${s(d.home)} ${s(d.homeScore)}, ${s(d.away)} ${s(d.awayScore)}`, s(d.competition), d.sub ? `Scorers: ${s(d.sub)}` : ""]
                : d.template === "announcement" ? [`${s(d.kicker) || "Announcement"}: ${s(d.main)}`, s(d.sub)]
                    : d.template === "lineup" ? [`${s(d.kicker) || "Line-up"}: ${s(d.main)}`, s(d.sub), d.lines.split("\n").map(s).filter(Boolean).join(", "), d.extra.trim() ? (/^subs/i.test(d.extra.trim()) ? s(d.extra) : `Subs: ${s(d.extra)}`) : ""]
                        : d.template === "table" ? [`${s(d.main) || "League table"}`, s(d.sub), rowsOf(d.lines).filter((r) => r[1]).map((r) => `${r[0]} ${r[1]}, ${r[4] ?? "?"} points`).join("; ")]
                            : d.template === "stats" || d.template === "award" ? [`${s(d.kicker) || "Stats"}: ${s(d.main)}`, s(d.sub), rowsOf(d.lines).map((r) => r.join(" ")).join(", ")]
                                : [s(d.main), s(d.sub)];
    const text = parts.filter(Boolean).join(". ") + (d.photo ? ". Photo in the background" : "") + (tail ? `. ${tail}` : "");
    return text.replace(/\.\./g, ".").slice(0, 1000) + (/[.!?”"]$/.test(text) ? "" : ".");
}
/**
 * One row of a league table pasted from a website (which usually has more columns: W, D, L, F, A, form...)
 * → "position | team | played | goal difference | points", or null if it is not a table row.
 * Assumes the usual order: played first, goal difference and points last.
 */
export function tidyTableRow(line) {
    let rest = line.trim();
    let pos = "";
    const m = /^(\d{1,2})[.)]?\s+(.*)$/.exec(rest);
    if (m) {
        pos = m[1];
        rest = m[2];
    }
    const cells = rest.split(/\t|\s*\|\s*|\s{2,}|\s+(?=[+\-−]?\d+(?:\s|$))/).map((c) => c.trim()).filter(Boolean);
    const isNum = (c) => /^[+\-−]?\d+$/.test(c);
    const team = cells.filter((c) => !isNum(c)).join(" ").replace(/\s+/g, " ").trim();
    const nums = cells.filter(isNum).map((c) => c.replace("−", "-"));
    if (!team || nums.length < 3)
        return null;
    return [pos, team, nums[0], nums[nums.length - 2], nums[nums.length - 1]].join(" | ");
}
// ----- big-letter matchday: lines from a fixture -----
const ORD = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th");
/**
 * The three lines of a big-letter matchday graphic from a fixture: "Saturday 10th October 2026",
 * "Altrincham (A)" (the other team, home or away from the club's side) and "Kick off 12:30" (24-hour, local time).
 */
export function fixtureLines(ev, club) {
    const ts = ev.strTimestamp ? new Date(/(Z|[+-]\d\d:?\d\d)$/.test(ev.strTimestamp) ? ev.strTimestamp : ev.strTimestamp + "Z") : null;
    const day = ts && !isNaN(ts.getTime()) ? ts : ev.dateEvent ? new Date(ev.dateEvent + "T12:00:00") : null;
    const date = day ? `${day.toLocaleDateString("en-GB", { weekday: "long" })} ${ORD(day.getDate())} ${day.toLocaleDateString("en-GB", { month: "long" })} ${day.getFullYear()}` : "";
    const known = !!ts && !isNaN(ts.getTime()) && !/^00:00/.test(ev.strTime ?? "");
    const kickoff = known ? `Kick off ${String(ts.getHours()).padStart(2, "0")}:${String(ts.getMinutes()).padStart(2, "0")}` : "";
    const c = club.trim().toLowerCase();
    const home = (ev.strHomeTeam ?? "").trim(), away = (ev.strAwayTeam ?? "").trim();
    const weAreHome = !!c && home.toLowerCase().includes(c), weAreAway = !!c && away.toLowerCase().includes(c);
    const opponent = weAreHome ? `${away} (H)` : weAreAway ? `${home} (A)` : `${home} v ${away}`;
    return { date, opponent, kickoff };
}
