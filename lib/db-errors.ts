// Postgres "undefined_table": the database exists but the migrations haven't been run.
export function isMissingTable(err: unknown): boolean {
  for (let e: unknown = err, depth = 0; e && depth < 4; e = (e as { cause?: unknown }).cause, depth++) {
    const { code, message } = e as { code?: unknown; message?: unknown };
    if (code === "42P01") return true;
    if (typeof message === "string" && /relation .* does not exist/i.test(message)) return true;
  }
  return false;
}
