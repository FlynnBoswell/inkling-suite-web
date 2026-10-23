import { h } from "../extension/dom.js";
/**
 * Connection to the Inkling AI server running on this computer (started with “Start Inkling”). The provider API key lives
 * only in that server's .env file; the Suite holds the server address and the shared access token.
 * Nothing is sent until the writer presses an AI button.
 */
const KEY = "inkling-suite.ai";
export function aiSettings() {
    try {
        const v = JSON.parse(localStorage.getItem(KEY) ?? "{}");
        return { endpoint: typeof v.endpoint === "string" && v.endpoint ? v.endpoint : "http://127.0.0.1:8787", token: typeof v.token === "string" ? v.token : "" };
    }
    catch {
        return { endpoint: "http://127.0.0.1:8787", token: "" };
    }
}
export function saveAiSettings(s) { try {
    localStorage.setItem(KEY, JSON.stringify(s));
}
catch { /* private window: settings last for this visit only */ } }
export const aiReady = () => !!aiSettings().token;
export class AiFailure extends Error {
}
/** What to do when the AI server is not running. No terminal commands: the launcher does everything. */
export const START_HELP = "The AI isn't running. On your laptop, open the InklingSuite folder and double-click “Start Inkling” (leave its window open), then try again."
    + (typeof location !== "undefined" && location.protocol === "https:" ? " If Chrome asks to let this site access devices on your network, click Allow." : "");
const base = () => aiSettings().endpoint.replace(/\/$/, "");
/** Fetch the access token from the AI server on this computer (it only gives it to the Suite's own pages). */
export async function aiPair() {
    try {
        const r = await fetch(base() + "/v1/pair", { signal: AbortSignal.timeout(5000) });
        if (!r.ok)
            return "refused";
        const j = await r.json();
        if (typeof j?.token !== "string" || !j.token)
            return "refused";
        saveAiSettings({ ...aiSettings(), token: j.token });
        return "ok";
    }
    catch {
        return "unreachable";
    }
}
const REFUSED = "The AI server on this laptop is running but does not accept this web address. Use the Inkling website (flynnboswell.github.io/inkling-suite-web) or the one opened by “Start Inkling Suite”.";
/** Call one AI job. Errors come back as plain sentences the writer can act on. Connects by itself when it can. */
export async function ai(path, body, timeoutMs = 300_000) {
    if (!aiSettings().token) {
        const p = await aiPair();
        if (p !== "ok")
            throw new AiFailure(p === "refused" ? REFUSED : START_HELP);
    }
    for (let attempt = 0;; attempt++) {
        let r;
        try {
            r = await fetch(base() + path, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${aiSettings().token}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
        }
        catch (e) {
            throw new AiFailure(e?.name === "TimeoutError" ? "The AI took too long. Try again, perhaps with less text." : START_HELP);
        }
        // A new token (e.g. .env recreated): pair again once.
        if (r.status === 401 && attempt === 0 && (await aiPair()) === "ok")
            continue;
        let j = null;
        try {
            j = await r.json();
        }
        catch { /* not JSON */ }
        if (!r.ok) {
            const msg = j?.message ?? (r.status === 401 ? "The AI server did not accept this website. Open Settings › AI assistant and press “Connect to the AI”." : r.status === 429 ? "Too many AI requests. Wait a minute." : `The AI server returned an error (${r.status}).`);
            throw new AiFailure(msg);
        }
        return j;
    }
}
export async function aiHealth() {
    let j;
    try {
        j = await (await fetch(base() + "/health", { signal: AbortSignal.timeout(20_000) })).json();
    }
    catch {
        return { ok: false, message: START_HELP };
    }
    const paired = await aiPair();
    if (paired === "refused" && !aiSettings().token)
        return { ok: false, message: REFUSED };
    if (j.ready === false)
        return { ok: false, message: j.problem || "The AI is not ready." };
    try {
        const u = await fetch(base() + "/v1/usage", { headers: { authorization: `Bearer ${aiSettings().token}` }, signal: AbortSignal.timeout(8000) });
        if (u.status === 401)
            return { ok: false, message: "The AI server did not accept this website's access token. Press “Connect to the AI” again." };
        const uj = await u.json();
        return { ok: true, message: `Connected and ready. ${j.provider === "ollama" ? `Free local AI (${j.model}), running on this computer.` : `Model: ${j.model}.`} This session: ${uj.requests} requests${uj.estimatedCostUsd ? `, about $${uj.estimatedCostUsd.toFixed(3)} in tokens` : ""}.` };
    }
    catch {
        return { ok: false, message: START_HELP };
    }
}
/** A labelled box for AI output, so it is never confused with the journalist's own material or evidence. */
export function aiBox(title, ...kids) {
    return h("div", { class: "ai-box", role: "region", "aria-label": title }, h("p", { class: "ai-label" }, "AI suggestion · check before using"), h("h3", null, title), ...kids);
}
/**
 * Run an AI job behind a button: shows how long it has been working (the free AI on the laptop can take a few
 * minutes), lets the writer stop waiting, then shows the result or a clear error in `target`.
 */
export async function runAi(button, target, job, show) {
    const label = button.textContent;
    button.disabled = true;
    button.textContent = "Working…";
    const started = Date.now();
    let stopped = false;
    const clock = h("span", { "aria-hidden": "true" }, "0:00");
    const tick = window.setInterval(() => { const s = Math.round((Date.now() - started) / 1000); clock.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }, 1000);
    target.replaceChildren(h("div", { class: "ai-wait" }, h("p", { class: "hint", role: "status" }, "Working on it: ", clock, ". The free AI on your laptop usually takes 20 seconds to 2 minutes; nothing is lost if you carry on writing."), h("button", { type: "button", class: "small", onClick: () => { stopped = true; window.clearInterval(tick); button.disabled = false; button.textContent = label; target.replaceChildren(h("p", { class: "hint" }, "Stopped waiting. Press the button again whenever you like.")); } }, "Stop waiting")));
    try {
        const r = await job();
        if (!stopped)
            target.replaceChildren(show(r));
    }
    catch (e) {
        if (!stopped)
            target.replaceChildren(h("p", { class: "status err", role: "alert" }, e instanceof AiFailure ? e.message : "The AI request failed."));
    }
    finally {
        window.clearInterval(tick);
        button.disabled = false;
        button.textContent = label;
    }
}
