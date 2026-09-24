import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireAuth } from "../../middleware/auth";

const router = Router();
router.use(requireAuth);

const clientSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().optional().or(z.literal("")),
  phone: z.string().trim().min(7).max(30),
  notes: z.string().trim().max(500).optional()
});

const clientUpdateSchema = clientSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: "At least one field is required"
});

router.get("/", async (request, response, next) => {
  try {
    const clients = await prisma.client.findMany({
      where: { studioId: request.auth!.studioId },
      orderBy: { createdAt: "desc" }
    });
    response.json(clients);
  } catch (error) {
    next(error);
  }
});

router.get("/search", async (request, response, next) => {
  const phone = typeof request.query.phone === "string" ? request.query.phone.trim() : "";
  const email = typeof request.query.email === "string" ? request.query.email.trim().toLowerCase() : "";

  if (!phone && !email) {
    response.status(400).json({ error: "Provide phone or email" });
    return;
  }

  try {
    const orConditions: Array<{ phone?: string; email?: string }> = [];
    if (phone) orConditions.push({ phone });
    if (email) orConditions.push({ email });

    const client = await prisma.client.findFirst({
      where: {
        studioId: request.auth!.studioId,
        ...(orConditions.length ? { OR: orConditions } : {})
      }
    });

    response.json(client ?? null);
  } catch (error) {
    next(error);
  }
});

router.post("/", async (request, response, next) => {
  const parsed = clientSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid client data", details: parsed.error.flatten() });
    return;
  }

  try {
    const client = await prisma.client.create({
      data: {
        studioId: request.auth!.studioId,
        name: parsed.data.name,
        email: parsed.data.email || null,
        phone: parsed.data.phone,
        notes: parsed.data.notes ?? null
      }
    });
    response.status(201).json(client);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      response.status(409).json({ error: "A client with this phone already exists in the studio" });
      return;
    }
    next(error);
  }
});

router.get("/:clientId", async (request, response, next) => {
  try {
    const client = await prisma.client.findFirst({
      where: { id: request.params.clientId, studioId: request.auth!.studioId }
    });

    if (!client) {
      response.status(404).json({ error: "Client not found" });
      return;
    }
    response.json(client);
  } catch (error) {
    next(error);
  }
});

router.patch("/:clientId", async (request, response, next) => {
  const parsed = clientUpdateSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid client data", details: parsed.error.flatten() });
    return;
  }

  try {
    const existing = await prisma.client.findFirst({
      where: { id: request.params.clientId, studioId: request.auth!.studioId }
    });

    if (!existing) {
      response.status(404).json({ error: "Client not found" });
      return;
    }

    const client = await prisma.client.update({
      where: { id: existing.id },
      data: {
        ...parsed.data,
        email: parsed.data.email === "" ? null : parsed.data.email ?? existing.email,
        notes: parsed.data.notes ?? existing.notes
      }
    });

    response.json(client);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      response.status(409).json({ error: "A client with this phone already exists in the studio" });
      return;
    }
    next(error);
  }
});

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

export { router as clientsRouter };
