import "server-only";

// DeepSeek (OpenAI-compatible chat completions), streamed. Used for the
// cheaper, mechanical plan calls; full lessons stay on Gemini.

export const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-flash";

export function deepseekConfigured(): boolean {
  return Boolean(process.env.DEEPSEEK_API_KEY);
}

/** Streams a JSON-mode answer; `onText` gets the answer text so far. Reasoning is not returned. */
export async function deepseekJson(opts: { system: string; user: string; effort: "none" | "low" | "high"; maxTokens: number; signal: AbortSignal; onText: (text: string) => void }): Promise<string> {
  const res = await fetch(`${process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com"}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      response_format: { type: "json_object" },
      reasoning_effort: opts.effort,
      max_tokens: opts.maxTokens,
      stream: true,
      stream_options: { include_usage: true },
    }),
    signal: opts.signal,
  });
  if (!res.ok || !res.body) throw new Error(`DeepSeek ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  const dec = new TextDecoder();
  let buf = "";
  let text = "";
  let usage: unknown;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") continue;
      const e = JSON.parse(data) as { choices?: { delta?: { content?: string | null } }[]; usage?: unknown };
      usage = e.usage ?? usage;
      const piece = e.choices?.[0]?.delta?.content;
      if (piece) {
        text += piece;
        opts.onText(text);
      }
    }
  }
  if (usage) console.log(JSON.stringify({ event: "deepseek_usage", model: DEEPSEEK_MODEL, usage }));
  if (!text.trim()) throw new Error("DeepSeek returned an empty answer");
  return text;
}
