/**
 * Interview recordings, kept in this browser only (their own small database, separate from projects, so exports stay
 * small), and turned into text by the private speech-to-text on this laptop (Start Inkling).
 */
import { ai } from "./ai.js";
const DB = "inkling-audio", STORE = "recordings";
function open() {
    return new Promise((resolve, reject) => {
        const r = indexedDB.open(DB, 1);
        r.onupgradeneeded = () => r.result.createObjectStore(STORE);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error ?? new Error("Could not open the recordings store."));
    });
}
async function tx(mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        t.oncomplete = () => { db.close(); resolve(req.result); };
        t.onerror = t.onabort = () => { db.close(); reject(t.error ?? new Error("The recording could not be saved (storage may be full).")); };
    });
}
export const saveRecording = (interviewId, blob) => tx("readwrite", (s) => s.put(blob, interviewId));
export const getRecording = (interviewId) => tx("readonly", (s) => s.get(interviewId)).catch(() => undefined);
export const deleteRecording = (interviewId) => tx("readwrite", (s) => s.delete(interviewId));
export const recordingIds = () => tx("readonly", (s) => s.getAllKeys()).then((k) => k.map(String)).catch(() => []);
/** The recording as 16 kHz mono samples (what speech-to-text needs). Works for WebM, MP3, M4A, WAV and OGG in Chrome. */
export async function decodeTo16k(blob) {
    const ctx = new AudioContext();
    let decoded;
    try {
        decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    }
    catch {
        throw new Error("This audio file could not be read. Use an MP3, M4A, WAV or WebM recording.");
    }
    finally {
        void ctx.close();
    }
    const length = Math.ceil(decoded.duration * 16_000);
    const off = new OfflineAudioContext(1, Math.max(1, length), 16_000);
    const src = off.createBufferSource();
    src.buffer = decoded;
    src.connect(off.destination);
    src.start();
    return (await off.startRendering()).getChannelData(0);
}
function toBase64Int16(samples) {
    const bytes = new Uint8Array(samples.length * 2);
    const dv = new DataView(bytes.buffer);
    for (let i = 0; i < samples.length; i++)
        dv.setInt16(i * 2, Math.max(-1, Math.min(1, samples[i])) * 32767, true);
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000)
        s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
}
/** Transcribe one piece of 16 kHz audio that starts `offset` seconds into the recording. */
export async function transcribeChunk(samples, offset) {
    return (await ai("/v1/quill/transcribe", { pcm: toBase64Int16(samples), offset }, 300_000)).segments;
}
/**
 * Transcribe in 60-second pieces, reporting progress. Each piece is cut at the quietest moment near its end so
 * words are not split between pieces.
 */
export async function transcribe(samples, onProgress, shouldStop = () => false, fast = false) {
    const RATE = 16_000, total = samples.length / RATE;
    const out = [];
    let pos = 0;
    while (pos < samples.length) {
        if (shouldStop())
            break;
        let end = Math.min(samples.length, pos + 60 * RATE);
        if (end < samples.length) { // look back up to 5 s for the quietest 100 ms
            let best = end, bestE = Infinity;
            for (let t = end; t > end - 5 * RATE; t -= RATE / 10) {
                let e = 0;
                for (let i = t - RATE / 10; i < t; i++)
                    e += samples[i] * samples[i];
                if (e < bestE) {
                    bestE = e;
                    best = t;
                }
            }
            end = best;
        }
        const r = await ai("/v1/quill/transcribe", { pcm: toBase64Int16(samples.subarray(pos, end)), offset: pos / RATE, fast }, 300_000);
        out.push(...r.segments);
        pos = end;
        onProgress(Math.min(total, pos / RATE), total, out);
    }
    return out;
}
