import { parseRecord } from "../core/suite/model.js";
/** IndexedDB backend: one object store of records keyed by id. Data stays in this browser on this device. */
export class IdbBackend {
    db;
    constructor(db) {
        this.db = db;
    }
    static open(name = "inkling-suite") {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(name, 1);
            req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains("records"))
                req.result.createObjectStore("records", { keyPath: "id" }); };
            req.onsuccess = () => resolve(new IdbBackend(req.result));
            req.onerror = () => reject(req.error ?? new Error("Could not open the browser database."));
            req.onblocked = () => reject(new Error("The database is in use by an older Inkling Suite tab. Close other tabs and reload."));
        });
    }
    tx(mode, fn) {
        return new Promise((resolve, reject) => {
            const t = this.db.transaction("records", mode);
            let out;
            const r = fn(t.objectStore("records"));
            if (r)
                r.onsuccess = () => { out = r.result; };
            t.oncomplete = () => resolve(out); // resolves only once the write is durable
            t.onerror = () => reject(t.error ?? new Error("The browser database refused the change."));
            t.onabort = () => reject(t.error ?? new Error("The change was cancelled (storage may be full)."));
        });
    }
    async all() {
        const raw = (await this.tx("readonly", (s) => s.getAll())) ?? [];
        return raw.map(parseRecord).flatMap((r) => (r.ok ? [r.rec] : [])); // never trust stored data blindly
    }
    async putMany(recs) { await this.tx("readwrite", (s) => { for (const r of recs)
        s.put(r); }); }
    async deleteMany(ids) { await this.tx("readwrite", (s) => { for (const id of ids)
        s.delete(id); }); }
}
