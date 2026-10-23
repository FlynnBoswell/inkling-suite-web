/** Tiny DOM builder. It only ever sets text, never HTML, so page or AI content cannot inject markup. */
export function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props ?? {})) {
        if (v === undefined || v === null || v === false)
            continue;
        if (k === "class")
            el.className = v;
        else if (k.startsWith("on") && typeof v === "function")
            el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k in el && !k.includes("-") && k !== "list")
            el[k] = v;
        else
            el.setAttribute(k, v === true ? "" : String(v));
    }
    for (const c of kids)
        if (c !== null && c !== undefined && c !== false)
            el.append(c);
    return el;
}
const SQUID = `<svg viewBox="0 0 128 128" width="20" height="20" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width="9" stroke-linecap="round"><path d="M44 84C40 98 34 104 28 114"/><path d="M64 89V118"/><path d="M84 84C88 98 94 104 100 114"/></g><path d="M64 8L96 42 76 44C80 62 80 78 76 88 70 94 58 94 52 88 48 78 48 62 52 44L32 42Z" fill="currentColor"/><circle cx="55" cy="68" r="6" fill="var(--ink-bg,#12233F)"/><circle cx="73" cy="68" r="6" fill="var(--ink-bg,#12233F)"/></svg>`;
export function squidIcon() {
    const t = document.createElement("template");
    t.innerHTML = SQUID; // constant string defined above, no external input
    return t.content.firstElementChild;
}
