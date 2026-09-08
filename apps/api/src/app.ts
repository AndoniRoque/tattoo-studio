import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env";
import { authRouter } from "./modules/auth/auth.routes";
import { artistsRouter } from "./modules/artists/artists.routes";
import { schedulesRouter } from "./modules/schedules/schedules.routes";

export const app = express();

app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN }));
app.use(express.json());

app.use("/api/auth", authRouter);
app.use("/api/artists", artistsRouter);
app.use("/api/schedules", schedulesRouter);

app.get("/health", (_request, response) => {
  response.status(200).json({ status: "ok" });
});
