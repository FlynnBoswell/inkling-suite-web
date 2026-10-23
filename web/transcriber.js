import { h } from "../extension/dom.js";
import { askedQuestions, formatStamp, guessSpeaker, nameFixes, transcriptText } from "../core/suite/transcript.js";
import { app, persist, section, setStatus } from "./ui.js";
import { decodeTo16k, deleteRecording, getRecording, saveRecording, transcribe } from "./audio.js";
/**
 * Quill's recording and private transcription: keep the interview recording in this browser, turn it into text on
 * this laptop (Whisper, through Start Inkling), label who is speaking, fix misheard names, then lock it as the
 * original transcript. Every line keeps its time, so quotes can be played back from the recording.
 */
/** A player for the interview's stored recording, or null if there is none. Shared so lines and quotes can seek it. */
export async function recordingPlayer(interviewId) {
    const blob = await getRecording(interviewId);
    if (!blob)
        return null;
    return h("audio", { controls: true, preload: "metadata", src: URL.createObjectURL(blob), class: "recording", "aria-label": "Interview recording" });
}
export function playFrom(player, sec) {
    if (!player) {
        setStatus("The recording is not stored in this browser.", "err");
        return;
    }
    player.currentTime = Math.max(0, sec - 1);
    void player.play().catch(() => { });
}
export function recordingSection(iv0, p) {
    const fresh = () => app.store.get(iv0.id);
    const body = h("div");
    const draw = async () => {
        const player = await recordingPlayer(iv0.id);
        const file = h("input", { type: "file", accept: "audio/*,.m4a,.mp3,.wav,.webm,.ogg", "aria-label": "Add a recording file" });
        file.addEventListener("change", async () => {
            const f = file.files?.[0];
            if (!f)
                return;
            if (f.size > 500_000_000) {
                setStatus("That file is over 500 MB. Use a compressed recording (MP3 or M4A).", "err");
                return;
            }
            try {
                await saveRecording(iv0.id, f);
                setStatus("Recording stored in this browser");
                void draw();
            }
            catch (e) {
                setStatus(e.message, "err");
            }
        });
        const out = h("div");
        const go = h("button", { type: "button", class: "primary" }, "Transcribe privately on this laptop");
        const speed = h("select", { "aria-label": "Transcription speed" }, h("option", { value: "accurate" }, "Accurate (best for quotes)"), h("option", { value: "fast" }, "Fast (takes about 40% less time, more misheard words)"));
        let stop = false;
        go.addEventListener("click", async () => {
            const blob = await getRecording(iv0.id);
            if (!blob)
                return;
            go.disabled = true;
            stop = false;
            const bar = h("progress", { max: 100, value: 0 });
            const label = h("span", { class: "meta" }, "Reading the audio…");
            const cancel = h("button", { type: "button", class: "small", onClick: () => { stop = true; label.textContent = "Stopping after this minute…"; } }, "Stop");
            const live = h("div", { class: "live-transcript", "aria-live": "polite", "aria-label": "Transcript so far" });
            out.replaceChildren(h("div", { class: "row" }, bar, label, cancel), live);
            const started = Date.now();
            try {
                const samples = await decodeTo16k(blob);
                const fast = speed.value === "fast";
                label.textContent = `0:00 of ${formatStamp(samples.length / 16_000)} transcribed (the first time, the speech model downloads: about ${fast ? "80" : "250"} MB)`;
                const raw = await transcribe(samples, (done, total, soFar) => {
                    bar.value = Math.round(done / total * 100);
                    // Time left from the pace so far (the first minute includes loading the model, so it is only shown after that).
                    const perSec = (Date.now() - started) / 1000 / done;
                    const left = Math.round((total - done) * perSec / 60);
                    label.textContent = `${formatStamp(done)} of ${formatStamp(total)} transcribed${done < total && done >= 60 ? ` · about ${left < 1 ? "under a minute" : `${left} min`} left` : ""}`;
                    // The words so far, readable while the rest is still being worked on.
                    live.replaceChildren(...soFar.map((s) => h("p", null, h("span", { class: "meta" }, formatStamp(s.start) + " "), s.text)));
                    live.scrollTop = live.scrollHeight;
                }, () => stop, fast);
                out.replaceChildren(reviewer(fresh(), p, raw.map((s) => ({ ...s, speaker: guessSpeaker(s.text, fresh().interviewee || "Interviewee") })), player));
            }
            catch (e) {
                out.replaceChildren(h("p", { class: "status err" }, e.message || "Transcription failed."));
            }
            finally {
                go.disabled = false;
            }
        });
        body.replaceChildren(player ? h("div", null, player, h("div", { class: "row" }, go, speed, h("button", { type: "button", class: "small danger", onClick: async () => { if (!confirm("Remove the recording from this browser? Download it first if you need to keep it."))
                return; await deleteRecording(iv0.id); setStatus("Recording removed"); void draw(); } }, "Remove recording"), h("a", { href: player.src, download: `${iv0.title.replace(/[^\w-]+/g, "-").toLowerCase()}-recording` }, "Download it")))
            : h("p", { class: "hint" }, "No recording stored yet. Record above, or add a file from your phone or recorder."), h("div", { class: "row" }, file), h("p", { class: "hint" }, "Recordings stay in this browser and are copied to your automatic backup folder if you have one (not to export files). Transcription runs on this laptop with Start Inkling: nothing is sent anywhere. On this laptop it takes about 40% of the recording's length (a 20-minute interview: about 8 minutes), or about 25% in Fast mode."), out);
    };
    void draw();
    return section("Recording and private transcript", body);
}
/** Review the machine transcript: who is speaking, misheard names, then lock it as the original. */
function reviewer(iv, p, segs, player) {
    const speakers = [iv.interviewee || "Interviewee", "Interviewer"];
    const quotes = app.store.records().filter((r) => r.kind === "quote" && r.projectId === p.id);
    const names = [...new Set([...p.people, ...p.clubs, iv.interviewee, ...quotes.map((q) => q.speaker)].filter(Boolean))];
    const list = h("ol", { class: "segments" });
    const draw = () => list.replaceChildren(...segs.map((s, i) => {
        const text = h("textarea", { rows: 2, value: s.text, "aria-label": `Words at ${formatStamp(s.start)}` });
        text.addEventListener("input", () => { s.text = text.value; });
        const who = h("select", { "aria-label": `Speaker at ${formatStamp(s.start)}` }, ...speakers.map((n) => h("option", { value: n, selected: s.speaker === n }, n)));
        who.addEventListener("change", () => { s.speaker = who.value; });
        const fixes = nameFixes(s.text, names);
        return h("li", null, h("div", { class: "row" }, h("button", { type: "button", class: "small", title: "Play from here", onClick: () => playFrom(player, s.start) }, `▶ ${formatStamp(s.start)}`), who, i > 0 ? h("button", { type: "button", class: "small", title: "Join with the line above", onClick: () => { const prev = segs[i - 1]; prev.text = `${prev.text} ${s.text}`; prev.end = s.end; segs.splice(i, 1); draw(); } }, "Join above") : null), text, fixes.length ? h("div", { class: "row" }, ...fixes.map((f) => h("button", { type: "button", class: "small", onClick: () => { s.text = s.text.replace(f.from, f.to); draw(); } }, `“${f.from}” → “${f.to}”?`))) : null);
    }));
    draw();
    const save = h("button", { type: "button", class: "primary", onClick: async () => {
            const cur = app.store.get(iv.id);
            if (cur.transcriptOriginal) {
                setStatus("This interview already has an original transcript, which is locked.", "err");
                return;
            }
            if (!confirm("Save this as the original transcript? Listen back to anything unclear first: it is locked once saved."))
                return;
            const text = transcriptText(segs);
            // Tick the planned questions that the transcript shows were asked.
            const asked = new Set(askedQuestions(text, cur.questions));
            await persist(() => app.store.save({ ...cur, transcriptOriginal: text, transcriptEdited: text, questions: cur.questions.map((q) => (asked.has(q.id) ? { ...q, asked: true } : q)) }), asked.size ? `Original transcript saved and locked; ${asked.size} planned question(s) ticked as asked` : "Original transcript saved and locked");
        } }, "Save as the original transcript");
    return h("div", { class: "data-box" }, h("h3", null, `Check the transcript (${segs.length} lines)`), h("p", { class: "hint" }, "Lines ending in a question are guessed to be yours: set who is speaking on each line, join lines that belong together, and listen back to anything unclear. Names that look misheard (compared with this project's people, clubs and quote speakers) are offered as fixes. Machine transcription makes mistakes: never quote anything you have not checked against the recording."), list, h("div", { class: "row" }, save));
}
/** Keep a fresh recording made with the recorder. */
export const storeRecording = (interviewId, blob) => saveRecording(interviewId, blob);
