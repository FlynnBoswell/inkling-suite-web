/**
 * Shared journalism-project data model for Inkling Suite. Pure (no browser APIs) so it is unit-testable
 * and reusable by every tool. Phase 2 implements projects, notes and tasks; later phases add sources,
 * claims, quotes, interviews, drafts, graphics and social posts as new record kinds on the same base.
 */
import { tierOf } from "./sourcetier.js";
export const SUBJECTS = ["club", "player", "manager", "match", "transfer", "tactics", "other"];
// ----- Sleuth: research records -----
/** Kinds of source, strongest first. Primary and official sources outrank reporting about them. */
export const SOURCE_TYPES = ["official", "governing-body", "interview", "statistics", "journalism", "social", "other"];
export const PRIMARY_TYPES = ["official", "governing-body", "interview", "statistics"];
/**
 * Claim statuses. "attributed" means we can say who said it, not that it is true.
 * Only the writer sets a status; nothing generated is ever promoted to "confirmed".
 */
export const CLAIM_STATUSES = ["unverified", "attributed", "confirmed", "disputed"];
// ----- Quill: interviews and quotes -----
export const INTERVIEWEE_ROLES = ["player", "manager", "coach", "chair", "supporter", "journalist", "other"];
export const INTERVIEW_TYPES = ["pre-match", "post-match", "feature", "investigative"];
// ----- Inkling: article drafts -----
export const DRAFT_MODES = ["general", "match-preview", "match-report", "post-match-reaction", "player-feature", "football-news", "tactical-analysis", "football-blog"];
// ----- Pixel: graphics and design briefs -----
export const GRAPHIC_PURPOSES = ["matchday", "player-announcement", "interview-thumbnail", "article-header", "quote-card", "social", "feature"];
export const TEMPLATES = ["quote", "matchday", "result", "announcement", "headline", "lineup", "table", "stats", "award", "bigmatch"];
export const DESIGN_FONTS = ["bebas", "oswald", "playfair", "inter"];
export const DESIGN_STYLES = ["clean", "bold", "poster"];
// ----- Pixel: brand kits (not tied to a project: your outlet's look, or a club's colours) -----
export const LOGO_POSITIONS = ["top-right", "top-left", "bottom-right", "none"];
export const MAX_SPONSOR_CHARS = 400_000;
export const MAX_LOGO_CHARS = 700_000;
// ----- Ripple: social posts, campaigns and real metrics -----
export const PLATFORMS = ["x", "bluesky", "threads", "instagram", "facebook", "linkedin"];
// ----- Whistle: live matchday coverage -----
export const MATCH_EVENT_TYPES = ["goal", "pen-goal", "own-goal", "pen-miss", "yellow", "red", "sub", "chance", "save", "var", "injury", "note", "kick-off", "half-time", "second-half", "full-time"];
export const MATCH_STATUSES = ["pre", "1H", "HT", "2H", "FT"];
export const KINDS = ["project", "note", "task", "source", "claim", "interview", "quote", "draft", "graphic", "post", "campaign", "brand", "match"];
export function newId() {
    const c = globalThis.crypto;
    if (c?.randomUUID)
        return c.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}
