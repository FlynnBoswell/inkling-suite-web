import { childrenOf, makeExport, planImport } from "./model.js";
/**
 * Words people actually said are never rewritten in place: a saved quote's text and an interview's original
 * transcript are locked. Corrections are recorded as new records that point back to the original.
 */
export function assertIntegrity(before, after) {
    if (!before)
        return;
    if (before.kind === "quote" && after.kind === "quote" && before.title !== after.title)
        throw new Error("A saved quote's wording cannot be changed. Use “Correct wording” to record a corrected version alongside the original.");
    if (before.kind === "interview" && after.kind === "interview" && before.transcriptOriginal && before.transcriptOriginal !== after.transcriptOriginal)
        throw new Error("The original transcript is locked once saved. Make changes in the edited copy.");
}
export class MemoryBackend {
    m = new Map();
    async all() { return [...this.m.values()].map((r) => structuredClone(r)); }
    async putMany(recs) { for (const r of recs)
        this.m.set(r.id, structuredClone(r)); }
    async deleteMany(ids) { for (const id of ids)
        this.m.delete(id); }
}
/**
 * The Suite's record store: one place for saving, Trash and import/export, shared by every tool.
 * Keeps an in-memory copy for fast reads and notifies listeners after each successful write.
 */
export class SuiteStore {
    backend;
    cache = [];
    listeners = new Set();
    constructor(backend) {
        this.backend = backend;
    }
    async load() { this.cache = await this.backend.all(); this.emit(); }
    records() { return this.cache; }
    get(id) { return this.cache.find((r) => r.id === id); }
    onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
    emit() { for (const fn of this.listeners)
        fn(); }
    /** Save new or edited records. `updatedAt` is stamped here so sync and import can tell which copy is newer. */
    async save(...recs) {
        for (const r of recs)
            assertIntegrity(this.get(r.id), r);
        const t = Date.now();
        const stamped = recs.map((r) => ({ ...r, updatedAt: Math.max(t, r.updatedAt + 1) }));
        // The in-memory copy changes straight away, so a second quick action (two taps at a match) reads this save rather
        // than the version before it and cannot overwrite it. If the write fails, these records go back as they were.
        const ids = new Set(stamped.map((r) => r.id));
        const before = this.cache.filter((r) => ids.has(r.id));
        this.cache = [...this.cache.filter((r) => !ids.has(r.id)), ...stamped];
        try {
            await this.backend.putMany(stamped);
        }
        catch (e) {
            // Put back the earlier version of each record, unless a newer save has replaced ours in the meantime.
            const mine = new Set(stamped);
            this.cache = this.cache.flatMap((r) => {
                if (!mine.has(r))
                    return [r];
                const old = before.find((b) => b.id === r.id);
                return old ? [old] : [];
            });
            throw e;
        }
        this.emit();
        return stamped;
    }
    /** Move to Trash. A project takes its notes and tasks with it, all marked with the same time so they restore together. */
    async trash(id) {
        const rec = this.get(id);
        if (!rec || rec.deletedAt)
            return;
        const t = Date.now();
        const group = rec.kind === "project" ? [rec, ...childrenOf(this.cache, rec.id).filter((c) => !c.deletedAt)] : [rec];
        await this.save(...group.map((r) => ({ ...r, deletedAt: t })));
    }
    async restore(id) {
        const rec = this.get(id);
        if (!rec?.deletedAt)
            return;
        const when = rec.deletedAt;
        const group = rec.kind === "project" ? [rec, ...childrenOf(this.cache, rec.id).filter((c) => c.deletedAt === when)] : [rec];
        // Restoring a note or task whose project is in the Trash restores the project too, so nothing is orphaned.
        if (rec.kind !== "project" && rec.kind !== "brand") {
            const p = this.get(rec.projectId);
            if (p?.deletedAt)
                group.push(p);
        }
        await this.save(...group.map((r) => { const { deletedAt: _d, ...rest } = r; return rest; }));
    }
    trashed() { return this.cache.filter((r) => r.deletedAt).sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0)); }
    /** Permanently delete everything in the Trash. */
    async emptyTrash() {
        const ids = this.trashed().map((r) => r.id);
        await this.backend.deleteMany(ids);
        const gone = new Set(ids);
        this.cache = this.cache.filter((r) => !gone.has(r.id));
        this.emit();
        return ids.length;
    }
    /** Permanently delete all data. */
    async deleteAll() {
        await this.backend.deleteMany(this.cache.map((r) => r.id));
        this.cache = [];
        this.emit();
    }
    exportAll(preferences) { return makeExport([...this.cache], preferences); }
    /** Validate first, then write in one go. Nothing is written if the file itself is unusable. */
    async importFile(json) {
        const plan = planImport(json, new Map(this.cache.map((r) => [r.id, r])));
        plan.put = plan.put.filter((r) => { try {
            assertIntegrity(this.get(r.id), r);
            return true;
        }
        catch (e) {
            plan.errors.push(`${r.id}: ${e.message}`);
            plan.updated--;
            return false;
        } });
        if (plan.put.length) {
            await this.backend.putMany(plan.put);
            const ids = new Set(plan.put.map((r) => r.id));
            this.cache = [...this.cache.filter((r) => !ids.has(r.id)), ...plan.put];
            this.emit();
        }
        return plan;
    }
}
