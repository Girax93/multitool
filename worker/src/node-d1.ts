// A D1Database look-alike over Node's built-in SQLite (node:sqlite, Node ≥ 22.13).
// Used by the unit tests and the local server; never bundled into the Worker.
import { DatabaseSync } from 'node:sqlite';

class Statement implements D1PreparedStatement {
  constructor(
    private readonly db: DatabaseSync,
    private readonly sql: string,
    private readonly params: unknown[] = [],
  ) {}

  bind(...values: unknown[]): D1PreparedStatement {
    return new Statement(this.db, this.sql, values.map(normalise));
  }

  async first<T = unknown>(): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...this.params);
    return (row as T | undefined) ?? null;
  }

  async run<T = unknown>(): Promise<D1Result<T>> {
    return this.all<T>();
  }

  async all<T = unknown>(): Promise<D1Result<T>> {
    const stmt = this.db.prepare(this.sql);
    const results = /^\s*(SELECT|WITH)/i.test(this.sql) || /RETURNING/i.test(this.sql) ? (stmt.all(...this.params) as T[]) : (stmt.run(...this.params), []);
    return { results, success: true };
  }

  /** Synchronous variant for batch(). */
  exec<T = unknown>(): D1Result<T> {
    const stmt = this.db.prepare(this.sql);
    const results = /^\s*(SELECT|WITH)/i.test(this.sql) || /RETURNING/i.test(this.sql) ? (stmt.all(...this.params) as T[]) : (stmt.run(...this.params), []);
    return { results, success: true };
  }
}

function normalise(v: unknown): unknown {
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v === undefined) return null;
  return v;
}

export class NodeD1 implements D1Database {
  readonly db: DatabaseSync;

  constructor(path = ':memory:') {
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  }

  prepare(query: string): D1PreparedStatement {
    return new Statement(this.db, query);
  }

  async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const out = statements.map((s) => (s as Statement).exec<T>());
      this.db.exec('COMMIT');
      return out;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  migrate(sql: string): void {
    this.db.exec(sql);
  }
}
