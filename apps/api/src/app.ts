import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env";
import { authRouter } from "./modules/auth/auth.routes";
import { artistsRouter } from "./modules/artists/artists.routes";
import { schedulesRouter } from "./modules/schedules/schedules.routes";
import { clientsRouter } from "./modules/clients/clients.routes";
import { appointmentsRouter } from "./modules/appointments/appointments.routes";
import { publicRouter } from "./modules/public/public.routes";

export const app = express();

app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN }));
app.use(express.json());

app.use("/api/auth", authRouter);
app.use("/api/artists", artistsRouter);
app.use("/api/schedules", schedulesRouter);
app.use("/api/clients", clientsRouter);
app.use("/api/appointments", appointmentsRouter);
app.use("/api/public", publicRouter);

app.get("/health", (_request, response) => {
  response.status(200).json({ status: "ok" });
});
