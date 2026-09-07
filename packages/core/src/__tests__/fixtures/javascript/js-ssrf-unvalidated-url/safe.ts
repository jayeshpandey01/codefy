// Minimal Express-shaped stand-ins so this fixture stays self-contained
// (no real @types/express dependency needed just to exercise the taint
// engine against a realistic Express-style call site).
interface Request {
  body: { url: string };
}
interface Response {
  status(code: number): Response;
  send(body: unknown): void;
}

/**
 * A real reachability-gating guard: parses the URL, restricts the scheme to
 * https:, and rejects RFC1918/loopback/link-local hosts — all inline in its
 * own body, so this is the actual check being performed, not a call out to
 * a same-named helper elsewhere. Its return value is what actually gates
 * the outbound call below.
 */
function isAllowedUrl(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:") {
    return false;
  }

  const host = parsed.hostname;
  const isPrivateOrLoopback =
    host.startsWith("10.") ||
    host.startsWith("172.16.") ||
    host.startsWith("192.168.") ||
    host.startsWith("127.") ||
    host.startsWith("169.254.") ||
    host === "::1" ||
    host === "localhost";

  if (isPrivateOrLoopback) {
    return false;
  }

  return true;
}

/**
 * Safe: same shape (fetch a user-supplied URL) but gated by isAllowedUrl,
 * which enforces an https-only scheme allowlist and a private/loopback IP
 * block before the outbound call is made. Should not be flagged.
 */
export async function fetchRemoteResource(
  req: Request,
  res: Response,
): Promise<void> {
  const url = req.body.url as string;

  if (!isAllowedUrl(url)) {
    res.status(400).send("Invalid URL");
    return;
  }

  const upstream = await fetch(url, { method: "GET" });
  res.send(await upstream.text());
}
