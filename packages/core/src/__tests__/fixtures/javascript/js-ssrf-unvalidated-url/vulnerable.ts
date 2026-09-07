// Minimal Express-shaped stand-ins so this fixture stays self-contained
// (no real @types/express dependency needed just to exercise the taint
// engine against a realistic Express-style call site).
interface Request {
  body: { url: string };
}
interface Response {
  send(body: unknown): void;
}

/**
 * Vulnerable: the outbound URL comes straight from the request body with no
 * scheme/host validation in between — classic CWE-918 SSRF. An attacker can
 * point this at an internal-only service (or a cloud metadata endpoint).
 */
export async function fetchRemoteResource(
  req: Request,
  res: Response,
): Promise<void> {
  const url = req.body.url as string;

  const upstream = await fetch(url, { method: "GET" });
  res.send(await upstream.text());
}
