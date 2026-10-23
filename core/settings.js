import { isAnalysable } from "./languages.js";
import { TONES, WRITING_MODES } from "./types.js";
export const DEFAULT_SETTINGS = {
    schema: 1, enabled: true, language: "en-GB", mode: "general", tone: "neutral", intensity: "balanced",
    excludedSites: [], enabledSites: [], dictionary: [], ai: { enabled: false, endpoint: "", token: "" }, grammar: { enabled: false, endpoint: "http://127.0.0.1:8081" }, syncEnabled: false, updatedAt: 0,
};
const strList = (v) => (Array.isArray(v) ? [...new Set(v.filter((x) => typeof x === "string" && x.length > 0 && x.length < 200))] : []);
/** Validate whatever is in storage and fall back to safe defaults field by field. */
export function parseSettings(raw) {
    const d = DEFAULT_SETTINGS;
    if (typeof raw !== "object" || raw === null)
        return { ...d, excludedSites: [], enabledSites: [], dictionary: [], ai: { ...d.ai }, grammar: { ...d.grammar } };
    const o = raw;
    const ai = typeof o.ai === "object" && o.ai ? o.ai : {};
    const gr = typeof o.grammar === "object" && o.grammar ? o.grammar : {};
    return {
        schema: 1,
        enabled: typeof o.enabled === "boolean" ? o.enabled : d.enabled,
        language: typeof o.language === "string" && isAnalysable(o.language) ? o.language : d.language,
        mode: WRITING_MODES.some((m) => m.id === o.mode) ? o.mode : d.mode,
        tone: TONES.includes(o.tone) ? o.tone : d.tone,
        intensity: ["minimal", "balanced", "thorough"].includes(o.intensity) ? o.intensity : d.intensity,
        excludedSites: strList(o.excludedSites).map(normaliseHost),
        enabledSites: strList(o.enabledSites).map(normaliseHost),
        dictionary: strList(o.dictionary).slice(0, 5000),
        ai: { enabled: ai.enabled === true, endpoint: typeof ai.endpoint === "string" ? ai.endpoint : "", token: typeof ai.token === "string" ? ai.token : "" },
        grammar: { enabled: gr.enabled === true, endpoint: typeof gr.endpoint === "string" && /^https?:\/\//.test(gr.endpoint) ? gr.endpoint.replace(/\/$/, "") : d.grammar.endpoint },
        syncEnabled: o.syncEnabled === true,
        updatedAt: typeof o.updatedAt === "number" && o.updatedAt > 0 ? o.updatedAt : 0,
    };
}
export function normaliseHost(h) {
    return h.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
}
export function hostMatches(list, hostname) {
    const h = normaliseHost(hostname);
    return list.some((x) => h === x || h.endsWith("." + x));
}
export function isSiteActive(s, hostname, requireGrant) {
    if (!s.enabled)
        return false;
    if (hostMatches(s.excludedSites, hostname))
        return false;
    if (requireGrant && !hostMatches(s.enabledSites, hostname))
        return false;
    return true;
}
export function addDictionaryWord(s, word) {
    const w = word.trim();
    if (!w || w.length > 60 || /\s{2,}/.test(w))
        return s;
    if (s.dictionary.some((x) => x.toLowerCase() === w.toLowerCase()))
        return s;
    return { ...s, dictionary: [...s.dictionary, w] };
}
/**
 * Chrome match patterns for a host. A subdomain wildcard ("*.host") is only valid for real domain names,
 * so IP addresses and single-label hosts such as "localhost" get just the exact host.
 */
export function sitePatterns(host) {
    const h = normaliseHost(host);
    const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(":");
    if (isIp || !h.includes("."))
        return [`*://${h}/*`];
    return [`*://${h}/*`, `*://*.${h}/*`];
}
/**
 * Hosts whose frames hold the real editor for a site. Word for the web on SharePoint/OneDrive edits inside a
 * cross-origin Microsoft frame, so enabling the document site must also cover that frame.
 */
export function companionHosts(host) {
    const h = normaliseHost(host);
    if (h === "sharepoint.com" || h.endsWith(".sharepoint.com") || h === "onedrive.live.com" || h === "office.com" || h.endsWith(".office.com") || h === "m365.cloud.microsoft")
        return ["officeapps.live.com"];
    return [];
}
/** Every host to request and register when the writer enables `host`. */
export function hostsToEnable(host) {
    return [normaliseHost(host), ...companionHosts(host)];
}
/**
 * Hosts named by newly granted site patterns (the exact-host `*://host/*` form that sitePatterns produces).
 * The AI server permission is requested as `http(s)://host:port/*`, so it is never mistaken for a site.
 */
export function hostsFromGrantedOrigins(origins) {
    const out = new Set();
    for (const o of origins ?? []) {
        const m = /^\*:\/\/([^/*]+)\/\*$/.exec(o);
        if (m)
            out.add(normaliseHost(m[1]));
    }
    return [...out];
}
