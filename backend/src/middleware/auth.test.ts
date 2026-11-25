import { describe, expect, it, vi } from "vitest";
import { Role } from "@prisma/client";
import type { Response } from "express";
import type { AuthRequest } from "../types.js";
import { requireRole } from "./auth.js";

describe("requireRole", () => {
  it("rejects a user whose role is not permitted", () => {
    const req = { user: { id: "1", roles: [Role.PROJECT_MANAGER] } } as AuthRequest;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
    const next = vi.fn();
    requireRole(Role.ADMIN)(req, res, next);
    expect(vi.mocked(res.status)).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
  it("continues for a permitted role", () => {
    const req = { user: { id: "1", roles: [Role.TEAM_LEAD, Role.PROJECT_MANAGER] } } as AuthRequest;
    const res = {} as Response;
    const next = vi.fn();
    requireRole(Role.TEAM_LEAD)(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });
});
