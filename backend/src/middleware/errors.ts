import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json({ error: "Validation failed", details: error.flatten().fieldErrors });
    return;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    res.status(409).json({ error: "A record with that value already exists" });
    return;
  }
  console.error(error);
  res.status(500).json({ error: "Internal server error" });
};
