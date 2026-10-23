import { exportPrefs } from "./prefs.js";
import { getRecording, recordingIds, saveRecording } from "./audio.js";
/**
 * Free automatic backup: after each change the Suite writes one backup file into a folder the writer picks.
 * Pick a OneDrive, iCloud or Google Drive folder and the file is copied to the cloud and other devices by that
 * service, where it can be imported. Uses Chrome/Edge's File System Access API; nothing goes through Inkling.
 */
const FILE = "inkling-suite-backup.json";
let handle = null;
let timer;
export let lastBackup = null;
const supported = () => typeof window.showDirectoryPicker === "function";
function settingsDb() {
    return new Promise((res, rej) => { const r = indexedDB.open("inkling-suite-settings", 1); r.onupgradeneeded = () => r.result.createObjectStore("kv"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
async function kv(op, value) {
    const db = await settingsDb();
    return new Promise((res, rej) => {
        const t = db.transaction("kv", op === "get" ? "readonly" : "readwrite");
        const s = t.objectStore("kv");
        const r = op === "get" ? s.get("backupFolder") : op === "put" ? s.put(value, "backupFolder") : s.delete("backupFolder");
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
    });
}
export const backupSupported = supported;
export const backupFolderName = () => (handle ? handle.name || "your folder" : null);
/** Restore the chosen folder after a reload. Writing may need the writer's permission again (asked on the next click). */
export async function initBackupFolder(store) {
    if (!supported())
        return;
    try {
        handle = (await kv("get")) ?? null;
    }
    catch {
        handle = null;
    }
    // After Chrome restarts it asks again before writing: say so straight away, not only after the next change.
    if (handle && (await handle.queryPermission?.({ mode: "readwrite" })) !== "granted")
        lastBackup = { at: Date.now(), error: "Chrome needs your permission again to write to the backup folder." };
    store.onChange(() => { if (!handle)
        return; window.clearTimeout(timer); timer = window.setTimeout(() => void writeBackup(store), 4000); });
}
export async function chooseBackupFolder(store) {
    if (!supported())
        throw new Error("Automatic backup to a folder needs Chrome or Edge on a computer.");
    handle = await window.showDirectoryPicker({ id: "inkling-backup", mode: "readwrite" });
    await kv("put", handle);
    await writeBackup(store, true);
    return handle.name;
}
export async function stopBackupFolder() { handle = null; lastBackup = null; await kv("delete"); }
const EXT = { "audio/webm": "webm", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/wav": "wav", "audio/x-wav": "wav" };
const extOf = (type) => EXT[type.split(";")[0].trim()] ?? "audio";
/** Interview recordings go into a "recordings" folder beside the backup file, one file per interview, copied once. */
async function copyRecordings(dir) {
    const ids = await recordingIds();
    if (!ids.length)
        return;
    const rec = await dir.getDirectoryHandle("recordings", { create: true });
    const have = new Map();
    for await (const [name, h] of rec.entries())
        if (h.kind === "file")
            have.set(name, (await h.getFile()).size);
    for (const id of ids) {
        const blob = await getRecording(id);
        if (!blob)
            continue;
        const name = `${id}.${extOf(blob.type)}`;
        if (have.get(name) === blob.size)
            continue; // already there
        const w = await (await rec.getFileHandle(name, { create: true })).createWritable();
        await w.write(blob);
        await w.close();
    }
}
/** Put recordings from the backup folder back into this browser, for interviews that are here but have no recording. */
export async function restoreRecordings(interviewIds) {
    if (!handle)
        throw new Error("Choose the backup folder first.");
    const h = handle;
    if ((await h.requestPermission?.({ mode: "readwrite" })) !== "granted")
        throw new Error("Chrome needs your permission to read the backup folder.");
    let rec;
    try {
        rec = await handle.getDirectoryHandle("recordings");
    }
    catch {
        return 0;
    }
    const local = new Set(await recordingIds());
    const wanted = new Set(interviewIds.filter((id) => !local.has(id)));
    let n = 0;
    for await (const [name, fh] of rec.entries()) {
        const id = name.replace(/\.[a-z0-9]+$/i, "");
        if (fh.kind !== "file" || !wanted.has(id))
            continue;
        const file = await fh.getFile();
        const type = Object.entries(EXT).find(([, e]) => name.endsWith("." + e))?.[0] ?? file.type;
        await saveRecording(id, new Blob([file], { type }));
        n++;
    }
    return n;
}
/** True when backups are set up but paused until the writer gives Chrome permission again (after a restart). */
export const backupPaused = () => !!handle && !!lastBackup?.error;
export async function writeBackup(store, interactive = false) {
    if (!handle)
        return false;
    try {
        const h = handle;
        let perm = await h.queryPermission?.({ mode: "readwrite" });
        if (perm !== "granted" && interactive)
            perm = await h.requestPermission?.({ mode: "readwrite" });
        if (perm !== "granted") {
            lastBackup = { at: Date.now(), error: "Chrome needs your permission again to write to the backup folder." };
            return false;
        }
        const f = await handle.getFileHandle(FILE, { create: true });
        const w = await f.createWritable();
        await w.write(JSON.stringify(store.exportAll(exportPrefs()), null, 1));
        await w.close();
        await copyRecordings(handle);
        lastBackup = { at: Date.now() };
        return true;
    }
    catch (e) {
        lastBackup = { at: Date.now(), error: `Backup failed: ${e.message}` };
        return false;
    }
}
