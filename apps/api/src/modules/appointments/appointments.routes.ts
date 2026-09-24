import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireAuth } from "../../middleware/auth";

const router = Router();
router.use(requireAuth);

const appointmentSchema = z.object({
  artistId: z.string().min(1).optional(),
  clientId: z.string().min(1),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  tattooStyle: z.enum(["COLOR", "BLACK_AND_WHITE"]),
  size: z.enum(["SMALL", "MEDIUM", "LARGE"]),
  bodyArea: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional(),
  status: z.enum(["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED", "NO_SHOW"]).optional()
}).refine((data) => new Date(data.endsAt).getTime() > new Date(data.startsAt).getTime(), {
  message: "endsAt must be after startsAt",
  path: ["endsAt"]
});

const statusSchema = z.object({
  status: z.enum(["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED", "NO_SHOW"]) }
);

const availabilityQuerySchema = z.object({
  artistId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

router.get("/", async (request, response, next) => {
  try {
    const artistId = typeof request.query.artistId === "string" ? request.query.artistId : undefined;
    const date = typeof request.query.date === "string" ? request.query.date : undefined;

    const filters: any = {
      studioId: request.auth!.studioId,
      ...(request.auth!.role === "ARTIST" ? { artistId: request.auth!.userId } : {}),
      ...(artistId ? { artistId } : {})
    };

    if (date) {
      const start = new Date(`${date}T00:00:00`);
      const end = new Date(`${date}T23:59:59.999Z`);
      filters.startsAt = { gte: start, lte: end };
    }

    const appointments = await prisma.appointment.findMany({
      where: filters,
      include: {
        client: true,
        artist: { select: { id: true, name: true, email: true } }
      },
      orderBy: { startsAt: "asc" }
    });

    response.json(appointments);
  } catch (error) {
    next(error);
  }
});

router.get("/available", async (request, response, next) => {
  const parsed = availabilityQuerySchema.safeParse({
    artistId: request.query.artistId,
    date: request.query.date
  });

  if (!parsed.success) {
    response.status(400).json({ error: "artistId and date are required", details: parsed.error.flatten() });
    return;
  }

  try {
    const artistId = request.auth!.role === "ARTIST" ? request.auth!.userId : parsed.data.artistId;
    const artist = await prisma.studioMember.findFirst({
      where: { studioId: request.auth!.studioId, userId: artistId, role: "ARTIST", isActive: true },
      select: { userId: true }
    });

    if (!artist) {
      response.status(404).json({ error: "Active artist not found in this studio" });
      return;
    }

    const date = new Date(`${parsed.data.date}T00:00:00Z`);
    const weekday = date.getUTCDay();
    const schedules = await prisma.workSchedule.findMany({
      where: { studioId: request.auth!.studioId, artistId: artist.userId, weekday }
    });

    const startOfDay = new Date(`${parsed.data.date}T00:00:00Z`);
    const endOfDay = new Date(`${parsed.data.date}T23:59:59.999Z`);
    const existingAppointments = await prisma.appointment.findMany({
      where: {
        studioId: request.auth!.studioId,
        artistId: artist.userId,
        status: { notIn: ["CANCELLED"] },
        startsAt: { gte: startOfDay, lte: endOfDay }
      }
    });

    const slots: Array<{ startsAt: string; endsAt: string }> = [];
    for (const schedule of schedules) {
      const startMinutes = timeToMinutes(schedule.startTime);
      const endMinutes = timeToMinutes(schedule.endTime);
      let slotStartMinutes = startMinutes;

      while (slotStartMinutes + schedule.slotMinutes <= endMinutes) {
        const slotStart = new Date(`${parsed.data.date}T${minutesToTime(slotStartMinutes)}:00Z`);
        const slotEnd = new Date(slotStart.getTime() + schedule.slotMinutes * 60_000);

        const overlaps = existingAppointments.some((appointment) => {
          const appointmentStart = new Date(appointment.startsAt);
          const appointmentEnd = new Date(appointment.endsAt);
          return appointmentStart < slotEnd && appointmentEnd > slotStart;
        });

        if (!overlaps) {
          slots.push({
            startsAt: slotStart.toISOString(),
            endsAt: slotEnd.toISOString()
          });
        }

        slotStartMinutes += schedule.slotMinutes;
      }
    }

    response.json({ artistId: artist.userId, date: parsed.data.date, slots });
  } catch (error) {
    next(error);
  }
});

router.post("/", async (request, response, next) => {
  const parsed = appointmentSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid appointment data", details: parsed.error.flatten() });
    return;
  }

  try {
    const requestedArtistId = parsed.data.artistId ?? request.auth!.userId;
    if (request.auth!.role === "ARTIST" && requestedArtistId !== request.auth!.userId) {
      response.status(403).json({ error: "Artists can only create appointments for themselves" });
      return;
    }

    const artistMembership = await prisma.studioMember.findFirst({
      where: { studioId: request.auth!.studioId, userId: requestedArtistId, role: "ARTIST", isActive: true },
      select: { userId: true }
    });

    if (!artistMembership) {
      response.status(404).json({ error: "Active artist not found in this studio" });
      return;
    }

    const client = await prisma.client.findFirst({
      where: { id: parsed.data.clientId, studioId: request.auth!.studioId }
    });

    if (!client) {
      response.status(404).json({ error: "Client not found in this studio" });
      return;
    }

    const startsAt = new Date(parsed.data.startsAt);
    const endsAt = new Date(parsed.data.endsAt);
    const isValidSlot = await isAppointmentSlotAvailable({
      studioId: request.auth!.studioId,
      artistId: requestedArtistId,
      startsAt,
      endsAt
    });

    if (!isValidSlot) {
      response.status(409).json({ error: "The selected slot is not available" });
      return;
    }

    const appointment = await prisma.appointment.create({
      data: {
        studioId: request.auth!.studioId,
        artistId: requestedArtistId,
        clientId: client.id,
        startsAt,
        endsAt,
        status: parsed.data.status ?? "PENDING",
        tattooStyle: parsed.data.tattooStyle,
        size: parsed.data.size,
        bodyArea: parsed.data.bodyArea,
        description: parsed.data.description ?? null
      },
      include: {
        client: true,
        artist: { select: { id: true, name: true } }
      }
    });

    response.status(201).json(appointment);
  } catch (error) {
    next(error);
  }
});

router.patch("/:id/status", async (request, response, next) => {
  const parsed = statusSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid status", details: parsed.error.flatten() });
    return;
  }

  try {
    const appointment = await prisma.appointment.findFirst({
      where: { id: request.params.id, studioId: request.auth!.studioId },
      include: { artist: true }
    });

    if (!appointment) {
      response.status(404).json({ error: "Appointment not found" });
      return;
    }

    if (request.auth!.role === "ARTIST" && appointment.artistId !== request.auth!.userId) {
      response.status(403).json({ error: "Artists can only update their own appointments" });
      return;
    }

    const updated = await prisma.appointment.update({
      where: { id: appointment.id },
      data: { status: parsed.data.status },
      include: { client: true, artist: { select: { id: true, name: true } } }
    });

    response.json(updated);
  } catch (error) {
    next(error);
  }
});

