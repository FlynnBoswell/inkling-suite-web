import { h } from "../extension/dom.js";
import { newGraphic } from "../core/suite/model.js";
import { defaultDesign } from "../core/suite/design.js";
import { PLATFORM_PRESETS } from "../core/suite/pixel.js";
import { app, go, persist, section, plural } from "./ui.js";
import { sportsdb } from "./sleuth.js";
import { kickoff } from "./maker.js";
import { defaultBrand } from "./brand.js";
/**
 * Matchday graphics for several upcoming fixtures at once, filled from TheSportsDB (free) and the default brand kit.
 * Each becomes its own graphic to check and adjust in the maker; nothing is published.
 */
export function bulkMatchday(p) {
    const club = h("input", { type: "text", value: p.clubs[0] ?? "", placeholder: "Club, e.g. Aldershot Town", "aria-label": "Club for upcoming fixtures" });
    const size = h("select", { "aria-label": "Size for the matchday graphics" }, ...PLATFORM_PRESETS.map((x) => h("option", { value: x.id }, x.label)));
    const btn = h("button", { type: "button" }, "Find upcoming fixtures");
    const out = h("div");
    btn.addEventListener("click", async () => {
        if (!club.value.trim()) {
            club.focus();
            return;
        }
        btn.disabled = true;
        out.replaceChildren(h("p", { class: "hint", role: "status" }, "Looking up…"));
        try {
            const team = ((await sportsdb(`searchteams.php?t=${encodeURIComponent(club.value.trim())}`)).teams ?? []).find((t) => t.strSport === "Soccer");
            if (!team) {
                out.replaceChildren(h("p", null, "No club found with that name. Try the full name."));
                return;
            }
            const events = ((await sportsdb(`eventsnext.php?id=${team.idTeam}`)).events ?? []).slice(0, 8);
            if (!events.length) {
                out.replaceChildren(h("p", null, `No upcoming fixtures listed for ${team.strTeam}.`));
                return;
            }
            const boxes = events.map((ev) => h("input", { type: "checkbox", checked: true, "aria-label": `${ev.strHomeTeam} v ${ev.strAwayTeam}` }));
            out.replaceChildren(h("ul", { class: "items" }, ...events.map((ev, i) => h("li", null, h("label", { class: "check" }, boxes[i], h("span", null, `${kickoff(ev)}: ${ev.strHomeTeam} v ${ev.strAwayTeam}${ev.strLeague ? ` (${ev.strLeague})` : ""}`))))), h("p", { class: "hint" }, "From TheSportsDB, a free community-maintained database. Check every date and kick-off time against the club or league."), h("button", { type: "button", class: "primary", onClick: async () => {
                    const kit = defaultBrand();
                    const made = [];
                    events.forEach((ev, i) => {
                        if (!boxes[i].checked)
                            return;
                        const g = newGraphic(p.id, `Matchday: ${ev.strHomeTeam} v ${ev.strAwayTeam}`, "matchday", size.value);
                        const d = { ...defaultDesign("matchday", { text: g.textColour, bg: g.backgroundColour }), home: ev.strHomeTeam ?? "", away: ev.strAwayTeam ?? "", when: kickoff(ev), venue: ev.strVenue ?? "", competition: ev.strLeague ?? "" };
                        if (kit)
                            Object.assign(d, { brandId: kit.id, bg: kit.bg, accent: kit.accent, text: kit.text, font: kit.font });
                        made.push({ ...g, design: d, headline: `${d.home} v ${d.away}`, textColour: d.text, backgroundColour: d.bg, brief: `Matchday graphic. Filled from TheSportsDB on ${new Date().toLocaleDateString("en-GB")}: check the details against the official fixture list.` });
                    });
                    if (!made.length)
                        return;
                    if (await persist(() => app.store.save(...made), `${plural(made.length, "matchday graphic", "matchday graphics")} created`, { rerender: false }))
                        go(`#/graphics/${p.id}`);
                } }, "Create the ticked graphics"));
        }
        catch (e) {
            out.replaceChildren(h("p", { class: "status err" }, e.message));
        }
        finally {
            btn.disabled = false;
        }
    });
    return section("Matchday graphics for upcoming fixtures", h("p", { class: "hint" }, "Makes one matchday graphic per fixture, in your brand kit, ready to check in the maker."), h("div", { class: "row" }, club, size, btn), out);
}
