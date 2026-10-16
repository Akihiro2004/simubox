let webgl: boolean | null = null;

/** Cached WebGL capability check (client only). */
export function webglAvailable(): boolean {
  if (webgl !== null) return webgl;
  try {
    const c = document.createElement("canvas");
    webgl = Boolean(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    webgl = false;
  }
  return webgl;
}
