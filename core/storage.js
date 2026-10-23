export class MemoryKV {
    data = new Map();
    failWrites = false;
    async get(k) { return this.data.has(k) ? structuredClone(this.data.get(k)) : undefined; }
    async set(k, v) { if (this.failWrites)
        throw new Error("write failed"); this.data.set(k, structuredClone(v)); }
    async remove(k) { this.data.delete(k); }
}
export class ChromeKV {
    async get(k) { return (await chrome.storage.local.get(k))[k]; }
    async set(k, v) { await chrome.storage.local.set({ [k]: v }); }
    async remove(k) { await chrome.storage.local.remove(k); }
}
import { parseSettings } from "./settings.js";
import { parseProfile } from "./profile.js";
export const KEYS = { settings: "inkling.settings", profile: "inkling.profile", docs: "inkling.docs" };
export async function loadSettings(kv) { return parseSettings(await kv.get(KEYS.settings)); }
export async function loadProfile(kv) { return parseProfile(await kv.get(KEYS.profile)); }
/** Resolves only after the write succeeded. Callers must not show "saved" before this returns. */
export async function saveSettings(kv, s) { await kv.set(KEYS.settings, { ...s, updatedAt: Date.now() }); }
export async function saveProfile(kv, p) { await kv.set(KEYS.profile, { ...p, updatedAt: Date.now() }); }
