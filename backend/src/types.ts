import type { Request } from "express";
import type { Role } from "@prisma/client";

export interface AuthUser {
  id: string;
  name: string;
  username: string;
  roles: Role[];
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}
