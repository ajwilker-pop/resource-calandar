import { Router } from "express";
import { ResourceType, Role } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import type { AuthRequest } from "../types.js";

const router = Router();
const schema = z.object({
  name: z.string().trim().min(1).max(120),
  type: z.nativeEnum(ResourceType),
  description: z.string().max(500).default(""),
  isActive: z.boolean().optional()
});
router.use(authenticate);

router.get("/", async (_req, res, next) => {
  try { res.json(await prisma.resource.findMany({ orderBy: { name: "asc" } })); } catch (error) { next(error); }
});
router.post("/", requireRole(Role.ADMIN, Role.TEAM_LEAD), async (req: AuthRequest, res, next) => {
  try {
    const data = schema.parse(req.body);
    res.status(201).json(await prisma.resource.create({ data: { ...data, createdBy: req.user!.id } }));
  } catch (error) { next(error); }
});
router.put("/:id", requireRole(Role.ADMIN, Role.TEAM_LEAD), async (req, res, next) => {
  try { res.json(await prisma.resource.update({ where: { id: String(req.params.id) }, data: schema.partial().parse(req.body) })); } catch (error) { next(error); }
});
router.delete("/:id", requireRole(Role.ADMIN, Role.TEAM_LEAD), async (req, res, next) => {
  try {
    const resource = await prisma.resource.update({ where: { id: String(req.params.id) }, data: { isActive: false } });
    res.json(resource);
  } catch (error) { next(error); }
});

export default router;
