/**
 * Bluesky: the one major platform with a free, open posting and stats API (the AT Protocol).
 * Sign-in uses an app password the writer creates in Bluesky (Settings › Privacy and security › App passwords),
 * never their main password. Inkling keeps only the session it gets back, in this browser, and the writer can
 * disconnect at any time. Posting always needs an explicit confirmation.
 */
const PDS = "https://bsky.social";
const PUBLIC = "https://public.api.bsky.app";
const KEY = "inkling-suite.bluesky";
const load = () => { try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return s?.did && s?.accessJwt ? s : null;
}
catch {
    return null;
} };
const store = (s) => { try {
    if (s)
        localStorage.setItem(KEY, JSON.stringify(s));
    else
        localStorage.removeItem(KEY);
}
catch { /* private window */ } };
export const blueskyAccount = () => { const s = load(); return s ? { handle: s.handle, did: s.did } : null; };
export function blueskyDisconnect() { store(null); }
export class BlueskyError extends Error {
}
async function xrpc(path, init, base = PDS) {
    let r;
    try {
        r = await fetch(base + "/xrpc/" + path, { ...init, signal: AbortSignal.timeout(20_000) });
    }
    catch {
        throw new BlueskyError("Could not reach Bluesky. Check the internet connection.");
    }
    const j = await r.json().catch(() => null);
    if (!r.ok) {
        if (r.status === 401)
            throw new BlueskyError(j?.error === "ExpiredToken" ? "expired" : "Bluesky rejected the sign-in. Check the handle and app password.");
        if (r.status === 429)
            throw new BlueskyError("Bluesky is rate limiting. Try again in a few minutes.");
        throw new BlueskyError(j?.message ? `Bluesky said: ${j.message}` : `Bluesky returned an error (${r.status}).`);
    }
    return j;
}
export async function blueskyConnect(identifier, appPassword) {
    if (!/^[\w.-]+$/.test(identifier.replace(/^@/, "")))
        throw new BlueskyError("Enter your Bluesky handle, for example yourname.bsky.social.");
    if (!/^[a-z0-9]{4}(-[a-z0-9]{4}){3}$/i.test(appPassword.trim()))
        throw new BlueskyError("That does not look like an app password (xxxx-xxxx-xxxx-xxxx). Create one in Bluesky: Settings › Privacy and security › App passwords. Do not use your main password.");
    const j = await xrpc("com.atproto.server.createSession", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ identifier: identifier.replace(/^@/, ""), password: appPassword.trim() }) });
    store({ did: j.did, handle: j.handle, accessJwt: j.accessJwt, refreshJwt: j.refreshJwt });
    return { handle: j.handle };
}
async function authed(path, body, raw) {
    const s = load();
    if (!s)
        throw new BlueskyError("Connect your Bluesky account first (Settings › Bluesky).");
    const call = (tok) => xrpc(path, { method: "POST", headers: { "content-type": raw ? raw.type : "application/json", authorization: `Bearer ${tok}` }, body: raw ? body : JSON.stringify(body) });
    try {
        return await call(s.accessJwt);
    }
    catch (e) {
        if (e.message !== "expired")
            throw e;
        const j = await xrpc("com.atproto.server.refreshSession", { method: "POST", headers: { authorization: `Bearer ${s.refreshJwt}` } }).catch(() => { store(null); throw new BlueskyError("Your Bluesky session expired. Connect again in Settings."); });
        store({ ...s, accessJwt: j.accessJwt, refreshJwt: j.refreshJwt });
        return call(j.accessJwt);
    }
}
/** Link facets so web addresses in the post are clickable. Bluesky counts positions in UTF-8 bytes. */
export function linkFacets(text) {
    const enc = new TextEncoder();
    const out = [];
    for (const m of text.matchAll(/https?:\/\/[^\s)]+[^\s).,!?;:'"”’]/g)) {
        const start = enc.encode(text.slice(0, m.index)).length;
        const end = start + enc.encode(m[0]).length;
        out.push({ index: { byteStart: start, byteEnd: end }, features: [{ $type: "app.bsky.richtext.facet#link", uri: m[0] }] });
    }
    return out;
}
/** Bluesky accepts images up to about 1 MB. */
export const BLUESKY_IMAGE_BYTES = 950_000;
/** The record for a post, with an image embed when there is one. Pure, so it can be tested. */
export function postRecord(text, createdAt, image) {
    return { $type: "app.bsky.feed.post", text, createdAt, langs: ["en"], facets: linkFacets(text),
        ...(image ? { embed: { $type: "app.bsky.embed.images", images: [{ alt: image.alt, image: image.ref, aspectRatio: { width: image.width, height: image.height } }] } } : {}) };
}
/** Publish a post, optionally with one image and its alt text. Returns the public link, which identifies the post for fetching its figures later. */
export async function blueskyPublish(text, image) {
    if ([...new Intl.Segmenter().segment(text)].length > 300)
        throw new BlueskyError("Bluesky posts are limited to 300 characters.");
    if (image && image.blob.size > BLUESKY_IMAGE_BYTES)
        throw new BlueskyError("The image is too large for Bluesky (about 1 MB at most).");
    if (image && image.alt.length > 2000)
        throw new BlueskyError("The alt text is too long for Bluesky (2,000 characters at most).");
    const s = load();
    if (!s)
        throw new BlueskyError("Connect your Bluesky account first (Settings › Bluesky).");
    const blob = image ? (await authed("com.atproto.repo.uploadBlob", image.blob, { type: image.blob.type })).blob : null;
    const j = await authed("com.atproto.repo.createRecord", { repo: s.did, collection: "app.bsky.feed.post", record: postRecord(text, new Date().toISOString(), image && blob ? { ref: blob, alt: image.alt, width: image.width, height: image.height } : undefined) });
    const rkey = String(j.uri).split("/").pop();
    return `https://bsky.app/profile/${s.did}/post/${rkey}`;
}
/**
 * Publish a thread: the first part (with the image, if any) as a post, then each next part as a reply to the one
 * before. Every part must fit Bluesky's 300 characters; nothing is sent unless all of them do. If a later part fails,
 * the error says how many were posted. Returns the link to the first post.
 */
