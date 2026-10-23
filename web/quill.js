import { playFrom, recordingPlayer, recordingSection, storeRecording } from "./transcriber.js";
import { transcribeChunk } from "./audio.js";
import { formatStamp, parseStamp, quoteInTranscript, speakerAt, spokenWords, stampAt } from "../core/suite/transcript.js";
import { h } from "../extension/dom.js";
import { childrenOf, INTERVIEW_TYPES, INTERVIEWEE_ROLES, live, newId, newInterview, newQuote } from "../core/suite/model.js";
import { interviewMarkdown, researchGaps, stamp, suggestQuestions } from "../core/suite/quill.js";
import { app, download, empty, field, fmtDate, go, link, persist, projects, section, setStatus, plural } from "./ui.js";
import { ai, aiBox, runAi } from "./ai.js";
/**
 * Quill: interview preparation, live notes, transcripts and exact quotes.
 * People's words are protected: quote text and the original transcript are locked once saved (see SuiteStore).
 */
const ROLE_LABEL = { player: "Player", manager: "Manager", coach: "Coach", chair: "Chair or director", supporter: "Supporter", journalist: "Journalist", other: "Other" };
const TYPE_LABEL = { "pre-match": "Pre-match", "post-match": "Post-match", feature: "Feature", investigative: "Investigative" };
const interviewsOf = (p) => childrenOf([...app.store.records()], p.id).filter((r) => r.kind === "interview" && live(r)).sort((a, b) => (b.date || "").localeCompare(a.date || "") || b.updatedAt - a.updatedAt);
const quotesOf = (filter) => app.store.records().filter((r) => r.kind === "quote" && live(r) && filter(r)).sort((a, b) => b.createdAt - a.createdAt);
const claimsOf = (p) => childrenOf([...app.store.records()], p.id).filter((r) => r.kind === "claim" && live(r));
/** The interview clock lives only in this tab's memory: it is a note-taking aid, not a recording. */
const clocks = new Map();
export function quillHome() {
    const ps = projects().sort((a, b) => b.updatedAt - a.updatedAt);
    const upcoming = app.store.records().filter((r) => r.kind === "interview" && live(r) && r.status === "planned").sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999")).slice(0, 8);
    return h("div", null, h("h1", null, "Quill"), h("p", { class: "lead" }, "Interview preparation, live notes, transcripts and exact quotes. Quotes are locked once saved, so what someone said is never quietly changed."), section("Upcoming interviews", upcoming.length ? h("ul", { class: "items" }, ...upcoming.map((i) => h("li", null, link(`#/interview/${i.id}`, i.title), h("span", { class: "meta" }, [i.date ? fmtDate(i.date) : "no date", TYPE_LABEL[i.type]].join(" · "))))) : empty("No planned interviews.")), ps.length ? section("Choose a project", h("ul", { class: "items" }, ...ps.map((p) => h("li", null, link(`#/quill/${p.id}`, p.title), h("span", { class: "meta" }, `${plural(interviewsOf(p).length, "interview", "interviews")} · ${plural(quotesOf((x) => x.projectId === p.id && !x.supersededBy).length, "quote", "quotes")}`)))))
        : empty("Create a project first.", h("button", { class: "primary", type: "button", onClick: () => go("#/project/new") }, "Create a project")), section("Recording and transcription", h("p", null, "Open an interview, record it here with the interviewee's agreement (or add a recording from your phone), and transcribe it privately on your laptop with Start Inkling: free, and nothing leaves the laptop. Check the transcript, then save exact quotes linked to the moment they were said.")));
}
export function quillProject(p) {
    const ivs = interviewsOf(p);
    const quotes = quotesOf((x) => x.projectId === p.id && !x.supersededBy);
    const gaps = researchGaps(claimsOf(p));
    const who = h("input", { type: "text", required: true, placeholder: "Name of the person", "aria-label": "Interviewee" });
    const role = h("select", { "aria-label": "Their role" }, ...INTERVIEWEE_ROLES.map((r) => h("option", { value: r }, ROLE_LABEL[r])));
    const type = h("select", { "aria-label": "Interview type" }, ...INTERVIEW_TYPES.map((t) => h("option", { value: t, selected: t === "feature" }, TYPE_LABEL[t])));
    const date = h("input", { type: "date", "aria-label": "Interview date" });
    return h("div", null, h("p", { class: "crumbs" }, link("#/tool/quill", "Quill"), " / ", link(`#/project/${p.id}`, p.title)), h("h1", null, `Interviews: ${p.title}`), gaps.length ? h("p", { class: "hint" }, `${gaps.length} claim${gaps.length > 1 ? "s" : ""} in your research still need checking. Suggested questions will include them, worded neutrally.`) : null, section("Plan an interview", h("form", { class: "row", onSubmit: async (e) => {
            e.preventDefault();
            if (!who.value.trim()) {
                who.focus();
                return;
            }
            const s = await persist(() => app.store.save(newInterview(p.id, { interviewee: who.value, role: role.value, type: type.value, date: date.value })), "Interview created");
            if (s)
                go(`#/interview/${s[0].id}`);
        } }, who, role, type, date, h("button", { class: "primary", type: "submit" }, "Create"))), section(`Interviews (${ivs.length})`, ivs.length ? h("ul", { class: "items" }, ...ivs.map((i) => h("li", null, link(`#/interview/${i.id}`, i.title), h("span", { class: "meta" }, [i.date ? fmtDate(i.date) : "", TYPE_LABEL[i.type], i.status === "done" ? "done" : "planned", `${plural(i.questions.length, "question", "questions")}`].filter(Boolean).join(" · "))))) : empty("No interviews yet.")), section(`Quotes (${quotes.length})`, quotes.length ? quoteList(quotes) : empty("No quotes saved yet.")));
}
function quoteList(quotes) {
    return h("ul", { class: "items quotes" }, ...quotes.map((x) => h("li", null, h("span", null, link(`#/quote/${x.id}`, `“${x.title}”`), h("span", { class: "meta" }, ` — ${x.speaker}${x.origin ? ", " + x.origin : ""}`)), x.uncertain ? h("span", { class: "pill status-disputed" }, "check wording") : null)));
}
export function interviewPage(iv) {
    const p = app.store.get(iv.projectId);
    if (!p)
        return empty("This interview's project is missing.");
    const quotes = quotesOf((x) => x.interviewId === iv.id && !x.supersededBy);
    const fresh = () => app.store.get(iv.id); // always edit the latest copy
    // --- details
    const title = h("input", { type: "text", value: iv.title });
    const who = h("input", { type: "text", value: iv.interviewee });
    const role = h("select", null, ...INTERVIEWEE_ROLES.map((r) => h("option", { value: r, selected: iv.role === r }, ROLE_LABEL[r])));
    const type = h("select", null, ...INTERVIEW_TYPES.map((t) => h("option", { value: t, selected: iv.type === t }, TYPE_LABEL[t])));
    const date = h("input", { type: "date", value: iv.date });
    const status = h("select", null, h("option", { value: "planned", selected: iv.status === "planned" }, "Planned"), h("option", { value: "done", selected: iv.status === "done" }, "Done"));
    const consent = h("select", null, ...[["not-asked", "Not asked yet"], ["granted", "Agreed to be recorded"], ["declined", "Declined recording"]].map(([v, l]) => h("option", { value: v, selected: iv.recordingConsent === v }, l)));
    const brief = h("textarea", { rows: 4, value: iv.brief });
    const details = h("form", { onSubmit: async (e) => {
            e.preventDefault();
            if (!who.value.trim()) {
                setStatus("The interviewee needs a name.", "err");
                return;
            }
            await persist(() => app.store.save({ ...fresh(), title: title.value.trim() || `Interview: ${who.value.trim()}`, interviewee: who.value.trim(), role: role.value, type: type.value, date: date.value, status: status.value, recordingConsent: consent.value, brief: brief.value }), "Interview saved");
        } }, h("div", { class: "grid tight" }, field("Title", title), field("Interviewee", who), field("Role", role), field("Type", type), field("Date", date), field("Status", status), field("Recording consent", consent, "Record only if they agree, and say how the recording will be used.")), field("Brief", brief, "Who they are, why you are talking to them, what you need from the interview."), h("button", { class: "primary", type: "submit" }, "Save details"));
    // --- questions
    const themes = [...new Set(iv.questions.map((x) => x.theme))];
    const qTheme = h("input", { type: "text", placeholder: "Theme", value: "General", "aria-label": "Question theme" });
    const qText = h("input", { type: "text", placeholder: "Your question", "aria-label": "New question" });
    const setQuestions = (qs, msg) => persist(() => app.store.save({ ...fresh(), questions: qs }), msg);
    const questions = section(`Questions (${iv.questions.length})`, h("div", { class: "row" }, h("button", { type: "button", onClick: () => { const have = new Set(fresh().questions.map((x) => x.text)); const add = suggestQuestions(fresh(), p, claimsOf(p)).filter((x) => !have.has(x.text)); if (!add.length) {
            setStatus("No new suggestions.");
            return;
        } void setQuestions([...fresh().questions, ...add], `${plural(add.length, "suggested question", "suggested questions")} added`); } }, "Suggest questions"), h("span", { class: "hint" }, "Built from your research and general interviewing practice. Edit or remove any of them.")), aiQuestions(p, fresh, (qs, msg) => setQuestions(qs, msg)), themes.length ? h("div", null, ...themes.map((t) => h("div", { class: "theme" }, h("h3", null, t), h("ul", { class: "items" }, ...iv.questions.filter((x) => x.theme === t).map((x) => {
        const box = h("input", { type: "checkbox", checked: x.asked, "aria-label": `Asked: ${x.text}`, onChange: () => void setQuestions(fresh().questions.map((y) => y.id === x.id ? { ...y, asked: box.checked } : y), box.checked ? "Marked as asked" : "Marked as not asked") });
        return h("li", { class: x.asked ? "done" : "" }, h("span", null, h("label", { class: "check" }, box, h("span", null, x.text)), ...x.followUps.map((f) => h("span", { class: "meta followup" }, "Follow-up: " + f))), h("button", { type: "button", class: "small", "aria-label": `Remove question: ${x.text}`, onClick: () => void setQuestions(fresh().questions.filter((y) => y.id !== x.id), "Question removed") }, "Remove"));
    }))))) : empty("No questions yet. Suggest some or write your own."), h("form", { class: "row", onSubmit: async (e) => { e.preventDefault(); if (!qText.value.trim()) {
            qText.focus();
            return;
        } await setQuestions([...fresh().questions, { id: newId(), theme: qTheme.value.trim() || "General", text: qText.value.trim(), followUps: [], asked: false }], "Question added"); } }, qTheme, qText, h("button", { type: "submit" }, "Add question")));
    // --- live notes with an interview clock
    const notes = h("textarea", { rows: 10, value: iv.notes, "aria-label": "Interview notes", class: "notes-live" });
    let timer;
    const saveNotes = () => { window.clearTimeout(timer); timer = undefined; if (fresh().notes === notes.value)
        return; void persist(() => app.store.save({ ...fresh(), notes: notes.value }), "Notes saved", { rerender: false }); };
    notes.addEventListener("input", () => { setStatus("Unsaved changes…", "busy"); window.clearTimeout(timer); timer = window.setTimeout(saveNotes, 700); });
    notes.addEventListener("blur", saveNotes);
    app.flush = saveNotes;
    const clockLabel = h("span", { class: "meta", role: "timer" }, clocks.has(iv.id) ? "Clock running" : "Clock stopped");
    const line = h("input", { type: "text", placeholder: "Quick note (Enter adds it with the time)", "aria-label": "Timestamped note" });
    const live = section("During the interview", h("div", { class: "row" }, h("button", { type: "button", onClick: () => { if (clocks.has(iv.id)) {
            clocks.delete(iv.id);
            clockLabel.textContent = "Clock stopped";
        }
        else {
            clocks.set(iv.id, Date.now());
            clockLabel.textContent = "Clock running from 00:00";
        } } }, clocks.has(iv.id) ? "Stop clock" : "Start clock"), clockLabel), h("form", { class: "row", onSubmit: (e) => { e.preventDefault(); if (!line.value.trim())
            return; const start = clocks.get(iv.id); notes.value = (notes.value && !notes.value.endsWith("\n") ? notes.value + "\n" : notes.value) + (start ? stamp(start) : "") + line.value.trim() + "\n"; line.value = ""; saveNotes(); } }, line, h("button", { type: "submit" }, "Add")), notes, h("p", { class: "hint" }, "Notes save automatically. They are your notes, not a transcript."), recorder(iv));
    // --- transcript (original locked once saved) and quotes
    const transcript = section("Transcript", iv.transcriptOriginal ? transcriptLocked(iv) : transcriptEntry(iv));
    const manualQuote = h("details", { class: "subpanel" }, h("summary", null, "Add a quote from notes or a recording"), quoteForm(iv, ""));
    return h("div", null, h("p", { class: "crumbs" }, link("#/tool/quill", "Quill"), " / ", link(`#/quill/${p.id}`, p.title)), h("div", { class: "page-head" }, h("h1", null, iv.title), h("div", { class: "row" }, h("button", { type: "button", onClick: () => { download(`${iv.title.replace(/[^\w-]+/g, "-").toLowerCase()}.md`, interviewMarkdown(fresh(), quotesOf((x) => x.interviewId === iv.id))); setStatus("Interview file created"); } }, "Export interview"), h("button", { class: "danger", type: "button", onClick: async () => { if (!confirm("Move this interview to the Trash? Its quotes stay in the project."))
            return; app.flush = null; if (await persist(() => app.store.trash(iv.id).then(() => true), "Interview moved to Trash"))
            go(`#/quill/${p.id}`); } }, "Delete"))), section("Details and brief", details), questions, live, iv.recordingConsent === "granted" ? recordingSection(iv, p) : null, transcript, section(`Quotes from this interview (${quotes.length})`, quotes.length ? quoteList(quotes) : empty("No quotes yet. Select words in the original transcript, or add one from your notes."), manualQuote));
}
/** AI-written questions from the brief and research. Unverified claims go to the AI marked as such, so it asks neutrally. */
function aiQuestions(p, fresh, setQuestions) {
    const out = h("div");
    const btn = h("button", { type: "button" }, "Write questions with AI");
    btn.addEventListener("click", () => {
        const iv = fresh();
        const claims = claimsOf(p);
        void runAi(btn, out, () => ai("/v1/quill/questions", {
            interviewee: iv.interviewee, role: iv.role, type: iv.type, brief: iv.brief, researchQuestions: p.questions, context: [p.title, p.description, ...p.clubs, ...p.people].filter(Boolean).join(". "),
            confirmedFacts: claims.filter((c) => c.status === "confirmed").map((c) => c.title),
            unverifiedClaims: claims.filter((c) => c.status !== "confirmed").map((c) => `${c.title} (${c.status})`),
        }), (r) => {
            const add = (list) => {
                const have = new Set(fresh().questions.map((x) => x.text));
                const qs = list.filter((x) => !have.has(x.text)).map((x) => ({ id: newId(), theme: x.theme || "AI suggestions", text: x.text, followUps: x.followUps, asked: false, basedOn: "ai" }));
                return setQuestions([...fresh().questions, ...qs], `${qs.length} question(s) added`);
            };
            const usable = r.questions.filter((x) => !x.withheld);
            return aiBox(`${plural(r.questions.length, "suggested question", "suggested questions")}`, usable.length ? h("button", { type: "button", class: "small primary", onClick: () => void add(usable) }, usable.length === r.questions.length ? "Add all" : `Add the ${usable.length} usable`) : null, h("ul", { class: "items" }, ...r.questions.map((x) => h("li", { class: x.withheld ? "withheld" : "" }, h("span", null, h("strong", null, x.theme + ": "), x.text, ...x.followUps.map((f) => h("span", { class: "meta followup" }, "Follow-up: " + f)), h("span", { class: "meta followup" }, "Why: " + x.why), x.withheld ? h("span", { class: "status err" }, ` Not offered: ${x.problem}. Check the facts before asking anything like it.`) : null), x.withheld ? null : h("button", { type: "button", class: "small", onClick: () => void add([x]) }, "Add")))), h("p", { class: "hint" }, "Before asking, check what each question takes for granted (their time at the club, results, what others said) against your research: the AI can assume things that are not true. Questions with names, numbers or lengths of time that are not in your research are held back."));
        });
    });
    return h("div", { class: "ai-inline" }, btn, out);
}
/**
 * Free recording and live transcription in the browser. Only offered when the interviewee agreed to be recorded.
 * The recording is made on this computer and downloaded as a file; nothing is uploaded by Inkling.
 * Live transcription uses Chrome's built-in speech recognition, which sends the audio to Google: free, but not private.
 */
