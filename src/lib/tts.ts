// Read-aloud. Uses Gemini TTS through /api/tts (natural voices, one per kind of
// speaker) and falls back to the browser's SpeechSynthesis only when the server
// has no AI. Captions never depend on audio.

export type VoiceRole = "robot" | "kid" | "teacher" | "scientist" | "astronaut" | "narrator";

export function ttsSupported(): boolean {
  return typeof window !== "undefined" && ("speechSynthesis" in window || "Audio" in window);
}

// ---------- Gemini voices ----------
// /api/tts streams raw 16-bit PCM. Playback starts with the first chunk
// (about a second) instead of waiting for the whole line.

let geminiOff = false; // set when the server says voice isn't available

interface Line {
  rate: number;
  chunks: Float32Array[];
  done: boolean;
  failed: boolean;
  /** Called whenever a chunk arrives or the line ends. */
  wake: Set<() => void>;
}
const lines = new Map<string, Line>();
let current: HTMLAudioElement | null = null;
const sources = new Set<AudioBufferSourceNode>();

const keyOf = (text: string, role: VoiceRole, lang: string) => `${role}|${lang}|${text}`;

let ctx: AudioContext | null = null;
function audioContext(): AudioContext | null {
  if (typeof window === "undefined" || !("AudioContext" in window)) return null;
  return (ctx ??= new AudioContext());
}
/** Browsers only let audio start after a user gesture; resume on the next one. */
function unlock() {
  const c = audioContext();
  if (c?.state === "suspended") void c.resume().catch(() => {});
}
if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", unlock, { capture: true });
  window.addEventListener("keydown", unlock, { capture: true });
}

async function load(line: Line, body: { text: string; role: VoiceRole; lang: "en" | "id" }) {
  const end = (failed: boolean) => {
    line.done = true;
    line.failed = failed;
    line.wake.forEach((f) => f());
  };
  try {
    const res = await fetch("/api/tts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (res.status === 503) geminiOff = true;
    if (!res.ok || !res.body) return end(true);
    line.rate = Number(res.headers.get("x-sample-rate")) || 24000;
    const reader = res.body.getReader();
    let odd: number | null = null; // a sample split across two network chunks
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      let bytes = value;
      if (odd !== null) {
        bytes = new Uint8Array(value.length + 1);
        bytes[0] = odd;
        bytes.set(value, 1);
        odd = null;
      }
      if (bytes.length % 2) odd = bytes[bytes.length - 1];
      const f = pcmToFloat(bytes);
      if (f.length) {
        line.chunks.push(f);
        line.wake.forEach((w) => w());
      }
    }
    end(line.chunks.length === 0);
  } catch {
    end(true);
  }
}

/** 16-bit little-endian PCM to Web Audio samples; a trailing odd byte is ignored. */
export function pcmToFloat(bytes: Uint8Array): Float32Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length - (bytes.length % 2));
  const f = new Float32Array(view.byteLength / 2);
  for (let i = 0; i < f.length; i++) f[i] = view.getInt16(i * 2, true) / 32768;
  return f;
}

function getLine(text: string, role: VoiceRole, lang: "en" | "id"): Line {
  const key = keyOf(text, role, lang);
  const known = lines.get(key);
  if (known && !known.failed) return known;
  const line: Line = { rate: 24000, chunks: [], done: false, failed: false, wake: new Set() };
  lines.set(key, line);
  void load(line, { text: text.slice(0, 320), role, lang }).then(() => {
    // Forget failures so a later attempt can retry.
    if (line.failed && lines.get(key) === line) lines.delete(key);
  });
  // ~240 KB per spoken line; keep the recent ones for replays.
  if (lines.size > 60) lines.delete(lines.keys().next().value!);
  return line;
}

/** Start fetching a line's audio now so it's ready when it's spoken. */
export function prefetchLine(text: string, role: VoiceRole, lang: "en" | "id"): void {
  if (!geminiOff && typeof window !== "undefined") getLine(text, role, lang);
}

/** Resolves when the line changes (new chunk, end), after `ms`, or on abort. */
function changed(line: Line, ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(t);
      line.wake.delete(done);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const t = setTimeout(done, ms);
    line.wake.add(done);
    signal.addEventListener("abort", done);
  });
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(t);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const t = setTimeout(done, ms);
    signal.addEventListener("abort", done);
  });

/** Plays chunks through Web Audio as they arrive. False if audio can't start. */
async function playStreaming(line: Line, signal: AbortSignal): Promise<boolean> {
  const c = audioContext();
  if (!c) return false;
  if (c.state !== "running") await Promise.race([c.resume().catch(() => {}), sleep(300, signal)]);
  if (c.state !== "running") return false;
  const mine: AudioBufferSourceNode[] = [];
  let next = c.currentTime + 0.04;
  let i = 0;
  while (!signal.aborted) {
    for (; i < line.chunks.length; i++) {
      const data = line.chunks[i];
      const buf = c.createBuffer(1, data.length, line.rate);
      buf.getChannelData(0).set(data);
      const src = c.createBufferSource();
      src.buffer = buf;
      src.connect(c.destination);
      // A late chunk starts right away instead of in the past.
      next = Math.max(next, c.currentTime + 0.02);
      src.start(next);
      next += buf.duration;
      sources.add(src);
      mine.push(src);
      src.onended = () => sources.delete(src);
    }
    if (line.done) break;
    await changed(line, 15000, signal);
    if (!line.done && i === line.chunks.length) break; // stalled: play what we have
  }
  if (!signal.aborted) await sleep(Math.max(0, (next - c.currentTime) * 1000) + 30, signal);
  if (signal.aborted) for (const src of mine) src.stop();
  return true;
}

