import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { hashPassword, verifyPassword } from "../../lib/password";
import { createToken } from "../../lib/token";
import { requireAuth } from "../../middleware/auth";

const router = Router();

const registerSchema = z.object({
  studioName: z.string().trim().min(2).max(100),
  studioSlug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]+$/).min(3).max(60),
  ownerName: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(128)
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1)
});

router.post("/register", async (request, response, next) => {
  const parsed = registerSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid registration data", details: parsed.error.flatten() });
    return;
  }

  const { studioName, studioSlug, ownerName, email, password } = parsed.data;

  try {
    const passwordHash = await hashPassword(password);
    const result = await prisma.$transaction(async (transaction) => {
      const user = await transaction.user.create({
        data: { name: ownerName, email, passwordHash }
      });
      const studio = await transaction.studio.create({
        data: { name: studioName, slug: studioSlug }
      });
      await transaction.studioMember.create({
        data: { studioId: studio.id, userId: user.id, role: "OWNER" }
      });
      return { user, studio };
    });

    const token = createToken({ userId: result.user.id, studioId: result.studio.id, role: "OWNER" });
    response.status(201).json({
      token,
      user: { id: result.user.id, name: result.user.name, email: result.user.email },
      studio: { id: result.studio.id, name: result.studio.name, slug: result.studio.slug }
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      response.status(409).json({ error: "Email or studio slug already exists" });
      return;
    }
    next(error);
  }
});

router.post("/login", async (request, response, next) => {
  const parsed = loginSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid login data" });
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: parsed.data.email },
      include: { memberships: true }
    });
    const membership = user?.memberships[0];

    if (!user || !membership || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
      response.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const token = createToken({ userId: user.id, studioId: membership.studioId, role: membership.role });
    response.json({
      token,
      user: { id: user.id, name: user.name, email: user.email },
      studioId: membership.studioId,
      role: membership.role
    });
  } catch (error) {
    next(error);
  }
});

router.get("/me", requireAuth, async (request, response, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: request.auth!.userId },
      select: { id: true, name: true, email: true }
    });
    response.json({ user, auth: request.auth });
  } catch (error) {
    next(error);
  }
});

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

export { router as authRouter };
