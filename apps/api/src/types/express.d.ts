import type { AuthToken } from "../lib/token";

declare global {
  namespace Express {
    interface Request {
      auth?: AuthToken;
    }
  }
}

export {};
