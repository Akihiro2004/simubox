import { connection } from "next/server";

/**
 * Public Firebase web config, read at request time so one build works for
 * any project. These values identify the project; they are not secrets.
 */
export async function GET() {
  await connection();
  const env = process.env;
  const firebase = {
    apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY || env.FIREBASE_API_KEY,
    authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || env.FIREBASE_AUTH_DOMAIN,
    projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || env.FIREBASE_PROJECT_ID,
    appId: env.NEXT_PUBLIC_FIREBASE_APP_ID || env.FIREBASE_APP_ID,
  };
  const ok = firebase.apiKey && firebase.projectId && firebase.appId;
  return Response.json({ firebase: ok ? firebase : null }, { headers: { "cache-control": "public, max-age=300" } });
}
