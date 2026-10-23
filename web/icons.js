/**
 * Line icons for the Suite (24×24, stroke-based, drawn for Inkling). Built with createElementNS, never innerHTML.
 */
const PATHS = {
    dashboard: ["M3 3h7v9H3z", "M14 3h7v5h-7z", "M14 12h7v9h-7z", "M3 16h7v5H3z"],
    projects: ["M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"],
    search: ["M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14z", "M21 21l-4.3-4.3"],
    sleuth: ["M10 3a7 7 0 1 1 0 14 7 7 0 0 1 0-14z", "M21 21l-6-6", "M7 10h6", "M10 7v6"],
    quill: ["M20 4c-6 0-12 5-13 13l-3 3", "M20 4c0 6-4 11-11 12", "M9 12l4 1"],
    inkling: ["M12 3l6 7h-4v6a2 2 0 0 1-4 0v-6H6z", "M8 18c-1 2-2 3-3 3", "M12 19v2", "M16 18c1 2 2 3 3 3"],
    pixel: ["M4 5h16v14H4z", "M4 15l4-4 4 4 3-3 5 5", "M15 8.5a1.5 1.5 0 1 1 0 .01"],
    ripple: ["M3 9c3-3 6-3 9 0s6 3 9 0", "M3 15c3-3 6-3 9 0s6 3 9 0"],
    whistle: ["M3 11a5 5 0 1 0 10 0a5 5 0 1 0-10 0", "M8 6h13v4h-8", "M6 11h4"],
    settings: ["M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6z", "M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"],
    plus: ["M12 5v14", "M5 12h14"],
    calendar: ["M4 6h16v14H4z", "M4 10h16", "M8 3v4", "M16 3v4"],
    quote: ["M7 7h4v4c0 3-1 5-4 6", "M15 7h4v4c0 3-1 5-4 6"],
    check: ["M5 12l5 5 9-10"],
    spark: ["M12 3v4", "M12 17v4", "M3 12h4", "M17 12h4", "M6 6l2.5 2.5", "M15.5 15.5L18 18", "M6 18l2.5-2.5", "M15.5 8.5L18 6"],
};
export function icon(name, size = 20) {
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    for (const [k, v] of Object.entries({ viewBox: "0 0 24 24", width: String(size), height: String(size), fill: "none", stroke: "currentColor", "stroke-width": "1.8", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true", focusable: "false", class: "icon" }))
        svg.setAttribute(k, v);
    for (const d of PATHS[name] ?? []) {
        const p = document.createElementNS(NS, "path");
        p.setAttribute("d", d);
        svg.append(p);
    }
    return svg;
}
