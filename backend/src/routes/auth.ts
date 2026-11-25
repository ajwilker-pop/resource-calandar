import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { authenticate } from "../middleware/auth.js";
import type { AuthRequest } from "../types.js";

const router = Router();
const loginSchema = z.object({ username: z.string().min(1), password: z.string().min(1) });
router.post("/login", async (req, res, next) => {
  try {
    const { username, password } = loginSchema.parse(req.body);
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error("JWT_SECRET must be configured");
    const user = await prisma.user.findUnique({ where: { username }, include: { roles: { select: { role: true } } } });
    if (!user || !user.isActive || !(await bcrypt.compare(password, user.passwordHash))) {
      res.status(401).json({ error: "Invalid username or password" });
      return;
    }
    const roles = user.roles.map(item => item.role);
    const effectiveRoles = roles.length ? roles : [user.legacyRole];
    const token = jwt.sign({ id: user.id }, secret, { expiresIn: "12h" });
    res.cookie("resource_calendar_token", token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 12 * 60 * 60 * 1000 });
    res.json({ user: { id: user.id, name: user.name, username: user.username, roles: effectiveRoles } });
  } catch (error) { next(error); }
});

router.post("/logout", (_req, res) => {
  res.clearCookie("resource_calendar_token", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  res.json({ message: "Logged out" });
});

router.get("/me", authenticate, (req: AuthRequest, res) => res.json({ user: req.user }));

export default router;
