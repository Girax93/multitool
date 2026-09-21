// Minimal ambient typings so the Worker compiles without @cloudflare/workers-types
// or @types/node (the dev workspace cannot reach npm). Only what this code uses.

// ---- Cloudflare D1 ----------------------------------------------------------

interface D1Result<T = unknown> {
  results: T[];
  success: boolean;
  meta?: unknown;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(): Promise<T | null>;
  run<T = unknown>(): Promise<D1Result<T>>;
  all<T = unknown>(): Promise<D1Result<T>>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// ---- Node built-ins used by the local server and the tests ----------------

declare module 'node:sqlite' {
  export class StatementSync {
    all(...params: unknown[]): Record<string, unknown>[];
    get(...params: unknown[]): Record<string, unknown> | undefined;
    run(...params: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  }
  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}

declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string;
  export function readdirSync(path: string): string[];
}

declare module 'node:path' {
  export function join(...parts: string[]): string;
  export function dirname(path: string): string;
  export function resolve(...parts: string[]): string;
}

declare module 'node:url' {
  export function fileURLToPath(url: string | URL): string;
}

declare module 'node:http' {
  export interface IncomingMessage {
    method?: string;
    url?: string;
    headers: Record<string, string | string[] | undefined>;
    on(event: 'data', fn: (chunk: Uint8Array) => void): this;
    on(event: 'end', fn: () => void): this;
    on(event: 'error', fn: (err: Error) => void): this;
  }
  export interface ServerResponse {
    writeHead(status: number, headers: Record<string, string>): this;
    end(body?: Uint8Array | string): void;
  }
  export interface Server {
    listen(port: number, host: string, cb?: () => void): this;
    close(): void;
  }
  export function createServer(handler: (req: IncomingMessage, res: ServerResponse) => void): Server;
}

declare module 'node:test' {
  export interface TestContext {
    name: string;
    diagnostic(message: string): void;
  }
  export function test(name: string, fn: (t: TestContext) => void | Promise<void>): Promise<void>;
}

declare module 'node:assert/strict' {
  interface Assert {
    (value: unknown, message?: string): asserts value;
    ok(value: unknown, message?: string): asserts value;
    equal<T>(actual: unknown, expected: T, message?: string): asserts actual is T;
    notEqual(actual: unknown, expected: unknown, message?: string): void;
    deepEqual<T>(actual: unknown, expected: T, message?: string): asserts actual is T;
    throws(fn: () => unknown, expected?: unknown, message?: string): void;
    rejects(promise: Promise<unknown> | (() => Promise<unknown>), expected?: unknown, message?: string): Promise<void>;
    match(value: string, regExp: RegExp, message?: string): void;
    fail(message?: string): never;
  }
  const assert: Assert;
  export default assert;
}

declare const process: {
  argv: string[];
  env: Record<string, string | undefined>;
  exit(code?: number): never;
};
