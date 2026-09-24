import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";

const router = Router();

const bookingSchema = z.object({
  artistId: z.string().min(1),
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().optional().or(z.literal("")),
  phone: z.string().trim().min(7).max(30),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  tattooStyle: z.enum(["COLOR", "BLACK_AND_WHITE"]),
  size: z.enum(["SMALL", "MEDIUM", "LARGE"]),
  bodyArea: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional()
}).refine((data) => new Date(data.endsAt).getTime() > new Date(data.startsAt).getTime(), {
  message: "endsAt must be after startsAt",
  path: ["endsAt"]
});

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

router.get("/studios/:slug", async (request, response, next) => {
  try {
    const studio = await prisma.studio.findUnique({
      where: { slug: request.params.slug },
      select: { name: true, slug: true, timezone: true, phone: true, email: true }
    });

    if (!studio) {
      response.status(404).json({ error: "Studio not found" });
      return;
    }

    response.json(studio);
  } catch (error) {
    next(error);
  }
});

router.get("/studios/:slug/artists", async (request, response, next) => {
  try {
    const studio = await prisma.studio.findUnique({
      where: { slug: request.params.slug },
      select: { id: true }
    });

    if (!studio) {
      response.status(404).json({ error: "Studio not found" });
      return;
    }

    const artists = await prisma.studioMember.findMany({
      where: { studioId: studio.id, role: "ARTIST", isActive: true },
      select: { user: { select: { id: true, name: true } } },
      orderBy: { user: { name: "asc" } }
    });

    response.json(artists.map(({ user }) => user));
  } catch (error) {
    next(error);
  }
});

router.get("/studios/:slug/availability", async (request, response, next) => {
  const date = dateSchema.safeParse(request.query.date);
  const artistId = typeof request.query.artistId === "string" ? request.query.artistId : "";

  if (!date.success || !artistId) {
    response.status(400).json({ error: "artistId and a date in YYYY-MM-DD format are required" });
    return;
  }

  try {
    const studio = await prisma.studio.findUnique({ where: { slug: request.params.slug }, select: { id: true } });
    if (!studio) {
      response.status(404).json({ error: "Studio not found" });
      return;
    }

    const artist = await findActiveArtist(studio.id, artistId);
    if (!artist) {
      response.status(404).json({ error: "Active artist not found in this studio" });
      return;
    }

    const slots = await getAvailableSlots(studio.id, artistId, date.data);
    response.json({ artistId, date: date.data, slots });
  } catch (error) {
    next(error);
  }
});

router.post("/studios/:slug/bookings", async (request, response, next) => {
  const parsed = bookingSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid booking data", details: parsed.error.flatten() });
    return;
  }

  try {
    const studio = await prisma.studio.findUnique({ where: { slug: request.params.slug }, select: { id: true } });
    if (!studio) {
      response.status(404).json({ error: "Studio not found" });
      return;
    }

    if (!(await findActiveArtist(studio.id, parsed.data.artistId))) {
      response.status(404).json({ error: "Active artist not found in this studio" });
      return;
    }

    const startsAt = new Date(parsed.data.startsAt);
    const endsAt = new Date(parsed.data.endsAt);
    if (!(await isSlotAvailable(studio.id, parsed.data.artistId, startsAt, endsAt))) {
      response.status(409).json({ error: "The selected slot is not available" });
      return;
    }

    const client = await prisma.client.upsert({
      where: { studioId_phone: { studioId: studio.id, phone: parsed.data.phone } },
      create: {
        studioId: studio.id,
        name: parsed.data.name,
        email: parsed.data.email || null,
        phone: parsed.data.phone
      },
      update: {
        name: parsed.data.name,
        email: parsed.data.email || null
      }
    });

    const appointment = await prisma.appointment.create({
      data: {
        studioId: studio.id,
        artistId: parsed.data.artistId,
        clientId: client.id,
        startsAt,
        endsAt,
        status: "PENDING",
        tattooStyle: parsed.data.tattooStyle,
        size: parsed.data.size,
        bodyArea: parsed.data.bodyArea,
        description: parsed.data.description ?? null
      },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        status: true,
        artist: { select: { id: true, name: true } },
        studio: { select: { name: true, slug: true } }
      }
    });

    response.status(201).json({ message: "Booking request created", appointment });
  } catch (error) {
    next(error);
  }
});

async function findActiveArtist(studioId: string, artistId: string) {
  return prisma.studioMember.findFirst({
    where: { studioId, userId: artistId, role: "ARTIST", isActive: true },
    select: { userId: true }
  });
}

async function getAvailableSlots(studioId: string, artistId: string, dateValue: string) {
  const date = new Date(`${dateValue}T00:00:00Z`);
  const schedules = await prisma.workSchedule.findMany({
    where: { studioId, artistId, weekday: date.getUTCDay() },
    orderBy: { startTime: "asc" }
  });
  const appointments = await prisma.appointment.findMany({
    where: {
      studioId,
      artistId,
      status: { not: "CANCELLED" },
      startsAt: { gte: date, lt: new Date(`${dateValue}T23:59:59.999Z`) }
    }
  });
  const slots: Array<{ startsAt: string; endsAt: string }> = [];

  for (const schedule of schedules) {
    const scheduleStart = timeToMinutes(schedule.startTime);
    const scheduleEnd = timeToMinutes(schedule.endTime);
    for (let start = scheduleStart; start + schedule.slotMinutes <= scheduleEnd; start += schedule.slotMinutes) {
      const startsAt = new Date(`${dateValue}T${minutesToTime(start)}:00Z`);
      const endsAt = new Date(startsAt.getTime() + schedule.slotMinutes * 60_000);
      const overlaps = appointments.some((appointment) => new Date(appointment.startsAt) < endsAt && new Date(appointment.endsAt) > startsAt);
      if (!overlaps) slots.push({ startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() });
    }
  }

  return slots;
}

async function isSlotAvailable(studioId: string, artistId: string, startsAt: Date, endsAt: Date) {
  const dateValue = startsAt.toISOString().slice(0, 10);
  const slots = await getAvailableSlots(studioId, artistId, dateValue);
  return slots.some((slot) => slot.startsAt === startsAt.toISOString() && slot.endsAt === endsAt.toISOString());
}

function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(value: number) {
  return `${Math.floor(value / 60).toString().padStart(2, "0")}:${(value % 60).toString().padStart(2, "0")}`;
}

export { router as publicRouter };