const now = () => Date.now();
export function newProject(p) {
    const t = now();
    return { kind: "project", id: newId(), createdAt: t, updatedAt: t, description: "", subject: "other", clubs: [], people: [], keyDates: [], questions: [], status: "active", officialSites: [], ...p, title: p.title.trim() };
}
export function newNote(projectId, title, body = "") {
    const t = now();
    return { kind: "note", id: newId(), createdAt: t, updatedAt: t, projectId, title: title.trim(), body };
}
export function newTask(projectId, title, due = "") {
    const t = now();
    return { kind: "task", id: newId(), createdAt: t, updatedAt: t, projectId, title: title.trim(), due, done: false };
}
export function newSource(projectId, s) {
    const t = now();
    return { kind: "source", id: newId(), createdAt: t, updatedAt: t, projectId, url: "", publisher: "", author: "", type: "other", published: "", accessed: isoDay(new Date()), notes: "", ...s, title: s.title.trim() };
}
export function newClaim(projectId, text) {
    const t = now();
    return { kind: "claim", id: newId(), createdAt: t, updatedAt: t, projectId, title: text.trim(), status: "unverified", evidence: [], independentlyChecked: false, asOf: "", notes: "" };
}
export function newInterview(projectId, i) {
    const t = now();
    return { kind: "interview", id: newId(), createdAt: t, updatedAt: t, projectId, title: i.title?.trim() || `Interview: ${i.interviewee.trim()}`, role: "player", type: "feature", date: "", status: "planned", recordingConsent: "not-asked", brief: "", questions: [], notes: "", transcriptOriginal: "", transcriptEdited: "", ...i, interviewee: i.interviewee.trim() };
}
export function newQuote(iv, text, q = {}) {
    const t = now();
    return { kind: "quote", id: newId(), createdAt: t, updatedAt: t, projectId: iv.projectId, interviewId: iv.id, title: text, speaker: iv.interviewee, context: "", origin: "", date: iv.date, uncertain: false, supersedes: "", supersededBy: "", audioAt: -1, ...q };
}
export function newDraft(projectId, title, mode = "general") {
    const t = now();
    return { kind: "draft", id: newId(), createdAt: t, updatedAt: t, projectId, title: title.trim(), standfirst: "", body: "", mode, status: "drafting", publishedUrl: "", quoteIds: [], claimIds: [], revisions: [] };
}
export function newGraphic(projectId, title, purpose, preset) {
    const t = now();
    return { kind: "graphic", id: newId(), createdAt: t, updatedAt: t, projectId, title: title.trim(), purpose, preset, headline: "", quoteId: "", textColour: "#ffffff", backgroundColour: "#12233f", brief: "", image: "", imageWidth: 0, imageHeight: 0, rightsConfirmed: false, checklist: [], status: "planning", design: null, reviews: [], altText: "" };
}
export function newMatch(projectId, m) {
    const t = now();
    const home = m.home.trim(), away = m.away.trim();
    return { kind: "match", id: newId(), createdAt: t, updatedAt: t, projectId, title: `${home} v ${away}`, competition: "", venue: "", date: "", homeSquad: [], awaySquad: [], ...m, home, away, status: "pre", periodStart: 0, events: [], draftId: "", playerOfMatch: "" };
}
export function newPost(projectId, platform, text, o = {}) {
    const t = now();
    return { kind: "post", id: newId(), createdAt: t, updatedAt: t, projectId, platform, text, title: (o.title ?? text.split("\n")[0].slice(0, 60)).trim() || "Untitled post", format: "other", draftId: "", campaignId: "", graphicId: "", plannedFor: "", status: "draft", postedUrl: "", postedAt: "", metrics: [], ...o };
}
export function newBrand(title) {
    const t = now();
    return { kind: "brand", id: newId(), createdAt: t, updatedAt: t, title: title.trim(), bg: "#12233f", accent: "#ffb703", text: "#ffffff", palette: [], font: "bebas", handle: "", logo: "", logoWidth: 0, logoHeight: 0, logoPosition: "top-right", isDefault: false, sponsors: [] };
}
export function newCampaign(projectId, title) {
    const t = now();
    return { kind: "campaign", id: newId(), createdAt: t, updatedAt: t, projectId, title: title.trim(), goal: "", start: "", end: "" };
}
const HEX = /^#[0-9a-f]{6}$/i;
/** Only small raster images as data URLs (no SVG, which can carry script). */
export const IMAGE_DATA_URL = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
export const MAX_IMAGE_CHARS = 3_000_000;
export function isoDay(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
/** Only web addresses. Anything else (javascript:, data:, file:) is refused so a saved link can never run code. */
export function cleanUrl(v) {
    const s = v.trim();
    if (!s)
        return "";
    try {
        const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(s) ? s : "https://" + s);
        return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
    }
    catch {
        return null;
    }
}
// ----- validation (used for imports and for anything read back from storage) -----
const str = (v, max) => (typeof v === "string" ? v.slice(0, max) : null);
function parseReviews(v) {
    if (!Array.isArray(v))
        return [];
    const s = (x, max) => (typeof x === "string" ? x.slice(0, max) : "");
    const sl = (x, max) => (Array.isArray(x) ? x.filter((y) => typeof y === "string").slice(0, 12).map((y) => y.slice(0, max)) : []);
    return v.filter((r) => r && typeof r.at === "number" && Number.isFinite(r.at) && typeof r.summary === "string").slice(-10).map((r) => ({ at: r.at, summary: s(r.summary, 2000),
        priorities: (Array.isArray(r.priorities) ? r.priorities : []).filter((p) => p && typeof p.issue === "string").slice(0, 12).map((p) => ({ level: p.level === "fix" ? "fix" : "consider", issue: s(p.issue, 600), how: s(p.how, 1000) })),
        strengths: sl(r.strengths, 400), photoshop: sl(r.photoshop, 600) }));
}
function parseDesign(v) {
    if (!v || typeof v !== "object")
        return null;
    const o = v;
    if (!TEMPLATES.includes(o.template))
        return null;
    const t = (k, max = 300) => str(o[k], max) ?? "";
    const n = (k, lo, hi, dflt) => (typeof o[k] === "number" && Number.isFinite(o[k]) ? Math.min(hi, Math.max(lo, o[k])) : dflt);
    const hex = (k, dflt) => (typeof o[k] === "string" && HEX.test(o[k]) ? o[k] : dflt);
    const photo = typeof o.photo === "string" && o.photo.length <= MAX_IMAGE_CHARS && IMAGE_DATA_URL.test(o.photo) ? o.photo : "";
    /** An optional image field and its pixel size, validated together. */
    const img = (k, wk, hk, max = MAX_IMAGE_CHARS) => {
        const url = typeof o[k] === "string" && o[k].length <= max && IMAGE_DATA_URL.test(o[k]) ? o[k] : "";
        const sz = (key) => (url && typeof o[key] === "number" && Number.isInteger(o[key]) && o[key] > 0 && o[key] < 20_000 ? o[key] : 0);
        return { [k]: url, [wk]: sz(wk), [hk]: sz(hk) };
    };
    const dim = (k) => (photo && typeof o[k] === "number" && Number.isInteger(o[k]) && o[k] > 0 && o[k] < 20_000 ? o[k] : 0);
    return { template: o.template, kicker: t("kicker", 60), main: t("main", 1500), sub: t("sub", 600), credit: t("credit", 200),
        home: t("home", 80), away: t("away", 80), homeScore: t("homeScore", 3), awayScore: t("awayScore", 3), when: t("when", 120), venue: t("venue", 120), competition: t("competition", 120),
        photo, photoWidth: dim("photoWidth"), photoHeight: dim("photoHeight"), focusX: n("focusX", 0, 1, 0.5), focusY: n("focusY", 0, 1, 0.4), zoom: n("zoom", 1, 3, 1), shade: n("shade", 0, 0.8, 0.35),
        bg: hex("bg", "#12233f"), accent: hex("accent", "#ffb703"), text: hex("text", "#ffffff"), font: DESIGN_FONTS.includes(o.font) ? o.font : "bebas", altText: t("altText", 1000), brandId: t("brandId", 100), lines: t("lines", 3000), extra: t("extra", 600), highlight: t("highlight", 80),
        ...img("letterFill", "letterFillWidth", "letterFillHeight"), fillA: Math.round(n("fillA", 0, 12, 3)), fillB: Math.round(n("fillB", 0, 12, 2)),
        ...img("compLogo", "compLogoWidth", "compLogoHeight", 700_000), showSponsors: o.showSponsors !== false,
        style: DESIGN_STYLES.includes(o.style) ? o.style : "clean",
        cutout: photo && typeof o.cutout === "string" && o.cutout.length <= MAX_IMAGE_CHARS && IMAGE_DATA_URL.test(o.cutout) ? o.cutout : "" };
}
const strList = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim().length > 0).map((x) => x.trim().slice(0, 200)).slice(0, 100) : []);
const isDate = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const time = (v) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);
/** Returns a clean record, or an error message saying why it was rejected. Unknown fields are dropped. */
export function parseRecord(raw) {
    if (typeof raw !== "object" || raw === null)
        return { ok: false, error: "not an object" };
    const o = raw;
    const id = str(o.id, 100);
    const createdAt = time(o.createdAt);
    const updatedAt = time(o.updatedAt);
    if (!id || !/^[\w-]+$/.test(id))
        return { ok: false, error: "missing or invalid id" };
    if (!createdAt || !updatedAt)
        return { ok: false, error: `${id}: missing timestamps` };
    const base = { id, createdAt, updatedAt, ...(time(o.deletedAt) ? { deletedAt: time(o.deletedAt) } : {}) };
    const title = str(o.title, 300)?.trim();
    if (!title)
        return { ok: false, error: `${id}: missing title` };
    switch (o.kind) {
        case "project":
            return { ok: true, rec: {
                    ...base, kind: "project", title, description: str(o.description, 20_000) ?? "",
                    subject: SUBJECTS.includes(o.subject) ? o.subject : "other",
                    clubs: strList(o.clubs), people: strList(o.people),
                    keyDates: Array.isArray(o.keyDates) ? o.keyDates.filter((d) => d && isDate(d.date) && typeof d.label === "string").map((d) => ({ label: d.label.slice(0, 200), date: d.date })).slice(0, 100) : [],
                    questions: Array.isArray(o.questions) ? o.questions.filter((x) => typeof x === "string" && x.trim().length > 0).map((x) => x.trim().slice(0, 1000)).slice(0, 200) : [],
                    status: o.status === "archived" ? "archived" : "active",
                    officialSites: strList(o.officialSites).filter((x) => x.startsWith("http://") || x.startsWith("https://")).slice(0, 20),
                } };
        case "note": {
            const projectId = str(o.projectId, 100);
            if (!projectId)
                return { ok: false, error: `${id}: note has no project` };
            return { ok: true, rec: { ...base, kind: "note", projectId, title, body: str(o.body, 200_000) ?? "" } };
        }
        case "task": {
            const projectId = str(o.projectId, 100);
            if (!projectId)
                return { ok: false, error: `${id}: task has no project` };
            return { ok: true, rec: { ...base, kind: "task", projectId, title, due: isDate(o.due) ? o.due : "", done: o.done === true } };
        }
        case "source": {
            const projectId = str(o.projectId, 100);
            if (!projectId)
                return { ok: false, error: `${id}: source has no project` };
            const url = cleanUrl(str(o.url, 2000) ?? "");
            if (url === null)
                return { ok: false, error: `${id}: source link is not a web address` };
            return { ok: true, rec: { ...base, kind: "source", projectId, title, url, publisher: str(o.publisher, 300) ?? "", author: str(o.author, 300) ?? "",
                    type: SOURCE_TYPES.includes(o.type) ? o.type : "other", published: isDate(o.published) ? o.published : "",
                    accessed: isDate(o.accessed) ? o.accessed : "", notes: str(o.notes, 20_000) ?? "" } };
        }
        case "claim": {
            const projectId = str(o.projectId, 100);
            if (!projectId)
                return { ok: false, error: `${id}: claim has no project` };
            const evidence = Array.isArray(o.evidence) ? o.evidence.filter((e) => e && typeof e.sourceId === "string").map((e) => ({ sourceId: e.sourceId.slice(0, 100), extract: typeof e.extract === "string" ? e.extract.slice(0, 2000) : "", stance: e.stance === "contradicts" ? "contradicts" : "supports" })).slice(0, 50) : [];
            return { ok: true, rec: { ...base, kind: "claim", projectId, title, status: CLAIM_STATUSES.includes(o.status) ? o.status : "unverified",
                    evidence, independentlyChecked: o.independentlyChecked === true, asOf: isDate(o.asOf) ? o.asOf : "", notes: str(o.notes, 20_000) ?? "" } };
        }
        case "interview": {
            const projectId = str(o.projectId, 100);
            if (!projectId)
                return { ok: false, error: `${id}: interview has no project` };
            const questions = Array.isArray(o.questions) ? o.questions.filter((q) => q && typeof q.text === "string" && q.text.trim()).map((q) => ({
                id: typeof q.id === "string" && /^[\w-]+$/.test(q.id) ? q.id : newId(), theme: typeof q.theme === "string" ? q.theme.slice(0, 100) : "General", text: q.text.trim().slice(0, 2000),
                followUps: strList(q.followUps), asked: q.asked === true, ...(typeof q.basedOn === "string" ? { basedOn: q.basedOn.slice(0, 100) } : {})
            })).slice(0, 300) : [];
            return { ok: true, rec: { ...base, kind: "interview", projectId, title, interviewee: str(o.interviewee, 300)?.trim() || "Unknown",
                    role: INTERVIEWEE_ROLES.includes(o.role) ? o.role : "other", type: INTERVIEW_TYPES.includes(o.type) ? o.type : "feature",
                    date: isDate(o.date) ? o.date : "", status: o.status === "done" ? "done" : "planned",
                    recordingConsent: o.recordingConsent === "granted" || o.recordingConsent === "declined" ? o.recordingConsent : "not-asked",
                    brief: str(o.brief, 50_000) ?? "", questions, notes: str(o.notes, 500_000) ?? "", transcriptOriginal: str(o.transcriptOriginal, 2_000_000) ?? "", transcriptEdited: str(o.transcriptEdited, 2_000_000) ?? "" } };
        }
        case "quote": {
            const projectId = str(o.projectId, 100);
            if (!projectId)
                return { ok: false, error: `${id}: quote has no project` };
            // Quote text is kept exactly (no trimming beyond what was saved), since it is someone's words.
            const text = typeof o.title === "string" ? o.title.slice(0, 20_000) : "";
            if (!text.trim())
                return { ok: false, error: `${id}: empty quote` };
            return { ok: true, rec: { ...base, kind: "quote", projectId, interviewId: str(o.interviewId, 100) ?? "", title: text, speaker: str(o.speaker, 300) ?? "",
                    context: str(o.context, 5000) ?? "", origin: str(o.origin, 500) ?? "", date: isDate(o.date) ? o.date : "", uncertain: o.uncertain === true,
                    supersedes: str(o.supersedes, 100) ?? "", supersededBy: str(o.supersededBy, 100) ?? "",
                    audioAt: typeof o.audioAt === "number" && Number.isFinite(o.audioAt) && o.audioAt >= 0 && o.audioAt < 86_400 ? o.audioAt : -1 } };
        }
        case "draft": {
            const projectId = str(o.projectId, 100);
            if (!projectId)
                return { ok: false, error: `${id}: draft has no project` };
            const url = cleanUrl(str(o.publishedUrl, 2000) ?? "");
            if (url === null)
                return { ok: false, error: `${id}: published link is not a web address` };
            const ids = (v) => strList(v).filter((x) => /^[\w-]+$/.test(x));
            const revisions = Array.isArray(o.revisions) ? o.revisions.filter((r) => r && time(r.at) && typeof r.body === "string").map((r) => ({ at: r.at, title: typeof r.title === "string" ? r.title.slice(0, 300) : "", standfirst: typeof r.standfirst === "string" ? r.standfirst.slice(0, 2000) : "", body: r.body.slice(0, 500_000), note: typeof r.note === "string" ? r.note.slice(0, 300) : "" })).slice(-30) : [];
            return { ok: true, rec: { ...base, kind: "draft", projectId, title, standfirst: str(o.standfirst, 2000) ?? "", body: str(o.body, 500_000) ?? "",
                    mode: DRAFT_MODES.includes(o.mode) ? o.mode : "general", status: o.status === "ready" || o.status === "published" ? o.status : "drafting",
                    publishedUrl: url, quoteIds: ids(o.quoteIds), claimIds: ids(o.claimIds), revisions } };
        }
        case "graphic": {
            const projectId = str(o.projectId, 100);
            if (!projectId)
                return { ok: false, error: `${id}: graphic has no project` };
            const image = typeof o.image === "string" && o.image.length <= MAX_IMAGE_CHARS && IMAGE_DATA_URL.test(o.image) ? o.image : "";
            const dim = (v) => (typeof v === "number" && Number.isInteger(v) && v > 0 && v < 20_000 ? v : 0);
            return { ok: true, rec: { ...base, kind: "graphic", projectId, title, purpose: GRAPHIC_PURPOSES.includes(o.purpose) ? o.purpose : "social",
                    preset: str(o.preset, 50) ?? "", headline: str(o.headline, 500) ?? "", quoteId: str(o.quoteId, 100) ?? "",
                    textColour: typeof o.textColour === "string" && HEX.test(o.textColour) ? o.textColour : "#ffffff", backgroundColour: typeof o.backgroundColour === "string" && HEX.test(o.backgroundColour) ? o.backgroundColour : "#12233f",
                    brief: str(o.brief, 20_000) ?? "", image, imageWidth: image ? dim(o.imageWidth) : 0, imageHeight: image ? dim(o.imageHeight) : 0,
                    rightsConfirmed: o.rightsConfirmed === true, checklist: strList(o.checklist), status: o.status === "in-progress" || o.status === "done" ? o.status : "planning", design: parseDesign(o.design), reviews: parseReviews(o.reviews), altText: str(o.altText, 2000) ?? "" } };
        }
        case "post": {
            const projectId = str(o.projectId, 100);
            if (!projectId)
                return { ok: false, error: `${id}: post has no project` };
            const postedUrl = cleanUrl(str(o.postedUrl, 2000) ?? "");
            if (postedUrl === null)
                return { ok: false, error: `${id}: post link is not a web address` };
            const num = (v) => (typeof v === "number" && Number.isFinite(v) && Math.abs(v) < 1e12 ? Math.round(v) : null);
            const metrics = Array.isArray(o.metrics) ? o.metrics.filter((m) => m && isDate(m.date)).map((m) => ({ date: m.date, impressions: num(m.impressions), engagements: num(m.engagements), clicks: num(m.clicks), followerChange: num(m.followerChange), origin: m.origin === "import" ? "import" : "manual" })).slice(0, 500) : [];
            const status = o.status === "ready" ? "ready" : o.status === "posted" && postedUrl ? "posted" : "draft"; // "posted" needs a real link
            return { ok: true, rec: { ...base, kind: "post", projectId, title, platform: PLATFORMS.includes(o.platform) ? o.platform : "x", text: str(o.text, 70_000) ?? "",
                    format: ["headline", "quote", "thread", "graphic"].includes(o.format) ? o.format : "other", draftId: str(o.draftId, 100) ?? "", campaignId: str(o.campaignId, 100) ?? "", graphicId: str(o.graphicId, 100) ?? "",
                    plannedFor: typeof o.plannedFor === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(o.plannedFor) ? o.plannedFor : "", status, postedUrl, postedAt: status === "posted" && isDate(o.postedAt) ? o.postedAt : "", metrics } };
        }
        case "campaign": {
            const projectId = str(o.projectId, 100);
            if (!projectId)
                return { ok: false, error: `${id}: campaign has no project` };
            return { ok: true, rec: { ...base, kind: "campaign", projectId, title, goal: str(o.goal, 5000) ?? "", start: isDate(o.start) ? o.start : "", end: isDate(o.end) ? o.end : "" } };
        }
        case "brand": {
            const hex = (v, d) => (typeof v === "string" && HEX.test(v) ? v : d);
            const logo = typeof o.logo === "string" && o.logo.length <= MAX_LOGO_CHARS && IMAGE_DATA_URL.test(o.logo) ? o.logo : "";
            const dim = (v) => (logo && typeof v === "number" && Number.isInteger(v) && v > 0 && v < 20_000 ? v : 0);
            return { ok: true, rec: { ...base, kind: "brand", title, bg: hex(o.bg, "#12233f"), accent: hex(o.accent, "#ffb703"), text: hex(o.text, "#ffffff"),
                    palette: (Array.isArray(o.palette) ? o.palette : []).filter((c) => typeof c === "string" && HEX.test(c)).slice(0, 8),
                    font: DESIGN_FONTS.includes(o.font) ? o.font : "bebas", handle: str(o.handle, 60) ?? "",
                    logo, logoWidth: dim(o.logoWidth), logoHeight: dim(o.logoHeight), logoPosition: LOGO_POSITIONS.includes(o.logoPosition) ? o.logoPosition : "top-right", isDefault: o.isDefault === true,
                    sponsors: (Array.isArray(o.sponsors) ? o.sponsors : []).filter((sp) => sp && typeof sp.logo === "string" && sp.logo.length <= MAX_SPONSOR_CHARS && IMAGE_DATA_URL.test(sp.logo) && Number.isInteger(sp.width) && sp.width > 0 && sp.width < 20_000 && Number.isInteger(sp.height) && sp.height > 0 && sp.height < 20_000)
                        .slice(0, 10).map((sp) => ({ logo: sp.logo, width: sp.width, height: sp.height, name: typeof sp.name === "string" ? sp.name.slice(0, 80) : "" })) } };
        }
        case "match": {
            const projectId = str(o.projectId, 100);
            if (!projectId)
                return { ok: false, error: `${id}: match has no project` };
            const home = str(o.home, 120)?.trim(), away = str(o.away, 120)?.trim();
            if (!home || !away)
                return { ok: false, error: `${id}: match needs both teams` };
            const events = (Array.isArray(o.events) ? o.events : []).filter((e) => e && typeof e.id === "string" && MATCH_EVENT_TYPES.includes(e.type)).slice(0, 500).map((e) => ({
                id: String(e.id).slice(0, 100), type: e.type, minute: typeof e.minute === "string" && /^\d{1,3}(\+\d{1,2})?$/.test(e.minute) ? e.minute : "",
                team: e.team === "home" || e.team === "away" ? e.team : "", player: str(e.player, 120) ?? "", other: str(e.other, 120) ?? "", note: str(e.note, 2000) ?? "", at: time(e.at) ?? updatedAt
            }));
            const status = MATCH_STATUSES.includes(o.status) ? o.status : "pre";
            return { ok: true, rec: { ...base, kind: "match", projectId, title, home, away, competition: str(o.competition, 120) ?? "", venue: str(o.venue, 120) ?? "", date: isDate(o.date) ? o.date : "",
                    homeSquad: strList(o.homeSquad), awaySquad: strList(o.awaySquad), status, periodStart: status === "1H" || status === "2H" ? (time(o.periodStart) ?? 0) : 0, events, draftId: str(o.draftId, 100) ?? "", playerOfMatch: str(o.playerOfMatch, 120)?.trim() ?? "" } };
        }
        default: return { ok: false, error: `${id}: unknown kind ${JSON.stringify(o.kind)}` };
    }
}
// ----- export / import -----
export const EXPORT_FORMAT = "inkling-suite";
export function makeExport(records, preferences) {
    return { format: EXPORT_FORMAT, version: 1, exportedAt: new Date().toISOString(), records, ...(preferences ? { preferences } : {}) };
}
/**
 * Validate an export file and decide what to write. Records are matched by id, and the newer `updatedAt`
 * wins, so importing the same file twice never duplicates anything.
 */
