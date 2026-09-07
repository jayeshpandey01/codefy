import fs from "node:fs";
import path from "node:path";

function isSafe(userPath: string, rootDir: string): boolean {
  const safe = path.normalize(path.resolve(rootDir, userPath));
  return safe.startsWith(rootDir);
}

export function handleDownloadSafe(
  req: { query: { file: string } },
  rootDir: string,
) {
  const userPath = req.query.file;
  if (!isSafe(userPath, rootDir)) {
    throw new Error("Access denied");
  }
  return fs.readFileSync(userPath, "utf8");
}
