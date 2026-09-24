import type { RequestHandler } from "express";
import { verifyToken } from "../lib/token";

export const requireAuth: RequestHandler = (request, response, next) => {
  const [scheme, token] = request.headers.authorization?.split(" ") ?? [];
  if (scheme !== "Bearer" || !token) {
    response.status(401).json({ error: "Missing bearer token" });
    return;
  }

  try {
    request.auth = verifyToken(token);
    next();
  } catch {
    response.status(401).json({ error: "Invalid or expired token" });
  }
};