async function isAppointmentSlotAvailable({ studioId, artistId, startsAt, endsAt }: {
  studioId: string;
  artistId: string;
  startsAt: Date;
  endsAt: Date;
}) {
  const date = new Date(startsAt);
  const weekday = date.getUTCDay();
  const schedule = await prisma.workSchedule.findFirst({
    where: {
      studioId,
      artistId,
      weekday
    }
  });

  if (!schedule) return false;

  const scheduleStart = timeToMinutes(schedule.startTime);
  const scheduleEnd = timeToMinutes(schedule.endTime);
  const slotStart = timeToMinutes(formatTime(startsAt));
  const slotEnd = timeToMinutes(formatTime(endsAt));

  if (slotStart < scheduleStart || slotEnd > scheduleEnd) {
    return false;
  }

  const overlapping = await prisma.appointment.findFirst({
    where: {
      studioId,
      artistId,
      status: { not: "CANCELLED" },
      OR: [
        {
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt }
        }
      ]
    }
  });

  return !overlapping;
}

function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(value: number): string {
  const hours = Math.floor(value / 60).toString().padStart(2, "0");
  const minutes = (value % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

function formatTime(date: Date): string {
  const hours = date.getUTCHours().toString().padStart(2, "0");
  const minutes = date.getUTCMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

export { router as appointmentsRouter };
