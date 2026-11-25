import type { NextFunction, Response } from "express";
import jwt from "jsonwebtoken";
import type { Role } from "@prisma/client";
import type { AuthRequest, AuthUser } from "../types.js";
import { prisma } from "../prisma.js";

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.cookies?.resource_calendar_token as string | undefined;
  if (!token) return res.status(401).json({ error: "Authentication required" });
  const secret = process.env.JWT_SECRET;
  if (!secret) return next(new Error("JWT_SECRET must be configured"));
  let tokenData: string | jwt.JwtPayload;
  try {
    tokenData = jwt.verify(token, secret);
  } catch {
    return res.status(401).json({ error: "Session expired. Please sign in again." });
  }
  if (typeof tokenData === "string" || typeof tokenData.id !== "string") {
    return res.status(401).json({ error: "Invalid session. Please sign in again." });
  }
  try {
    const user = await prisma.user.findUnique({
      where: { id: tokenData.id },
      include: { roles: { select: { role: true } } }
    });
    if (!user || !user.isActive) return res.status(401).json({ error: "Session expired. Please sign in again." });
    const roles = user.roles.map(item => item.role);
    req.user = { id: user.id, name: user.name, username: user.username, roles: roles.length ? roles : [user.legacyRole] } satisfies AuthUser;
    return next();
  } catch (error) {
    return next(error);
  }
}

export function requireRole(...roles: Role[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Authentication required" });
    if (!req.user.roles.some(role => roles.includes(role))) return res.status(403).json({ error: "You do not have permission to perform this action" });
    return next();
  };
}
