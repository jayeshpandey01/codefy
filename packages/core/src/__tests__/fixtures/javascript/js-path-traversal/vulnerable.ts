import fs from "node:fs";

export function handleDownload(req: { query: { file: string } }) {
  const userPath = req.query.file;
  return fs.readFileSync(userPath, "utf8");
}
