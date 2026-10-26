import { verifyUser } from "@/lib/server/guard";
import { isOnboarded, markOnboarded, Profile } from "@/lib/server/userdata";

// Whether a signed-in student has finished the welcome flow (follows the account to any device).

export async function GET(req: Request) {
  const uid = await verifyUser(req, 15_000);
  if (!uid) return Response.json({ error: "Sign in first." }, { status: 401 });
  try {
    return Response.json({ onboarded: await isOnboarded(uid) }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error(JSON.stringify({ event: "profile_error", message: String(e).slice(0, 300) }));
    return Response.json({ error: "Profile can't be reached right now." }, { status: 503 });
  }
}

export async function POST(req: Request) {
  const uid = await verifyUser(req, 15_000);
  if (!uid) return Response.json({ error: "Sign in first." }, { status: 401 });
  const parsed = Profile.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request." }, { status: 400 });
  try {
    await markOnboarded(uid, parsed.data);
    return Response.json({ ok: true });
  } catch (e) {
    console.error(JSON.stringify({ event: "profile_error", message: String(e).slice(0, 300) }));
    return Response.json({ error: "Profile can't be reached right now." }, { status: 503 });
  }
}