function wavUrl(line: Line): string {
  const n = line.chunks.reduce((a, f) => a + f.length, 0);
  const v = new DataView(new ArrayBuffer(44 + n * 2));
  const str = (at: number, s: string) => [...s].forEach((ch, k) => v.setUint8(at + k, ch.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + n * 2, true);
  str(8, "WAVEfmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, line.rate, true);
  v.setUint32(28, line.rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, n * 2, true);
  let at = 44;
  for (const f of line.chunks)
    for (const x of f) {
      v.setInt16(at, Math.max(-1, Math.min(1, x)) * 32767, true);
      at += 2;
    }
  return URL.createObjectURL(new Blob([v.buffer], { type: "audio/wav" }));
}

/** Plays a whole line through <audio>, which keeps the pitch when sped up or slowed down. */
function playUrl(url: string, rate: number, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    const a = new Audio(url);
    a.playbackRate = rate;
    current = a;
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      signal.removeEventListener("abort", onAbort);
      if (current === a) current = null;
      URL.revokeObjectURL(url);
      resolve(ok);
    };
    const onAbort = () => {
      a.pause();
      finish(true);
    };
    a.onended = () => finish(true);
    a.onerror = () => finish(false);
    signal.addEventListener("abort", onAbort);
    a.play().catch(() => finish(false));
  });
}

// ---------- browser fallback ----------

function pickVoice(lang: string): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  const base = lang.slice(0, 2);
  return voices.find((v) => v.lang.startsWith(base) && /natural|neural|google|samantha|aria|jenny/i.test(v.name)) ?? voices.find((v) => v.lang.startsWith(base));
}

/** Resolves true once spoken; false at once when the browser has no voice to speak with. */
function browserSpeak(text: string, opts: { lang: "en" | "id"; rate: number; pitch: number; signal: AbortSignal }): Promise<boolean> {
  if (!("speechSynthesis" in window) || opts.signal.aborted) return Promise.resolve(false);
  const synth = window.speechSynthesis;
  // No installed voices (e.g. headless browsers): nothing would be heard.
  if (!synth.getVoices().length) return Promise.resolve(false);
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = opts.lang === "id" ? "id-ID" : "en-US";
    const v = pickVoice(u.lang);
    if (v) u.voice = v;
    u.rate = opts.rate;
    u.pitch = opts.pitch;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      opts.signal.removeEventListener("abort", onAbort);
      clearTimeout(guard);
      resolve(true);
    };
    const onAbort = () => {
      synth.cancel();
      finish();
    };
    // Some browsers never fire onend; don't hang the lesson on them.
    const guard = setTimeout(finish, 2500 + text.length * 120);
    u.onend = finish;
    u.onerror = finish;
    opts.signal.addEventListener("abort", onAbort);
    synth.cancel();
    synth.speak(u);
  });
}

/** Speaks `text`; resolves when finished or cancelled: true if it was heard, false if nothing played. */
export async function speak(text: string, opts: { lang: "en" | "id"; rate: number; pitch: number; role: VoiceRole; signal: AbortSignal }): Promise<boolean> {
  if (typeof window === "undefined" || opts.signal.aborted) return false;
  if (!geminiOff) {
    // Lines are prefetched, so audio is usually already arriving. A slow line
    // waits (its caption is already showing) instead of switching to the
    // robotic browser voice mid-lesson; that voice is only for servers without Gemini.
    const line = getLine(text, opts.role, opts.lang);
    const until = Date.now() + 12000;
    while (!line.chunks.length && !line.done && !opts.signal.aborted && Date.now() < until) await changed(line, until - Date.now(), opts.signal);
    if (opts.signal.aborted) return true;
    if (line.chunks.length) {
      if (opts.rate === 1) return playStreaming(line, opts.signal);
      // Another speed: Web Audio would shift the pitch, so play the finished line instead.
      while (!line.done && !opts.signal.aborted) await changed(line, 15000, opts.signal);
      if (opts.signal.aborted) return true;
      if (await playUrl(wavUrl(line), opts.rate, opts.signal)) return true;
    }
    if (!geminiOff) return false;
  }
  return browserSpeak(text, opts);
}

export function stopSpeaking() {
  // Let a waiting lesson move on: a paused <audio> never fires "ended" by itself.
  current?.pause();
  current?.dispatchEvent(new Event("ended"));
  current = null;
  for (const src of sources) src.stop();
  sources.clear();
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}
