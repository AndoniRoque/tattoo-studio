import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { hashPassword } from "../../lib/password";
import { requireAuth } from "../../middleware/auth";

const router = Router();

const createArtistSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(128)
});

const updateArtistSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  email: z.string().trim().toLowerCase().email().optional()
}).refine((data) => Object.keys(data).length > 0, {
  message: "At least one field is required"
});

const statusSchema = z.object({
  isActive: z.boolean()
});

router.use(requireAuth, (request, response, next) => {
  if (request.auth?.role !== "OWNER") {
    response.status(403).json({ error: "Only studio owners can manage artists" });
    return;
  }
  next();
});

router.post("/", async (request, response, next) => {
  const parsed = createArtistSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid artist data", details: parsed.error.flatten() });
    return;
  }

  try {
    const passwordHash = await hashPassword(parsed.data.password);
    const result = await prisma.$transaction(async (transaction) => {
      const user = await transaction.user.create({
        data: {
          name: parsed.data.name,
          email: parsed.data.email,
          passwordHash
        }
      });
      const membership = await transaction.studioMember.create({
        data: {
          studioId: request.auth!.studioId,
          userId: user.id,
          role: "ARTIST"
        }
      });
      return { user, membership };
    });

    response.status(201).json({
      id: result.user.id,
      name: result.user.name,
      email: result.user.email,
      role: result.membership.role,
      isActive: result.membership.isActive
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      response.status(409).json({ error: "Email already exists" });
      return;
    }
    next(error);
  }
});

router.get("/", async (request, response, next) => {
  try {
    const artists = await prisma.studioMember.findMany({
      where: { studioId: request.auth!.studioId, role: "ARTIST" },
      orderBy: { createdAt: "asc" },
      select: {
        role: true,
        isActive: true,
        createdAt: true,
        user: { select: { id: true, name: true, email: true } }
      }
    });

    response.json(artists.map((artist) => ({ ...artist.user, role: artist.role, isActive: artist.isActive, createdAt: artist.createdAt })));
  } catch (error) {
    next(error);
  }
});

router.patch("/:artistId", async (request, response, next) => {
  const parsed = updateArtistSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid artist data", details: parsed.error.flatten() });
    return;
  }

  try {
    const membership = await findArtistMembership(request.auth!.studioId, request.params.artistId);
    if (!membership) {
      response.status(404).json({ error: "Artist not found" });
      return;
    }

    const user = await prisma.user.update({
      where: { id: request.params.artistId },
      data: parsed.data,
      select: { id: true, name: true, email: true }
    });
    response.json({ ...user, role: membership.role, isActive: membership.isActive });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      response.status(409).json({ error: "Email already exists" });
      return;
    }
    next(error);
  }
});

router.patch("/:artistId/status", async (request, response, next) => {
  const parsed = statusSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "isActive must be a boolean" });
    return;
  }

  try {
    const membership = await findArtistMembership(request.auth!.studioId, request.params.artistId);
    if (!membership) {
      response.status(404).json({ error: "Artist not found" });
      return;
    }

    const updated = await prisma.studioMember.update({
      where: { id: membership.id },
      data: { isActive: parsed.data.isActive },
      select: { isActive: true }
    });
    response.json({ id: request.params.artistId, isActive: updated.isActive });
  } catch (error) {
    next(error);
  }
});

async function findArtistMembership(studioId: string, userId: string) {
  return prisma.studioMember.findFirst({
    where: { studioId, userId, role: "ARTIST" },
    select: { id: true, role: true, isActive: true }
  });
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

export { router as artistsRouter };
