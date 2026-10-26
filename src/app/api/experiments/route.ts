import { rateLimit, verifyUser } from "@/lib/server/guard";
import { deleteExperiment, Experiment, listExperiments, saveExperiment } from "@/lib/server/userdata";

// A signed-in student's saved experiments. Guests keep theirs in the browser.

const signIn = () => Response.json({ error: "Sign in to save experiments to your account." }, { status: 401 });
const failed = (e: unknown) => {
  console.error(JSON.stringify({ event: "experiments_error", message: String(e).slice(0, 300) }));
  return Response.json({ error: "Saved experiments can't be reached right now. Please try again." }, { status: 503 });
};

export async function GET(req: Request) {
  const uid = await verifyUser(req, 15_000);
  if (!uid) return signIn();
  try {
    return Response.json({ experiments: await listExperiments(uid) }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return failed(e);
  }
}

export async function POST(req: Request) {
  const uid = await verifyUser(req, 15_000);
  if (!uid) return signIn();
  if (!rateLimit(`saves:${uid}`, 20, 20)) return Response.json({ error: "Saving too fast. Try again in a minute." }, { status: 429 });
  // A Firestore document holds at most 1 MiB.
  const raw = await req.text();
  if (raw.length > 900_000) return Response.json({ error: "This experiment is too big to save." }, { status: 413 });
  let parsed;
  try {
    parsed = Experiment.safeParse(JSON.parse(raw));
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  if (!parsed.success) return Response.json({ error: "That experiment can't be saved." }, { status: 400 });
  try {
    await saveExperiment(uid, parsed.data);
    return Response.json({ ok: true });
  } catch (e) {
    return failed(e);
  }
}

export async function DELETE(req: Request) {
  const uid = await verifyUser(req, 15_000);
  if (!uid) return signIn();
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^exp_[a-z0-9]{4,40}$/.test(id)) return Response.json({ error: "Invalid id." }, { status: 400 });
  try {
    await deleteExperiment(uid, id);
    return Response.json({ ok: true });
  } catch (e) {
    return failed(e);
  }
}
