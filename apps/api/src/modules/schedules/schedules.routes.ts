import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireAuth } from "../../middleware/auth";

const router = Router();
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

const scheduleFields = {
  artistId: z.string().min(1).optional(),
  weekday: z.number().int().min(0).max(6),
  startTime: z.string().regex(timePattern, "Use HH:mm format"),
  endTime: z.string().regex(timePattern, "Use HH:mm format"),
  slotMinutes: z.number().int().min(15).max(480).default(60)
};

const scheduleSchema = z.object(scheduleFields).refine((data) => data.startTime < data.endTime, {
  message: "endTime must be after startTime",
  path: ["endTime"]
});

const updateScheduleSchema = z.object(scheduleFields).omit({ artistId: true }).partial().refine((data) => {
  return data.startTime === undefined || data.endTime === undefined || data.startTime < data.endTime;
}, {
  message: "endTime must be after startTime",
  path: ["endTime"]
});

router.use(requireAuth);

router.get("/", async (request, response, next) => {
  try {
    const requestedArtistId = typeof request.query.artistId === "string" ? request.query.artistId : undefined;
    const artistId = request.auth!.role === "ARTIST" ? request.auth!.userId : requestedArtistId;

    const schedules = await prisma.workSchedule.findMany({
      where: {
        studioId: request.auth!.studioId,
        ...(artistId ? { artistId } : {})
      },
      orderBy: [{ artistId: "asc" }, { weekday: "asc" }, { startTime: "asc" }]
    });

    response.json(schedules);
  } catch (error) {
    next(error);
  }
});

router.post("/", async (request, response, next) => {
  const parsed = scheduleSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid schedule data", details: parsed.error.flatten() });
    return;
  }

  try {
    if (request.auth!.role === "OWNER" && !parsed.data.artistId) {
      response.status(400).json({ error: "artistId is required for studio owners" });
      return;
    }
    if (request.auth!.role === "ARTIST" && parsed.data.artistId && parsed.data.artistId !== request.auth!.userId) {
      response.status(403).json({ error: "Artists can only create their own schedules" });
      return;
    }

    const artistId = parsed.data.artistId ?? request.auth!.userId;
    if (!(await isActiveArtist(request.auth!.studioId, artistId))) {
      response.status(404).json({ error: "Active artist not found in this studio" });
      return;
    }

    const schedule = await prisma.workSchedule.create({
      data: { ...parsed.data, artistId, studioId: request.auth!.studioId }
    });
    response.status(201).json(schedule);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      response.status(409).json({ error: "This schedule already exists" });
      return;
    }
    next(error);
  }
});

router.patch("/:scheduleId", async (request, response, next) => {
  const parsed = updateScheduleSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid schedule data", details: parsed.error.flatten() });
    return;
  }

  try {
    const existing = await findSchedule(request.auth!.studioId, request.params.scheduleId);
    if (!existing) {
      response.status(404).json({ error: "Schedule not found" });
      return;
    }
    if (request.auth!.role === "ARTIST" && existing.artistId !== request.auth!.userId) {
      response.status(403).json({ error: "Artists can only edit their own schedules" });
      return;
    }

    const startTime = parsed.data.startTime ?? existing.startTime;
    const endTime = parsed.data.endTime ?? existing.endTime;
    if (startTime >= endTime) {
      response.status(400).json({ error: "endTime must be after startTime" });
      return;
    }

    const schedule = await prisma.workSchedule.update({
      where: { id: existing.id },
      data: parsed.data
    });
    response.json(schedule);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      response.status(409).json({ error: "This schedule already exists" });
      return;
    }
    next(error);
  }
});

router.delete("/:scheduleId", async (request, response, next) => {
  try {
    const existing = await findSchedule(request.auth!.studioId, request.params.scheduleId);
    if (!existing) {
      response.status(404).json({ error: "Schedule not found" });
      return;
    }
    if (request.auth!.role === "ARTIST" && existing.artistId !== request.auth!.userId) {
      response.status(403).json({ error: "Artists can only delete their own schedules" });
      return;
    }

    await prisma.workSchedule.delete({ where: { id: existing.id } });
    response.status(204).send();
  } catch (error) {
    next(error);
  }
});

async function isActiveArtist(studioId: string, userId: string): Promise<boolean> {
  const membership = await prisma.studioMember.findFirst({
    where: { studioId, userId, role: "ARTIST", isActive: true },
    select: { id: true }
  });
  return membership !== null;
}

function findSchedule(studioId: string, scheduleId: string) {
  return prisma.workSchedule.findFirst({ where: { id: scheduleId, studioId } });
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

export { router as schedulesRouter };
