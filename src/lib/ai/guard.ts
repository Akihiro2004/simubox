// Deterministic pre-checks that run before any model call. Gemini still
// classifies scope (too_advanced / off_topic / unsafe) inside the plan; this
// layer only catches the clear-cut cases cheaply and safely.

import { SCHEMA_VERSION, type ScenePlan } from "../ssp/schema";

const UNSAFE: { re: RegExp; reply: { en: string; id: string } }[] = [
  {
    re: /\b(kill (myself|me)|suicide|self.?harm|cut myself|bunuh diri|melukai diri)\b/i,
    reply: {
      en: "That sounds really heavy, and I'm glad you said something. Please talk to a parent, teacher or another adult you trust right now. If you might be in danger, contact your local emergency number. I'm here for science questions whenever you want.",
      id: "Kedengarannya berat sekali, dan aku senang kamu bercerita. Tolong bicarakan dengan orang tua, guru, atau orang dewasa yang kamu percaya sekarang. Jika kamu dalam bahaya, hubungi nomor darurat setempat. Aku tetap di sini untuk pertanyaan sains kapan pun.",
    },
  },
  {
    re: /\b(make|build|create|cara membuat|bikin)\b.{0,40}\b(bomb|explosive|weapon|gun|poison|meth|drug|bom|bahan peledak|senjata|racun|narkoba)\b/i,
    reply: {
      en: "I can't help with anything that could hurt people. Want to see a safe experiment instead, like how a ball flies or why things fall?",
      id: "Aku tidak bisa membantu hal yang bisa membahayakan orang. Mau coba eksperimen yang aman, misalnya bagaimana bola melayang atau kenapa benda jatuh?",
    },
  },
  {
    re: /\b(porn|nude|nsfw|sex(ual)?|telanjang|porno)\b/i,
    reply: {
      en: "That's not something I can help with. I'm a science guide for students. Ask me about gravity, atoms, plants, space or math!",
      id: "Itu bukan hal yang bisa aku bantu. Aku pemandu sains untuk pelajar. Tanya aku tentang gravitasi, atom, tumbuhan, luar angkasa, atau matematika!",
    },
  },
];

export function looksIndonesian(text: string): boolean {
  return /\b(apa|bagaimana|kenapa|mengapa|jika|kalau|tolong|jelaskan|tidak|yang|dengan|dan|ini|itu|aku|saya|bisa|cara|membuat|bikin|adalah|tunjukkan|berapa|seberapa|lempar)\b/i.test(text);
}

/** Returns a ready-made safe plan when the prompt must not reach the model. */
export function precheck(prompt: string, language: "auto" | "en" | "id"): ScenePlan | null {
  const lang = language === "auto" ? (looksIndonesian(prompt) ? "id" : "en") : language;
  for (const u of UNSAFE) {
    if (u.re.test(prompt)) return safePlan(u.reply[lang], lang);
  }
  return null;
}

export function safePlan(reply: string, lang: "en" | "id", scope: ScenePlan["scope"] = "unsafe"): ScenePlan {
  return {
    schemaVersion: SCHEMA_VERSION,
    scope,
    language: lang,
    title: lang === "id" ? "Ayo coba yang lain" : "Let's try something else",
    subject: "other",
    supportLevel: "text",
    capability: "none",
    reply,
    steps: [{ title: "Reply", commands: [{ op: "animate_character", id: "simu", animation: "think" }, { op: "speak", speaker: "simu", text: reply.slice(0, 240) }] }],
    assumptions: [],
    limitations: [],
    followUps:
      lang === "id"
        ? ["Apa yang terjadi jika gravitasi hilang?", "Lempar bola dengan sudut 45 derajat", "Tunjukkan molekul air"]
        : ["What happens if gravity disappears?", "Throw a ball at 45 degrees", "Show me a water molecule"],
  };
}