export async function blueskyPublishThread(parts, image) {
    if (!parts.length)
        throw new BlueskyError("The thread is empty.");
    const long = parts.findIndex((p) => [...new Intl.Segmenter().segment(p)].length > 300);
    if (long >= 0)
        throw new BlueskyError(`Post ${long + 1} of the thread is over Bluesky's 300 characters.`);
    if (image && image.blob.size > BLUESKY_IMAGE_BYTES)
        throw new BlueskyError("The image is too large for Bluesky (about 1 MB at most).");
    const s = load();
    if (!s)
        throw new BlueskyError("Connect your Bluesky account first (Settings › Bluesky).");
    const blob = image ? (await authed("com.atproto.repo.uploadBlob", image.blob, { type: image.blob.type })).blob : null;
    let root = null;
    let parent = null;
    for (let i = 0; i < parts.length; i++) {
        const record = postRecord(parts[i], new Date().toISOString(), i === 0 && image && blob ? { ref: blob, alt: image.alt, width: image.width, height: image.height } : undefined);
        if (root && parent)
            record.reply = { root, parent };
        let j;
        try {
            j = await authed("com.atproto.repo.createRecord", { repo: s.did, collection: "app.bsky.feed.post", record });
        }
        catch (e) {
            throw new BlueskyError(i === 0 ? e.message : `Only ${i} of ${parts.length} post${parts.length === 1 ? "" : "s"} were published (${e.message}). Post the rest as replies yourself.`);
        }
        const ref = { uri: String(j.uri), cid: String(j.cid) };
        if (!root)
            root = ref;
        parent = ref;
    }
    return `https://bsky.app/profile/${s.did}/post/${root.uri.split("/").pop()}`;
}
/** "https://bsky.app/profile/<did or handle>/post/<rkey>" → at:// address (only for links that carry the DID). */
export function atUriFromUrl(url) {
    const m = /^https:\/\/bsky\.app\/profile\/(did:[a-z]+:[\w.:%-]+)\/post\/([\w]+)$/.exec(url);
    return m ? `at://${m[1]}/app.bsky.feed.post/${m[2]}` : null;
}
/** Public figures for a post (no sign-in needed). Bluesky does not publish impressions or clicks. */
export async function blueskyStats(url) {
    const uri = atUriFromUrl(url);
    if (!uri)
        throw new BlueskyError("Figures can only be fetched for posts published from Inkling (their link includes the account ID).");
    const j = await xrpc(`app.bsky.feed.getPosts?uris=${encodeURIComponent(uri)}`, { method: "GET" }, PUBLIC);
    const p = j?.posts?.[0];
    if (!p)
        throw new BlueskyError("Bluesky could not find that post. It may have been deleted.");
    return { likes: p.likeCount ?? 0, reposts: p.repostCount ?? 0, replies: p.replyCount ?? 0, quotes: p.quoteCount ?? 0 };
}
