import { Router } from "express";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import type { AuthRequest } from "../types.js";

const router = Router();
const rolesSchema = z.array(z.nativeEnum(Role)).min(1).max(3).refine(roles => new Set(roles).size === roles.length, "Roles must be unique");
const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  username: z.string().trim().min(2).max(40),
  password: z.string().min(8),
  roles: rolesSchema
});
const publicUser = (user: { id: string; name: string; username: string; isActive: boolean; createdAt?: Date; roles: { role: Role }[] }) => ({
  id: user.id,
  name: user.name,
  username: user.username,
  roles: user.roles.map(item => item.role),
  isActive: user.isActive,
  ...(user.createdAt ? { createdAt: user.createdAt } : {})
});

router.use(authenticate, requireRole(Role.ADMIN));
router.get("/", async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      include: { roles: { select: { role: true } } },
      orderBy: { name: "asc" }
    });
    res.json(users.map(publicUser));
  } catch (error) { next(error); }
});
router.post("/", async (req, res, next) => {
  try {
    const { password, roles, ...fields } = createSchema.parse(req.body);
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        ...fields,
        legacyRole: roles[0]!,
        passwordHash,
        roles: { create: roles.map(role => ({ role })) }
      },
      include: { roles: { select: { role: true } } }
    });
    res.status(201).json(publicUser(user));
  } catch (error) { next(error); }
});
router.patch("/:id", async (req: AuthRequest, res, next) => {
  try {
    const data = z.object({
      isActive: z.boolean().optional(),
      password: z.string().min(8).optional(),
      roles: rolesSchema.optional()
    }).refine(value => Object.keys(value).length > 0).parse(req.body);
    const user = await prisma.user.update({
      where: { id: String(req.params.id) },
      data: {
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        ...(data.password ? { passwordHash: await bcrypt.hash(data.password, 12) } : {}),
        ...(data.roles ? {
          legacyRole: data.roles[0]!,
          roles: { deleteMany: {}, create: data.roles.map(role => ({ role })) }
        } : {})
      },
      include: { roles: { select: { role: true } } }
    });
    res.json(publicUser(user));
  } catch (error) { next(error); }
});
router.delete("/:id", async (req: AuthRequest, res, next) => {
  try {
    if (String(req.params.id) === req.user!.id) { res.status(400).json({ error: "You cannot deactivate your own account" }); return; }
    const user = await prisma.user.update({ where: { id: String(req.params.id) }, data: { isActive: false } });
    res.json({ id: user.id, isActive: user.isActive });
  } catch (error) { next(error); }
});
export default router;
