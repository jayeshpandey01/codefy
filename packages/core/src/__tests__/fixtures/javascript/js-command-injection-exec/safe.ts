import { execFile } from "child_process";

// Minimal Express-shaped stand-ins so this fixture stays self-contained
// (no real @types/express dependency needed just to exercise the taint
// engine against a realistic Express-style call site).
interface Request {
  query: Record<string, string>;
}
interface Response {
  status(code: number): Response;
  send(body: unknown): void;
}

/**
 * Safe: same shape (list a user-supplied directory) but routed through
 * execFile with an argv array — no shell is invoked, so there is no
 * metacharacter to break out with. Should not be flagged.
 */
export function listDirectory(req: Request, res: Response): void {
  const dir = req.query.dir as string;

  execFile("ls", ["-la", dir], (err, stdout) => {
    if (err) {
      res.status(500).send(err.message);
      return;
    }
    res.send(stdout);
  });
}
