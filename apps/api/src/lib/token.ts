import jwt from "jsonwebtoken";
import { env } from "../config/env";

export type AuthRole = "OWNER" | "ARTIST";

export type AuthToken = {
  userId: string;
  studioId: string;
  role: AuthRole;
};

export function createToken(payload: AuthToken): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): AuthToken {
  const payload = jwt.verify(token, env.JWT_SECRET);
  if (typeof payload !== "object" || payload === null) {
    throw new Error("Invalid token payload");
  }

  if (
    typeof payload.userId !== "string" ||
    typeof payload.studioId !== "string" ||
    (payload.role !== "OWNER" && payload.role !== "ARTIST")
  ) {
    throw new Error("Invalid token claims");
  }

  return {
    userId: payload.userId,
    studioId: payload.studioId,
    role: payload.role
  };
}
