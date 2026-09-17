// Minimal ambient typings for Node's built-in test runner and assert module.
// We deliberately don't depend on @types/node: the app is browser code and the
// test files are compiled by the same tsconfig, then executed with `node --test`.

declare module 'node:test' {
  export interface TestContext {
    name: string;
    diagnostic(message: string): void;
    skip(message?: string): void;
    todo(message?: string): void;
    test(name: string, fn: (t: TestContext) => void | Promise<void>): Promise<void>;
  }
  export function test(name: string, fn: (t: TestContext) => void | Promise<void>): Promise<void>;
  export function describe(name: string, fn: () => void): void;
  export function it(name: string, fn: (t: TestContext) => void | Promise<void>): void;
  export function beforeEach(fn: () => void | Promise<void>): void;
  export function afterEach(fn: () => void | Promise<void>): void;
}

declare module 'node:assert/strict' {
  interface Assert {
    (value: unknown, message?: string): asserts value;
    ok(value: unknown, message?: string): asserts value;
    equal<T>(actual: unknown, expected: T, message?: string): asserts actual is T;
    notEqual(actual: unknown, expected: unknown, message?: string): void;
    deepEqual<T>(actual: unknown, expected: T, message?: string): asserts actual is T;
    notDeepEqual(actual: unknown, expected: unknown, message?: string): void;
    throws(fn: () => unknown, expected?: unknown, message?: string): void;
    rejects(promise: Promise<unknown> | (() => Promise<unknown>), expected?: unknown, message?: string): Promise<void>;
    match(value: string, regExp: RegExp, message?: string): void;
    fail(message?: string): never;
  }
  const assert: Assert;
  export default assert;
}
