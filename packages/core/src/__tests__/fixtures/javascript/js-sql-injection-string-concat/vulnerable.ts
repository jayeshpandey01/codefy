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
 * Vulnerable: the route parameter is interpolated directly into the SQL
 * query text via a template literal — classic CWE-89 SQL injection.
 */
export async function getUserById(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  const result = await pool.query(`SELECT * FROM users WHERE id = ${id}`);
  res.json(result.rows);
}
