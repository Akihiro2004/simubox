import { connection } from "next/server";
import { aiConfigured, MODEL } from "@/lib/ai/director";

export async function GET() {
  await connection();
  return Response.json({
    status: "ok",
    ai: aiConfigured() ? "configured" : "unconfigured",
    model: MODEL,
    firebase: (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID) ? "configured" : "unconfigured",
    time: new Date().toISOString(),
  });
}
