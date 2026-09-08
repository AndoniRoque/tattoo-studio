import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().int().positive().default(3001),
  CORS_ORIGIN: z.string().url().default("http://localhost:3000"),
  JWT_SECRET: z.string().min(32)
});

export const env = envSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  PORT: process.env.PORT,
  CORS_ORIGIN: process.env.CORS_ORIGIN,
  JWT_SECRET: process.env.JWT_SECRET
});
