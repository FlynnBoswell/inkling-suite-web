import { h } from "../extension/dom.js";
import { live } from "../core/suite/model.js";
import { app, empty, field, go, persist, section, setStatus, today } from "./ui.js";
import { aiHealth, aiSettings, saveAiSettings } from "./ai.js";
import { blueskyAccount, blueskyConnect, blueskyDisconnect, BlueskyError } from "./bluesky.js";
import { backupFolderName, backupPaused, backupSupported, chooseBackupFolder, lastBackup, restoreRecordings, stopBackupFolder, writeBackup } from "./backup-folder.js";
import { storageSection } from "./storage.js";
import { exportPrefs, importPrefs, myWords, removeWord } from "./prefs.js";
/** Settings: storage, the AI connection, backups, the Inkling dictionary, Bluesky, export and import, and the Trash. */
const KIND_LABEL = { project: "Project", note: "Note", task: "Task", source: "Source", claim: "Claim", interview: "Interview", quote: "Quote", draft: "Draft", graphic: "Graphic", post: "Post", campaign: "Campaign", brand: "Brand kit", match: "Match" };
let lastImport = null;
export function settingsPage() {
    const file = h("input", { type: "file", accept: "application/json,.json", "aria-label": "Choose an export file" });
    const importResult = h("div", { role: "status" }, ...(lastImport ? [lastImport] : []));
    lastImport = null;
    const trashed = app.store.trashed();
    const storageInfo = h("p", { class: "hint" }, "Checking storage…");
    void (async () => {
        try {
            const persisted = await navigator.storage?.persisted?.();
            const est = await navigator.storage?.estimate?.();
            storageInfo.textContent = `${est?.usage !== undefined ? `Using ${(est.usage / 1024).toFixed(0)} KB. ` : ""}${persisted ? "The browser has agreed to keep this data even when space is low." : "The browser may clear this data if the device runs short of space. Keep exports as backups."}`;
        }
        catch {
            storageInfo.textContent = "Storage details are not available in this browser.";
        }
    })();
    const count = (k, one, many = one + "s") => { const n = app.store.records().filter((r) => r.kind === k && live(r)).length; return `${n} ${n === 1 ? one : many}`; };
    return h("div", null, h("h1", null, "Settings and data"), section("Where your data is", h("p", null, `This device holds ${count("project", "project")}, ${count("note", "note")}, ${count("task", "task")}, ${count("source", "source")}, ${count("claim", "claim")}, ${count("interview", "interview")}, ${count("quote", "quote")}, ${count("draft", "draft")}, ${count("graphic", "graphic")}, ${count("match", "match", "matches")} and ${count("post", "social post")}, stored in this browser only. Nothing is sent to any server.`), storageInfo, h("button", { type: "button", onClick: async () => { const ok = await navigator.storage?.persist?.(); setStatus(ok ? "The browser will keep your data." : "The browser declined. Keep regular exports.", ok ? "ok" : "err"); go("#/settings"); } }, "Ask the browser to keep my data")), storageSection(), aiSettingsSection(), backupFolderSection(), dictionarySection(), blueskySection(), section("Export (backup)", h("p", null, "Downloads one file with all your records, including the Trash."), h("button", { class: "primary", type: "button", onClick: () => {
            const blob = new Blob([JSON.stringify(app.store.exportAll(exportPrefs()), null, 2)], { type: "application/json" });
            const a = h("a", { href: URL.createObjectURL(blob), download: `inkling-suite-backup-${today()}.json` });
            document.body.append(a);
            a.click();
            a.remove();
            setStatus("Export file created");
        } }, "Export all data")), section("Import", h("p", null, "Adds records from an export file. Records you already have are kept unless the file’s copy is newer. Nothing is duplicated."), h("div", { class: "row" }, file, h("button", { type: "button", onClick: async () => {
            const f = file.files?.[0];
            if (!f) {
                importResult.textContent = "Choose a file first.";
                return;
            }
            let json;
            try {
                json = JSON.parse(await f.text());
            }
            catch {
                importResult.replaceChildren(h("p", { class: "status err" }, "That file is not valid JSON, so nothing was imported."));
                return;
            }
            // Kept across the re-render that follows the save, so the result stays on screen.
            const show = (plan) => h("div", { class: "status " + (plan.errors.length ? "err" : "ok") }, h("p", null, `Added ${plan.added}, updated ${plan.updated}, already up to date ${plan.unchanged}.`), ...(plan.errors.length ? [h("p", null, `${plan.errors.length} problem${plan.errors.length > 1 ? "s" : ""}:`), h("ul", null, ...plan.errors.slice(0, 20).map((e) => h("li", null, e)))] : []));
            await persist(async () => { const p = await app.store.importFile(json); const words = p.errors.length && !p.put.length && !p.unchanged ? 0 : importPrefs(json); lastImport = h("div", null, show(p), words ? h("p", { class: "status ok" }, `Added ${words} word${words === 1 ? "" : "s"} to your Inkling dictionary.`) : null); return p; }, "Import finished");
        } }, "Import file")), importResult), section(`Trash (${trashed.length})`, trashed.length ? h("ul", { class: "items" }, ...trashed.map((r) => h("li", null, h("span", null, `${KIND_LABEL[r.kind]}: ${r.title}`), h("button", { type: "button", class: "small", onClick: () => void persist(() => app.store.restore(r.id), "Restored") }, "Restore")))) : empty("The Trash is empty."), trashed.length ? h("button", { class: "danger", type: "button", onClick: async () => { if (!confirm(`Permanently delete ${trashed.length} item(s)? This cannot be undone.`))
            return; await persist(() => app.store.emptyTrash(), "Trash emptied"); } }, "Empty Trash") : null), section("Delete everything", h("p", null, "Permanently removes all your records from this browser. Export first if you might want them back."), h("button", { class: "danger", type: "button", onClick: async () => { if (prompt("Type DELETE to permanently remove all your Inkling Suite data from this browser.") !== "DELETE") {
            setStatus("Nothing was deleted.");
            return;
        } await persist(() => app.store.deleteAll(), "All data deleted"); go("#/"); } }, "Delete all data")));
}
function backupFolderSection() {
    const result = h("p", { role: "status" });
    const name = backupFolderName();
    const info = !backupSupported() ? "Needs Chrome or Edge on a computer." : name ? `Backing up to the folder “${name}”${lastBackup ? (lastBackup.error ? `. ${lastBackup.error}` : `, last at ${new Date(lastBackup.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`) : ""}.` : "Off.";
    return section("Automatic backup and sync (free)", h("p", null, "Choose a folder and the Suite saves a backup file there a few seconds after every change, with your Inkling dictionary and a copy of each interview recording. Choose a folder inside OneDrive, iCloud Drive or Google Drive and it is also copied to the cloud, so you can import it on another device (Import, below)."), h("p", { class: name ? "status ok" : "hint" }, info), h("div", { class: "row" }, h("button", { type: "button", class: name ? "" : "primary", disabled: !backupSupported(), onClick: async () => { try {
            const n = await chooseBackupFolder(app.store);
            setStatus(`Backing up to “${n}”`);
            go("#/settings");
        }
        catch (e) {
            if (e.name !== "AbortError") {
                result.textContent = e.message;
                result.className = "status err";
            }
        } } }, name ? "Change folder" : "Choose backup folder"), name ? h("button", { type: "button", onClick: async () => { const ok = await writeBackup(app.store, true); setStatus(ok ? "Backup written" : (lastBackup?.error ?? "Backup failed"), ok ? "ok" : "err"); go("#/settings"); } }, "Back up now") : null, name ? h("button", { type: "button", onClick: async () => {
            try {
                const n = await restoreRecordings(app.store.records().filter((r) => r.kind === "interview" && live(r)).map((r) => r.id));
                setStatus(n ? `${n} recording${n === 1 ? "" : "s"} restored` : "No missing recordings found in the backup folder");
            }
            catch (e) {
                setStatus(e.message, "err");
            }
        } }, "Restore recordings") : null, name ? h("button", { type: "button", onClick: async () => { await stopBackupFolder(); setStatus("Automatic backup turned off"); go("#/settings"); } }, "Turn off") : null), result);
}
/** On the dashboard: a plain warning while work exists only in this browser, or while backups wait for permission. */
export function backupNudge() {
    if (!backupSupported() || !app.store.records().some((r) => r.kind === "project"))
        return null;
    if (!backupFolderName())
        return h("div", { class: "notice warn", role: "note" }, h("p", null, h("strong", null, "Your work is only saved in this browser. "), "If the browser's data is cleared it is gone. Turn on free automatic backup to a OneDrive folder: it takes a minute."), h("button", { type: "button", class: "primary small", onClick: () => go("#/settings") }, "Set up backup"));
    if (backupPaused())
        return h("div", { class: "notice warn", role: "note" }, h("p", null, h("strong", null, "Backup paused. "), lastBackup?.error ?? ""), h("button", { type: "button", class: "primary small", onClick: async () => { const ok = await writeBackup(app.store, true); setStatus(ok ? "Backup written" : (lastBackup?.error ?? "Backup failed"), ok ? "ok" : "err"); app.render(); } }, "Allow and back up now"));
    return null;
}
function dictionarySection() {
    const words = myWords().sort((a, b) => a.localeCompare(b));
    return section("Inkling dictionary", h("p", null, "Words you told Inkling are spelled correctly (names, places, football terms). They are included in exports and automatic backups."), words.length ? h("ul", { class: "word-list" }, ...words.map((w) => h("li", null, w, h("button", { type: "button", class: "small", "aria-label": `Remove “${w}” from the dictionary`, onClick: () => { removeWord(w); setStatus(`“${w}” removed`); go("#/settings"); } }, "×")))) : empty("No words yet. Use “Add to dictionary” on a spelling suggestion in Inkling."));
}
function blueskySection() {
    const acct = blueskyAccount();
    const handle = h("input", { type: "text", placeholder: "yourname.bsky.social", "aria-label": "Bluesky handle", autocomplete: "off" });
    const pw = h("input", { type: "password", placeholder: "xxxx-xxxx-xxxx-xxxx", "aria-label": "Bluesky app password", autocomplete: "off" });
    const result = h("p", { role: "status" });
    return section("Bluesky (free posting and figures)", h("p", null, "Bluesky is free and lets Inkling publish posts you approve and read their likes, reposts and replies. Other platforms (X, Instagram, Facebook) charge for or restrict this, so Ripple prepares posts for you to publish there yourself."), acct ? h("div", null, h("p", { class: "status ok" }, `Connected as @${acct.handle}.`), h("button", { type: "button", onClick: () => { blueskyDisconnect(); setStatus("Bluesky disconnected"); go("#/settings"); } }, "Disconnect"))
        : h("form", { onSubmit: async (e) => {
                e.preventDefault();
                result.textContent = "Connecting…";
                result.className = "hint";
                try {
                    const r = await blueskyConnect(handle.value.trim(), pw.value);
                    pw.value = "";
                    setStatus(`Connected to Bluesky as @${r.handle}`);
                    go("#/settings");
                }
                catch (err) {
                    result.textContent = err instanceof BlueskyError ? err.message : "Could not connect.";
                    result.className = "status err";
                }
            } }, h("p", { class: "hint" }, "Use an app password (Bluesky › Settings › Privacy and security › App passwords), never your main password. Inkling keeps only the sign-in session in this browser."), h("div", { class: "grid tight" }, field("Handle", handle), field("App password", pw)), h("button", { type: "submit" }, "Connect"), result));
}
function aiSettingsSection() {
    const s = aiSettings();
    const ep = h("input", { type: "url", value: s.endpoint, "aria-label": "AI server address" });
    const tk = h("input", { type: "password", value: s.token, autocomplete: "off", "aria-label": "AI server access token" });
    const result = h("p", { role: "status" });
    const test = async () => {
        saveAiSettings({ endpoint: ep.value.trim() || "http://127.0.0.1:8787", token: tk.value.trim() });
        result.textContent = "Connecting… (the first time can take a few seconds while the free AI starts)";
        result.className = "hint";
        const r = await aiHealth();
        result.textContent = r.message;
        result.className = "status " + (r.ok ? "ok" : "err");
        tk.value = aiSettings().token;
    };
    return section("AI assistant", h("p", null, "AI helps in every tool: research in Sleuth, interview questions in Quill, editing feedback in Inkling, design reviews and alt text in Pixel, and posts in Ripple. It runs free on this laptop. Nothing is sent until you press an AI button, and every AI result is labelled for you to check."), h("ol", { class: "steps" }, h("li", null, "On your laptop, open the InklingSuite folder and double-click “Start Inkling”. Leave its window open (it can be minimised)."), h("li", null, "Press “Connect to the AI” below. ", location.protocol === "https:" ? "If Chrome asks to let this site access devices on your network, click Allow." : "")), h("div", { class: "row" }, h("button", { type: "button", class: "primary", onClick: test }, "Connect to the AI")), result, h("details", null, h("summary", null, "Advanced"), h("p", { class: "hint" }, "The address and access token are filled in automatically when you connect. For better results you can add a paid Anthropic API key to the .env file in the InklingSuite folder (set a monthly spending limit first); the AI server then uses Claude instead of the free local model."), field("Server address", ep), field("Access token (filled in automatically)", tk)));
}
