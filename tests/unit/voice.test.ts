import { afterEach, describe, expect, it, vi } from "vitest";
import { SPEECHIFY_VOICES, synthesizeStream, voiceProvider } from "@/lib/ai/tts";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("voice provider", () => {
  it("voices English with whichever engine Settings picks (Gemini by default), Indonesian always with Gemini", () => {
    vi.stubEnv("SPEECHIFY_API_KEY", "sk_test");
    expect(voiceProvider("en")).toBe("gemini");
    expect(voiceProvider("en", "gemini")).toBe("gemini");
    expect(voiceProvider("en", "speechify")).toBe("speechify");
    expect(voiceProvider("id", "speechify")).toBe("gemini");
    // Speechify picked but no key on this server: Gemini.
    vi.stubEnv("SPEECHIFY_API_KEY", "");
    expect(voiceProvider("en", "speechify")).toBe("gemini");
  });

  it("streams Speechify's raw PCM with the role's voice and Simba 3.2", async () => {
    vi.stubEnv("SPEECHIFY_API_KEY", "sk_test");
    const pcm = new Uint8Array([1, 0, 2, 0, 3, 0, 4, 0]);
    const fetchMock = vi.fn(async () =>
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(pcm.slice(0, 4));
            c.enqueue(pcm.slice(4));
            c.close();
          },
        }),
        { headers: { "content-type": "audio/L16; rate=24000; channels=1" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const s = await synthesizeStream("Hello from Simu, testing.", "kid", "en", "speechify");
    const parts: Buffer[] = [];
    for await (const b of s.chunks) parts.push(b);
    expect(s.rate).toBe(24000);
    expect(Buffer.concat(parts)).toEqual(Buffer.from(pcm));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.speechify.ai/v1/audio/stream");
    expect((init.headers as Record<string, string>).accept).toBe("audio/pcm");
    expect(JSON.parse(String(init.body))).toMatchObject({ voice_id: SPEECHIFY_VOICES.kid, model: "simba-3.2", language: "en-US" });

    // The finished line is cached: saying it again makes no request.
    await synthesizeStream("Hello from Simu, testing.", "kid", "en", "speechify");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to Gemini when Speechify refuses (e.g. out of credits)", async () => {
    vi.stubEnv("SPEECHIFY_API_KEY", "sk_test");
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"error":"insufficient credits"}', { status: 402 })));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    // Gemini has no key in tests, so the fallback fails too; what matters is that it was tried.
    await expect(synthesizeStream("A brand new line for the fallback.", "robot", "en", "speechify")).rejects.toBeTruthy();
    expect(logged.mock.calls.some((c) => String(c[0]).includes("speechify_fallback"))).toBe(true);
  });

  it("falls back to Speechify when Gemini can't voice an English line (e.g. its daily cap)", async () => {
    vi.stubEnv("SPEECHIFY_API_KEY", "sk_test");
    vi.stubEnv("GEMINI_API_KEY", "");
    const pcm = new Uint8Array([5, 0, 6, 0]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => (String(url).includes("speechify") ? new Response(pcm, { headers: { "content-type": "audio/L16; rate=24000" } }) : new Response('{"error":{"code":429,"status":"RESOURCE_EXHAUSTED"}}', { status: 429 }))),
    );
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const s = await synthesizeStream("Gemini is out of requests today.", "robot", "en", "gemini");
    const parts: Buffer[] = [];
    for await (const b of s.chunks) parts.push(b);
    expect(Buffer.concat(parts)).toEqual(Buffer.from(pcm));
    expect(logged.mock.calls.some((c) => String(c[0]).includes("gemini_tts_fallback"))).toBe(true);
  });
});
