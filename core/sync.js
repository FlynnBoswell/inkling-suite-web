import { parseProfile } from "./profile.js";
import { parseSettings } from "./settings.js";
import { KEYS } from "./storage.js";
const PREFIX = "inkling.sync.";
const CHUNK = 6000; // chrome.storage.sync allows 8 KB per item
export const SYNC_LIMIT_BYTES = 90_000; // the area allows ~100 KB in total
export class MemorySync {
    data = new Map();
    failSet = false;
    async get(keys) { const out = {}; const want = keys == null ? [...this.data.keys()] : Array.isArray(keys) ? keys : [keys]; for (const k of want)
        if (this.data.has(k))
            out[k] = structuredClone(this.data.get(k)); return out; }
    async set(items) { if (this.failSet)
        throw new Error("QUOTA_BYTES exceeded"); for (const [k, v] of Object.entries(items))
        this.data.set(k, structuredClone(v)); }
    async remove(keys) { for (const k of Array.isArray(keys) ? keys : [keys])
        this.data.delete(k); }
}
/** The part of Settings that may leave this device. */
export function syncableSettings(s) {
    const { ai: _ai, grammar: _g, enabledSites: _e, syncEnabled: _s, ...rest } = s;
    void _ai;
    void _g;
    void _e;
    void _s;
    return rest;
}
function chunk(text) { const out = []; for (let i = 0; i < text.length; i += CHUNK)
    out.push(text.slice(i, i + CHUNK)); return out.length ? out : [""]; }
async function writePart(area, part, value, at, meta) {
    const pieces = chunk(JSON.stringify(value));
    const old = part === "settings" ? meta.settingsChunks : meta.profileChunks;
    const items = {};
    pieces.forEach((p, i) => { items[`${PREFIX}${part}.${i}`] = p; });
    if (part === "settings") {
        meta.settingsAt = at;
        meta.settingsChunks = pieces.length;
    }
    else {
        meta.profileAt = at;
        meta.profileChunks = pieces.length;
    }
    items[`${PREFIX}meta`] = meta;
    await area.set(items);
    if (old > pieces.length)
        await area.remove(Array.from({ length: old - pieces.length }, (_, i) => `${PREFIX}${part}.${pieces.length + i}`));
}
async function readPart(area, part, meta) {
    const n = part === "settings" ? meta.settingsChunks : meta.profileChunks;
    if (!n)
        return null;
    const got = await area.get(Array.from({ length: n }, (_, i) => `${PREFIX}${part}.${i}`));
    let text = "";
    for (let i = 0; i < n; i++) {
        const c = got[`${PREFIX}${part}.${i}`];
        if (typeof c !== "string")
            return null;
        text += c;
    }
    try {
        return JSON.parse(text);
    }
    catch {
        return null;
    }
}
/**
 * One full round: compare timestamps, pull what is newer remotely, push what is newer locally.
 * Never throws: failures come back as { ok: false, message } and local data is left untouched.
 */
export async function syncRound(local, area, opts = {}) {
    const result = { ok: true, pushed: [], pulled: [], message: "" };
    try {
        const ls = parseSettings(await local.get(KEYS.settings));
        const lp = parseProfile(await local.get(KEYS.profile));
        const rawMeta = (await area.get(`${PREFIX}meta`))[`${PREFIX}meta`];
        const meta = { settingsAt: Number(rawMeta?.settingsAt) || 0, profileAt: Number(rawMeta?.profileAt) || 0, settingsChunks: Number(rawMeta?.settingsChunks) || 0, profileChunks: Number(rawMeta?.profileChunks) || 0 };
        // settings
        // A device that is just joining existing synced data adopts it instead of overwriting it with its own defaults.
        if (meta.settingsAt > ls.updatedAt || (opts.adoptRemote && meta.settingsChunks > 0)) {
            const remote = await readPart(area, "settings", meta);
            if (remote) {
                const r = parseSettings({ ...remote, ai: ls.ai, grammar: ls.grammar, enabledSites: ls.enabledSites, syncEnabled: true, updatedAt: meta.settingsAt });
                if (opts.adoptRemote) {
                    const n = r.dictionary.length;
                    r.dictionary = [...new Set([...r.dictionary, ...ls.dictionary])];
                    if (r.dictionary.length > n)
                        r.updatedAt = Date.now();
                } // joining: keep words typed here too, and send them back
                await local.set(KEYS.settings, r);
                result.pulled.push("settings");
            }
        }
        else if (ls.updatedAt > meta.settingsAt) {
            await writePart(area, "settings", syncableSettings(ls), ls.updatedAt, meta);
            result.pushed.push("settings");
        }
        // profile
        if (meta.profileAt > lp.updatedAt || (opts.adoptRemote && meta.profileChunks > 0)) {
            const remote = await readPart(area, "profile", meta);
            if (remote) {
                const p = parseProfile(remote);
                p.updatedAt = meta.profileAt;
                await local.set(KEYS.profile, p);
                result.pulled.push("profile");
            }
        }
        else if (lp.updatedAt > meta.profileAt) {
            await writePart(area, "profile", lp, lp.updatedAt, meta);
            result.pushed.push("profile");
        }
        const total = JSON.stringify(await area.get(null)).length;
        if (total > SYNC_LIMIT_BYTES) {
            result.ok = false;
            result.message = "Your data is too large for Chrome sync, so it was not synced. Remove unused dictionary words or reset the style profile.";
            return result;
        }
        result.message = result.pulled.length || result.pushed.length ? `Synced. Received: ${result.pulled.join(", ") || "nothing"}. Sent: ${result.pushed.join(", ") || "nothing"}.` : "Already up to date.";
        return result;
    }
    catch (e) {
        return { ok: false, pushed: [], pulled: [], message: "Sync failed, so nothing was changed on this device: " + String(e?.message ?? e) };
    }
}
/** Erase Inkling's synced copy (other devices keep their local data). */
export async function removeSyncedCopy(area) {
    const all = await area.get(null);
    const keys = Object.keys(all).filter((k) => k.startsWith(PREFIX));
    if (keys.length)
        await area.remove(keys);
}