function recorder(iv) {
    const box = h("div", { class: "recorder" });
    if (iv.recordingConsent !== "granted") {
        box.append(h("p", { class: "hint" }, "Recording and live transcription are available once you record that the interviewee agreed to be recorded (Details › Recording consent)."));
        return box;
    }
    const SR = globalThis.SpeechRecognition ?? globalThis.webkitSpeechRecognition;
    const draft = h("textarea", { rows: 8, "aria-label": "Live transcript draft", placeholder: "With a live transcript on, the words appear here as people speak (every 20 seconds or so when private). Correct anything misheard before saving it." });
    const state = h("span", { class: "meta", role: "status" }, "Not recording");
    // Live transcript: private (Whisper on this laptop, a few seconds behind), Chrome's (instant, but the audio goes to Google), or off.
    const mode = h("select", { "aria-label": "Live transcript" }, h("option", { value: "private", selected: true }, "Live transcript: private, on this laptop (needs Start Inkling)"), SR ? h("option", { value: "chrome" }, "Live transcript: Chrome's (instant, but the audio is sent to Google)") : null, h("option", { value: "off" }, "No live transcript (record only)"));
    let rec = null;
    let chunks = [];
    let sr = null;
    let started = 0;
    let stream = null;
    let ctx = null;
    let pending = [];
    let pendingLen = 0;
    let sent = 0;
    let busy = Promise.resolve();
    const download = h("div");
    /** Send what has been heard so far (about 20 seconds at a time) to the private transcriber. */
    const flush = (final = false) => {
        if (!pendingLen || (!final && pendingLen < 20 * 16_000))
            return;
        const piece = new Float32Array(pendingLen);
        let o = 0;
        for (const p of pending) {
            piece.set(p, o);
            o += p.length;
        }
        const offset = sent / 16_000;
        sent += pendingLen;
        pending = [];
        pendingLen = 0;
        busy = busy.then(async () => {
            try {
                for (const s of await transcribeChunk(piece, offset))
                    draft.value += `[${formatStamp(s.start)}] ${s.text.trim()}\n`;
            }
            catch (e) {
                state.textContent = `Live transcript paused: ${e.message}`;
            }
        });
    };
    const start = async () => {
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        }
        catch {
            state.textContent = "The microphone was blocked. Allow it in the address bar and try again.";
            return;
        }
        chunks = [];
        started = Date.now();
        sent = 0;
        pending = [];
        pendingLen = 0;
        rec = new MediaRecorder(stream);
        rec.ondataavailable = (e) => { if (e.data.size)
            chunks.push(e.data); };
        rec.onstop = () => {
            const blob = new Blob(chunks, { type: rec?.mimeType || "audio/webm" });
            const url = URL.createObjectURL(blob);
            void storeRecording(iv.id, blob).then(() => { setStatus("Recording stored in this browser: transcribe it privately below"); app.render(); }).catch((e) => setStatus(e.message, "err"));
            download.replaceChildren(h("a", { href: url, download: `${iv.title.replace(/[^\w-]+/g, "-")}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.webm` }, "Download the recording"), h("span", { class: "hint" }, " Also keep your own copy: the browser can clear stored data."));
        };
        rec.start(1000);
        if (mode.value === "private") {
            ctx = new AudioContext({ sampleRate: 16_000 });
            const src = ctx.createMediaStreamSource(stream);
            const proc = ctx.createScriptProcessor(4096, 1, 1);
            proc.onaudioprocess = (e) => { const d = e.inputBuffer.getChannelData(0); pending.push(new Float32Array(d)); pendingLen += d.length; flush(); };
            src.connect(proc);
            proc.connect(ctx.destination);
        }
        else if (mode.value === "chrome" && SR) {
            sr = new SR();
            sr.continuous = true;
            sr.interimResults = false;
            sr.lang = "en-GB";
            sr.onresult = (e) => { for (let i = e.resultIndex; i < e.results.length; i++)
                if (e.results[i].isFinal)
                    draft.value += `${stamp(started)}${e.results[i][0].transcript.trim()}\n`; };
            sr.onend = () => { if (rec?.state === "recording") {
                try {
                    sr.start();
                }
                catch { /* already restarting */ }
            } }; // Chrome stops after silences; keep listening
            try {
                sr.start();
            }
            catch { /* unsupported */ }
        }
        state.textContent = mode.value === "off" ? "Recording…" : "Recording and transcribing…";
        startBtn.disabled = true;
        stopBtn.disabled = false;
        mode.disabled = true;
    };
    const stop = () => {
        try {
            sr?.stop();
        }
        catch { /* ignore */ }
        sr = null;
        if (ctx) {
            flush(true);
            void ctx.close();
            ctx = null;
        }
        if (rec?.state === "recording")
            rec.stop();
        stream?.getTracks().forEach((t) => t.stop());
        stream = null;
        state.textContent = "Stopped";
        startBtn.disabled = false;
        stopBtn.disabled = true;
        mode.disabled = false;
    };
    const startBtn = h("button", { type: "button", class: "primary", onClick: () => void start() }, "Start recording");
    const stopBtn = h("button", { type: "button", disabled: true, onClick: stop }, "Stop");
    box.append(h("h3", null, "Record (free)"), h("div", { class: "row" }, startBtn, stopBtn, state), mode, draft, download, h("div", { class: "row" }, h("button", { type: "button", onClick: async () => {
            const cur = app.store.get(iv.id);
            if (!draft.value.trim()) {
                setStatus("There is no transcript yet.", "err");
                return;
            }
            if (cur.transcriptOriginal) {
                setStatus("This interview already has an original transcript, which is locked.", "err");
                return;
            }
            if (!confirm("Save this live draft as the original transcript? A full private transcription of the stored recording (below) is usually more accurate and lets you set who is speaking. It will be locked once saved."))
                return;
            await persist(() => app.store.save({ ...cur, transcriptOriginal: draft.value, transcriptEdited: draft.value }), "Original transcript saved and locked");
        } }, "Save the live draft as the original transcript")), h("p", { class: "hint" }, "The live draft is for following along. After you stop, the recording is kept in this browser: transcribe it fully below, check who said what, then lock it."));
    return box;
}
function transcriptEntry(iv) {
    const t = h("textarea", { rows: 8, "aria-label": "Paste the transcript", placeholder: "Paste the transcript exactly as transcribed." });
    return h("div", null, h("p", null, "Paste the transcript once, exactly as it was transcribed. It is then locked as the original; you can tidy a separate edited copy."), t, h("button", { type: "button", onClick: async () => {
            if (!t.value.trim()) {
                setStatus("Paste the transcript first.", "err");
                return;
            }
            if (!confirm("Save this as the original transcript? It will be locked and cannot be changed afterwards."))
                return;
            await persist(() => app.store.save({ ...app.store.get(iv.id), transcriptOriginal: t.value, transcriptEdited: t.value }), "Original transcript saved and locked");
        } }, "Save as original transcript"));
}
function transcriptLocked(iv) {
    const orig = h("textarea", { rows: 10, readOnly: true, value: iv.transcriptOriginal, "aria-label": "Original transcript (locked)" });
    const holder = h("div");
    let player = null;
    const playerBox = h("div");
    void recordingPlayer(iv.id).then((pl) => { player = pl; if (pl)
        playerBox.replaceChildren(pl, h("button", { type: "button", class: "small", onClick: () => { const t = stampAt(orig.value, orig.selectionStart); if (t === null) {
                setStatus("Click in a line that starts with a time, like [03:12].", "err");
                return;
            } playFrom(player, t); } }, "Play from the line where the cursor is")); });
    const edited = h("textarea", { rows: 8, value: iv.transcriptEdited, "aria-label": "Edited copy of the transcript" });
    return h("div", null, h("h3", null, "Original (locked)"), playerBox, orig, h("div", { class: "row" }, h("button", { type: "button", onClick: () => {
            const sel = spokenWords(orig.value.slice(orig.selectionStart, orig.selectionEnd)); // timestamps and speaker names are not part of the quote
            if (!sel) {
                setStatus("Select the exact words in the original transcript first.", "err");
                orig.focus();
                return;
            }
            const at = stampAt(orig.value, orig.selectionStart);
            const who = speakerAt(orig.value, orig.selectionStart);
            if (who === "Interviewer") {
                setStatus("Those words are labelled as the interviewer's, not the interviewee's.", "err");
                return;
            }
            holder.replaceChildren(quoteForm(iv, sel, at === null ? "Original transcript" : `Original transcript at ${formatStamp(at)}`, at ?? -1, who));
        } }, "Save selected words as a quote"), h("span", { class: "hint" }, "Quotes are taken word for word from the original, never from the edited copy.")), holder, bestQuotes(iv), h("h3", null, "Edited copy (not verbatim)"), edited, h("button", { type: "button", onClick: () => void persist(() => app.store.save({ ...app.store.get(iv.id), transcriptEdited: edited.value }), "Edited copy saved") }, "Save edited copy"));
}
/** AI picks the strongest quotes from the interviewee's lines; each is checked to be the transcript's own words. */
function bestQuotes(iv) {
    const out = h("div");
    const btn = h("button", { type: "button" }, "Find the strongest quotes (AI)");
    btn.addEventListener("click", () => void runAi(btn, out, () => ai("/v1/quill/bestquotes", { transcript: iv.transcriptOriginal, speaker: iv.interviewee }, 300_000), (r) => {
        const have = new Set(app.store.records().filter((x) => x.kind === "quote" && x.interviewId === iv.id && !x.deletedAt).map((x) => x.title));
        return aiBox(`${r.quotes.length} strong quote(s)`, r.quotes.length ? h("ul", { class: "items" }, ...r.quotes.map((x) => h("li", null, h("span", null, `“${x.quote}”`, h("span", { class: "meta followup" }, `${x.at} · ${x.why}`)), have.has(x.quote) ? h("span", { class: "status ok" }, "Saved") : h("button", { type: "button", class: "small", onClick: async (e) => {
                const at = parseStamp(x.at) ?? -1;
                const q = newQuote(app.store.get(iv.id), x.quote, { speaker: iv.interviewee, origin: `Original transcript at ${x.at}`, audioAt: at });
                if (await persist(() => app.store.save(q), "Quote saved and locked", { rerender: false }))
                    e.target.replaceWith(h("span", { class: "status ok" }, "Saved"));
            } }, "Save as quote")))) : h("p", null, `No quotes found in lines labelled “${iv.interviewee}”.`), h("p", { class: "hint" }, "Each quote is checked to be word for word from the transcript and from the interviewee's own lines. Listen back before you use one."));
    }));
    return h("div", { class: "ai-inline" }, btn, out);
}
function quoteForm(iv, exact, origin = "", audioAt = -1, who = "") {
    const text = h("textarea", { rows: 3, value: exact, readOnly: !!exact, "aria-label": "Exact words" });
    const speaker = h("input", { type: "text", value: who || iv.interviewee });
    const context = h("input", { type: "text", placeholder: "What question or topic prompted it?" });
    const from = h("input", { type: "text", value: origin, placeholder: "e.g. Notes, Recording at 12:40" });
    const unsure = h("input", { type: "checkbox" });
    return h("form", { class: "quote-form", onSubmit: async (e) => {
            e.preventDefault();
            if (!text.value.trim()) {
                setStatus("A quote needs the exact words.", "err");
                return;
            }
            if (!speaker.value.trim()) {
                setStatus("Say who said it.", "err");
                return;
            }
            const s = await persist(() => app.store.save(newQuote(app.store.get(iv.id), text.value, { speaker: speaker.value.trim(), context: context.value.trim(), origin: from.value.trim(), uncertain: unsure.checked, audioAt })), "Quote saved and locked");
            if (s)
                go(`#/interview/${iv.id}`);
        } }, field("Exact words", text, exact ? "Taken directly from the original transcript." : "Type the words exactly as said. They are locked once saved."), h("div", { class: "grid tight" }, field("Speaker", speaker), field("Context", context), field("Where it is from", from)), h("label", { class: "check" }, unsure, h("span", null, "Wording is uncertain (unclear audio or note): check before use")), h("button", { class: "primary", type: "submit" }, "Save quote"));
}
export function quotePage(x) {
    const iv = app.store.get(x.interviewId);
    const p = app.store.get(x.projectId);
    const chain = [];
    let cur = x;
    while (cur?.supersedes) {
        cur = app.store.get(cur.supersedes);
        if (cur)
            chain.push(cur);
    }
    const newer = x.supersededBy ? app.store.get(x.supersededBy) : undefined;
    const speaker = h("input", { type: "text", value: x.speaker });
    const context = h("input", { type: "text", value: x.context });
    const origin = h("input", { type: "text", value: x.origin });
    const unsure = h("input", { type: "checkbox", checked: x.uncertain });
    const corrected = h("textarea", { rows: 3, value: x.title, "aria-label": "Corrected wording" });
    const why = h("input", { type: "text", placeholder: "Why? e.g. checked against the recording", "aria-label": "Reason for correction" });
    return h("div", null, h("p", { class: "crumbs" }, link("#/tool/quill", "Quill"), " / ", p ? link(`#/quill/${p.id}`, p.title) : "", iv ? " / " : "", iv ? link(`#/interview/${iv.id}`, iv.title) : ""), h("h1", null, "Quote"), newer ? h("p", { class: "status err" }, "This wording was corrected. ", link(`#/quote/${newer.id}`, "See the current version.")) : null, h("blockquote", { class: "quote" }, h("p", null, `“${x.title}”`), h("footer", null, `— ${x.speaker}${x.date ? ", " + fmtDate(x.date) : ""}${x.origin ? " (" + x.origin + ")" : ""}`)), x.uncertain ? h("p", { class: "status err" }, "Wording marked uncertain: check it before publishing.") : null, iv?.transcriptOriginal && !x.supersedes && !quoteInTranscript(x.title, iv.transcriptOriginal) ? h("p", { class: "status warn" }, "These words are not in the interview's original transcript word for word. Check them against the recording or your notes.") : null, x.audioAt >= 0 && iv ? (() => { const box = h("div", { class: "row" }); void recordingPlayer(iv.id).then((pl) => { if (pl)
        box.replaceChildren(pl, h("button", { type: "button", onClick: () => playFrom(pl, x.audioAt) }, `Play this moment (${formatStamp(x.audioAt)})`)); }); return box; })() : null, section("Details", h("form", { onSubmit: async (e) => { e.preventDefault(); await persist(() => app.store.save({ ...app.store.get(x.id), speaker: speaker.value.trim() || x.speaker, context: context.value.trim(), origin: origin.value.trim(), uncertain: unsure.checked }), "Quote details saved"); } }, h("div", { class: "grid tight" }, field("Speaker", speaker), field("Context", context), field("Where it is from", origin)), h("label", { class: "check" }, unsure, h("span", null, "Wording is uncertain")), h("button", { class: "primary", type: "submit" }, "Save details")), h("p", { class: "hint" }, "The words themselves cannot be edited. If they were recorded wrongly, correct them below: the original is kept and linked.")), x.supersededBy ? null : h("details", { class: "panel" }, h("summary", null, h("strong", null, "Correct wording")), h("form", { onSubmit: async (e) => {
            e.preventDefault();
            if (!corrected.value.trim() || corrected.value === x.title) {
                setStatus("Enter the corrected words.", "err");
                return;
            }
            if (!iv) {
                setStatus("The interview for this quote is missing.", "err");
                return;
            }
            const nq = newQuote(iv, corrected.value, { speaker: x.speaker, context: x.context, origin: [x.origin, why.value.trim() && "corrected: " + why.value.trim()].filter(Boolean).join("; "), uncertain: false, supersedes: x.id });
            const s = await persist(() => app.store.save(nq, { ...app.store.get(x.id), supersededBy: nq.id }), "Corrected version saved; original kept");
            if (s)
                go(`#/quote/${nq.id}`);
        } }, corrected, why, h("button", { type: "submit" }, "Save corrected version"))), chain.length ? section("Earlier versions", h("ul", { class: "items" }, ...chain.map((c) => h("li", null, link(`#/quote/${c.id}`, `“${c.title}”`), h("span", { class: "meta" }, fmtDate(new Date(c.createdAt).toISOString().slice(0, 10))))))) : null, h("div", { class: "row" }, h("button", { class: "danger", type: "button", onClick: async () => { if (!confirm("Move this quote to the Trash?"))
            return; if (await persist(() => app.store.trash(x.id).then(() => true), "Quote moved to Trash"))
            go(iv ? `#/interview/${iv.id}` : "#/tool/quill"); } }, "Delete quote")));
}
