import * as child_process from "child_process";

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
 * Vulnerable: the directory to list comes straight from an untrusted query
 * parameter and is interpolated into a shell command string, which then
 * reaches child_process.exec — classic CWE-78 command injection.
 */
export function listDirectory(req: Request, res: Response): void {
  const dir = req.query.dir as string;
  const cmd = `ls -la ${dir}`;

  child_process.exec(cmd, (err, stdout) => {
    if (err) {
      res.status(500).send(err.message);
      return;
    }
    res.send(stdout);
  });
}