export function planImport(json, existing) {
    const plan = { put: [], added: 0, updated: 0, unchanged: 0, errors: [] };
    const f = json;
    if (!f || f.format !== EXPORT_FORMAT || !Array.isArray(f.records)) {
        plan.errors.push("This is not an Inkling Suite export file.");
        return plan;
    }
    if (f.version !== 1) {
        plan.errors.push(`Unsupported export version ${String(f.version)}.`);
        return plan;
    }
    const incoming = new Map();
    for (const raw of f.records) {
        const r = parseRecord(raw);
        if (r.ok)
            incoming.set(r.rec.id, r.rec);
        else
            plan.errors.push(r.error);
    }
    const projectIds = new Set([...existing.values(), ...incoming.values()].filter((r) => r.kind === "project").map((r) => r.id));
    for (const rec of incoming.values()) {
        if (rec.kind !== "project" && rec.kind !== "brand" && !projectIds.has(rec.projectId)) {
            plan.errors.push(`${rec.id}: its project is not in the file or in your data`);
            continue;
        }
        const cur = existing.get(rec.id);
        if (!cur) {
            plan.put.push(rec);
            plan.added++;
        }
        else if (rec.updatedAt > cur.updatedAt) {
            plan.put.push(rec);
            plan.updated++;
        }
        else
            plan.unchanged++;
    }
    return plan;
}
// ----- queries used by the dashboard and search -----
export const live = (r) => !r.deletedAt;
export function searchRecords(records, query) {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length)
        return [];
    const extra = (r) => {
        switch (r.kind) {
            case "project": return [r.description, ...r.clubs, ...r.people].join(" ");
            case "note": return r.body;
            case "source": return [r.publisher, r.author, r.url, r.notes].join(" ");
            case "claim": return [r.notes, ...r.evidence.map((e) => e.extract)].join(" ");
            case "interview": return [r.interviewee, r.brief, r.notes, r.transcriptEdited || r.transcriptOriginal, ...r.questions.map((q) => q.text)].join(" ");
            case "quote": return [r.speaker, r.context].join(" ");
            case "draft": return [r.standfirst, r.body].join(" ");
            case "graphic": return [r.headline, r.brief].join(" ");
            case "post": return r.text;
            case "campaign": return r.goal;
            case "brand": return r.handle;
            case "match": return [r.competition, r.venue, ...r.events.map((e) => [e.player, e.other, e.note].join(" "))].join(" ");
            default: return "";
        }
    };
    const text = (r) => (r.title + " " + extra(r)).toLowerCase();
    return records.filter(live).filter((r) => { const t = text(r); return terms.every((q) => t.includes(q)); }).sort((a, b) => b.updatedAt - a.updatedAt);
}
/** Open tasks with a deadline, soonest first (overdue ones included, so nothing slips off the list). */
export function upcomingDeadlines(records, limit = 8) {
    return records.filter((r) => r.kind === "task" && live(r) && !r.done && r.due !== "").sort((a, b) => a.due.localeCompare(b.due)).slice(0, limit);
}
export function isOverdue(t, today) { return !t.done && t.due !== "" && t.due < today; }
/** Records belonging to a project, for cascading deletes and the project page. */
export function childrenOf(records, projectId) {
    return records.filter((r) => r.kind !== "project" && r.kind !== "brand" && r.projectId === projectId);
}
/**
 * Where a project stands, read from its records (never estimated): research → interview → article → graphic → promotion.
 * Each stage reports what exists and whether it counts as done.
 */
