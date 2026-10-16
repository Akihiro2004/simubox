// Read-aloud. Uses Gemini TTS through /api/tts (natural voices, one per kind of
// speaker) and falls back to the browser's SpeechSynthesis only when the server
// has no AI. Captions never depend on audio.

export type VoiceRole = "robot" | "kid" | "teacher" | "scientist" | "astronaut" | "narrator";

export function ttsSupported(): boolean {
  return typeof window !== "undefined" && ("speechSynthesis" in window || "Audio" in window);
}

// ---------- Gemini voices ----------

let geminiOff = false; // set when the server says voice isn't available
const audioCache = new Map<string, Promise<string | null>>();
let current: HTMLAudioElement | null = null;

const keyOf = (text: string, role: VoiceRole, lang: string) => `${role}|${lang}|${text}`;

/** Start fetching a line's audio now so it's ready when it's spoken. */
export function prefetchLine(text: string, role: VoiceRole, lang: "en" | "id"): Promise<string | null> {
  if (geminiOff || typeof window === "undefined") return Promise.resolve(null);
  const key = keyOf(text, role, lang);
  let p = audioCache.get(key);
  if (!p) {
    p = fetch("/api/tts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: text.slice(0, 320), role, lang }) })
      .then(async (res) => {
        if (res.status === 503) geminiOff = true;
        if (!res.ok) return null;
        return URL.createObjectURL(await res.blob());
      })
      .catch(() => null);
    audioCache.set(key, p);
    // Forget failures so a later attempt can retry.
    void p.then((url) => url ?? audioCache.delete(key));
    if (audioCache.size > 120) {
      const [oldKey, old] = audioCache.entries().next().value!;
      audioCache.delete(oldKey);
      void old.then((u) => u && URL.revokeObjectURL(u));
    }
  }
  return p;
}

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

const timeout = <T>(p: Promise<T>, ms: number, fallback: T) => Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);

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
    // Lines are prefetched, so this is usually instant. A slow line waits (its
    // caption is already showing) instead of switching to the robotic browser
    // voice mid-lesson; the browser voice is only for servers without Gemini.
    const url = await timeout(prefetchLine(text, opts.role, opts.lang), 12000, null);
    if (opts.signal.aborted) return true;
    if (url && (await playUrl(url, opts.rate, opts.signal))) return true;
    if (!url && !geminiOff) return false;
  }
  return browserSpeak(text, opts);
}

export function stopSpeaking() {
  current?.pause();
  current = null;
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}
