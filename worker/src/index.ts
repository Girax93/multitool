// Cloudflare Workers entry point. All logic lives in handler.ts so the same
// code runs on Node for tests and local development.
import { handle, type Env } from './handler.js';

export default {
  fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    return handle(request, env);
  },
};