const n = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;
export function projectStages(records, projectId) {
    const k = childrenOf(records, projectId).filter(live);
    const of = (kind) => k.filter((r) => r.kind === kind);
    const claims = of("claim"), ivs = of("interview"), drafts = of("draft"), gfx = of("graphic"), posts = of("post");
    return [
        { stage: "Research", done: claims.some((c) => c.status === "confirmed"), detail: `${n(of("source").length, "source")}, ${claims.filter((c) => c.status === "confirmed").length}/${claims.length} claims confirmed` },
        { stage: "Interviews", done: ivs.some((i) => i.status === "done"), detail: `${ivs.filter((i) => i.status === "done").length}/${ivs.length} done, ${n(of("quote").filter((q) => !q.supersededBy).length, "quote")}` },
        { stage: "Article", done: drafts.some((d) => d.status === "published"), detail: drafts.length ? drafts.map((d) => d.status).join(", ") : "no drafts" },
        { stage: "Graphics", done: gfx.some((g) => g.status === "done"), detail: `${gfx.filter((g) => g.status === "done").length}/${gfx.length} done` },
        { stage: "Promotion", done: posts.some((p) => p.status === "posted"), detail: `${posts.filter((p) => p.status === "posted").length}/${posts.length} posted` },
    ];
}
/**
 * What a careful editor would ask about a claim, given its evidence. `today` is YYYY-MM-DD.
 * Sources that are missing or in the Trash count as no evidence.
 */
