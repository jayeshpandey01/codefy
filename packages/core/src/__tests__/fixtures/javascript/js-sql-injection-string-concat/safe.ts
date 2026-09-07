// Minimal Express/pg-shaped stand-ins so this fixture stays self-contained
// (no real @types/express or pg dependency needed just to exercise the
// taint engine against a realistic query call site).
interface Request {
  params: Record<string, string>;
}
interface Response {
  json(body: unknown): void;
}
interface Pool {
  query(sql: string, params?: readonly unknown[]): Promise<{ rows: unknown[] }>;
}

declare const pool: Pool;

/**
 * Safe: same shape (look up a user by route param) but the query uses a
 * parameterized placeholder ($1) with the value passed separately, so the
 * driver — not string building — is responsible for escaping. Should not
 * be flagged.
 */
export async function getUserById(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  const result = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
  res.json(result.rows);
}
