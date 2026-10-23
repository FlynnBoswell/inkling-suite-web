import { MODE_TYPES, PERMITTED_LICENCES, validateKnowledgeItem } from "./schema.js";
const STALE_DAYS = 365;
function primary(lang) { return lang.split("-")[0].toLowerCase(); }
function defaultRegion(lang) { return lang.split("-")[1]?.toUpperCase(); }
/**
 * The global editorial knowledge base (System A in the spec).
 * It never contains user writing. Personal data lives in the style profile (System B).
 */
export class KnowledgeBase {
    items = new Map();
    log = [];
    /** New material always enters as "pending" and is invisible to retrieval until approved. */
    ingest(candidate, by = "ingest") {
        const v = validateKnowledgeItem(candidate);
        const now = new Date().toISOString();
        if (!v.ok) {
            this.log.push({ at: now, itemId: String(candidate?.id ?? "?"), action: "rejected", by, reason: v.errors.join("; ") });
            return { ok: false, reason: "invalid", errors: v.errors };
        }
        if (!PERMITTED_LICENCES.includes(v.item.licence.status)) {
            const reason = `Licence status "${v.item.licence.status}" is not permitted. The source is excluded until its permitted use is established.`;
            this.log.push({ at: now, itemId: v.item.id, action: "rejected", by, reason });
            return { ok: false, reason: "licence-not-permitted", errors: [reason] };
        }
        this.items.set(v.item.id, v.item);
        this.log.push({ at: now, itemId: v.item.id, action: "ingested", by });
        return { ok: true, item: v.item };
    }
    approve(id, reviewer) {
        const it = this.items.get(id);
        if (!it || it.status === "withdrawn")
            return false;
        it.status = "approved";
        it.reviewedBy = reviewer;
        it.reviewedAt = new Date().toISOString();
        this.log.push({ at: it.reviewedAt, itemId: id, action: "approved", by: reviewer });
        return true;
    }
    /** Corrections go back to review. Faulty guidance is never silently edited in place. */
    update(id, patch, by, reason) {
        const it = this.items.get(id);
        if (!it)
            return null;
        const merged = { ...it, ...patch, id, version: it.version + 1 };
        const v = validateKnowledgeItem(merged);
        if (!v.ok)
            return { ok: false, reason: "invalid", errors: v.errors };
        if (!PERMITTED_LICENCES.includes(v.item.licence.status))
            return { ok: false, reason: "licence-not-permitted", errors: ["Licence not permitted."] };
        this.items.set(id, v.item);
        this.log.push({ at: new Date().toISOString(), itemId: id, action: "updated", by, reason });
        return { ok: true, item: v.item };
    }
    withdraw(id, by, reason) {
        const it = this.items.get(id);
        if (!it)
            return false;
        it.status = "withdrawn";
        this.log.push({ at: new Date().toISOString(), itemId: id, action: "withdrawn", by, reason });
        return true;
    }
    get(id) { const i = this.items.get(id); return i ? { ...i } : undefined; }
    all() { return [...this.items.values()].map((i) => ({ ...i })); }
    history() { return [...this.log]; }
    isStale(it, now = new Date()) {
        if (it.durability !== "time-sensitive")
            return false;
        return now.getTime() - Date.parse(it.reviewedAt) > STALE_DAYS * 86_400_000;
    }
    retrieve(q) {
        const want = MODE_TYPES[q.mode];
        const lang = primary(q.language);
        const region = q.region ?? defaultRegion(q.language);
        const now = q.now ?? new Date();
        const scored = [];
        for (const it of this.items.values()) {
            if (it.status !== "approved")
                continue;
            if (primary(it.language) !== lang)
                continue; // never apply another language's guidance
            if (it.region && it.region !== region)
                continue; // regional rules only when relevant
            if (!q.includeStale && this.isStale(it, now))
                continue;
            const idx = it.journalismTypes.map((t) => want.indexOf(t)).filter((i) => i >= 0);
            if (idx.length === 0)
                continue;
            const specificity = 10 - Math.min(...idx) * 3;
            scored.push({ it, score: specificity + it.confidence + (it.region ? 0.5 : 0) });
        }
        scored.sort((a, b) => b.score - a.score || a.it.id.localeCompare(b.it.id));
        return scored.slice(0, q.limit ?? 6).map((s) => ({ ...s.it }));
    }
    toJSON() { return { items: this.all(), history: this.history() }; }
}
