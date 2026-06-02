/**
 * Admin gateway — runs on Vercel/Netlify (not in static GitHub Pages bundle).
 * Env: ADMIN_SAVE_KEY, GH_PAT
 */
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const adminKey = process.env.ADMIN_SAVE_KEY;
  const ghPat = process.env.GH_PAT;
  if (!adminKey || !ghPat) {
    return res.status(503).json({
      error: "Server not configured (ADMIN_SAVE_KEY, GH_PAT required)"
    });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Invalid JSON body" });
    }
  }

  const { adminKey: key, action, payload } = body ?? {};
  if (!key || key !== adminKey) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (!action || typeof action !== "string") {
    return res.status(400).json({ error: "action is required" });
  }

  const allowed = new Set([
    "save-overrides",
    "save-keywords",
    "enrich-company",
    "trigger-collect"
  ]);
  if (!allowed.has(action)) {
    return res.status(400).json({ error: "Unknown action" });
  }

  const dispatchRes = await fetch(
    "https://api.github.com/repos/TBELL-ref/T-client/dispatches",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ghPat}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28"
      },
      body: JSON.stringify({
        event_type: action,
        client_payload: { adminKey: key, ...(payload ?? {}) }
      })
    }
  );

  if (dispatchRes.status === 204) {
    return res.status(200).json({ ok: true, action });
  }

  const detail = await dispatchRes.text().catch(() => "");
  return res.status(dispatchRes.status).json({
    error: `GitHub dispatch failed (${dispatchRes.status})`,
    detail
  });
}