export function claimWarnings(c, sources, today) {
    const out = [];
    const ev = c.evidence.filter((e) => { const s = sources.get(e.sourceId); return s && !s.deletedAt; });
    const sup = ev.filter((e) => e.stance === "supports");
    const con = ev.filter((e) => e.stance === "contradicts");
    const supSources = sup.map((e) => sources.get(e.sourceId));
    if (!sup.length)
        out.push({ level: "problem", text: "No supporting source attached." });
    if (con.length)
        out.push({ level: "problem", text: `${con.length} source${con.length > 1 ? "s" : ""} contradict${con.length > 1 ? "" : "s"} this claim. Resolve or report the disagreement.` });
    if (c.status === "confirmed") {
        if (!sup.length)
            out.push({ level: "problem", text: "Marked confirmed without any supporting source." });
        else if (new Set(supSources.map((s) => (s.publisher || s.url || s.id).toLowerCase())).size < 2 && !supSources.some((s) => PRIMARY_TYPES.includes(s.type)))
            out.push({ level: "caution", text: "Confirmed from a single secondary source. Look for a primary source or a second independent one." });
        if (con.length)
            out.push({ level: "problem", text: "Marked confirmed although a source contradicts it." });
    }
    if (sup.length && !supSources.some((s) => PRIMARY_TYPES.includes(s.type)))
        out.push({ level: "caution", text: "No primary source (official, governing body, interview or official statistics)." });
    const weak = (s) => !!s.url && ["aggregator", "social", "reference"].includes(tierOf(s.url)) && !PRIMARY_TYPES.includes(s.type);
    if (sup.length && supSources.every(weak))
        out.push({ level: "caution", text: "Only supported by rumour sites, social media or Wikipedia. Find the original report or an official source." });
    if (!c.independentlyChecked && c.status === "confirmed")
        out.push({ level: "caution", text: "Not yet independently checked." });
    const dates = [c.asOf, ...supSources.map((s) => s.published)].filter(Boolean).sort();
    const newest = dates[dates.length - 1];
    if (newest && daysBetween(newest, today) > 365)
        out.push({ level: "caution", text: `The most recent date on this evidence is ${newest}. Figures may be out of date.` });
    return out;
}
export function daysBetween(a, b) { return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000); }
/** A plain-text research file: claims with their status and evidence, then the numbered source list. */
export function researchMarkdown(p, claims, sources) {
    const num = new Map(sources.map((s, i) => [s.id, i + 1]));
    const lines = [`# Research: ${p.title}`, "", `Exported ${isoDay(new Date())}. Statuses are the journalist's own judgement.`, "", "## Claims", ""];
    if (!claims.length)
        lines.push("(none)");
    for (const c of claims) {
        lines.push(`- **${c.title}**`, `  - Status: ${c.status}${c.independentlyChecked ? ", independently checked" : ""}${c.asOf ? `, as of ${c.asOf}` : ""}`);
        for (const e of c.evidence)
            if (num.has(e.sourceId))
                lines.push(`  - ${e.stance === "supports" ? "Supported by" : "Contradicted by"} [${num.get(e.sourceId)}]${e.extract ? `: "${e.extract}"` : ""}`);
        if (c.notes)
            lines.push(`  - Notes: ${c.notes.replace(/\n+/g, " ")}`);
    }
    lines.push("", "## Sources", "");
    if (!sources.length)
        lines.push("(none)");
    for (const s of sources)
        lines.push(`${num.get(s.id)}. ${[s.author, s.publisher].filter(Boolean).join(", ")}${s.author || s.publisher ? ". " : ""}"${s.title}". ${s.published ? `Published ${s.published}. ` : ""}${s.url ? `${s.url} ` : ""}(accessed ${s.accessed || "date not recorded"}; ${s.type})`);
    return lines.join("\n") + "\n";
}
