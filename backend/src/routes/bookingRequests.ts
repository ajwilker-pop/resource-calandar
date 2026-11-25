import { Router } from "express";
import { BookingRequestStatus, Role, TaskType } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { isBeforeTodayInTimeZone, isPastDateTime, isValidTimeZone, isWholeDayRange } from "../utils/time.js";
import type { AuthRequest } from "../types.js";

const router = Router();
const requestSchema = z.object({
  taskNumber: z.string().trim().min(1).max(50),
  taskType: z.nativeEnum(TaskType),
  taskTitle: z.string().trim().max(200).optional().nullable(),
  startDateTime: z.coerce.date(),
  endDateTime: z.coerce.date(),
  isAllDay: z.boolean().default(false),
  notes: z.string().max(2000).default(""),
  timeZone: z.string().optional().refine(value => !value || isValidTimeZone(value), "Invalid time zone")
}).strict().refine(value => value.startDateTime < value.endDateTime, { path: ["endDateTime"], message: "End must be after start" });

router.use(authenticate);

router.get("/", async (req: AuthRequest, res, next) => {
  try {
    const canReview = req.user!.roles.some(role => role === Role.ADMIN || role === Role.TEAM_LEAD);
    if (!canReview && !req.user!.roles.includes(Role.PROJECT_MANAGER)) {
      res.status(403).json({ error: "You do not have permission to view booking requests" });
      return;
    }
    const requests = await prisma.bookingRequest.findMany({
      where: canReview ? {} : { createdBy: req.user!.id },
      include: {
        resource: true,
        requester: { select: { id: true, name: true, username: true } },
        reviewer: { select: { id: true, name: true } }
      },
      orderBy: { createdAt: "desc" }
    });
    res.json(requests);
  } catch (error) { next(error); }
});

router.post("/", requireRole(Role.PROJECT_MANAGER), async (req: AuthRequest, res, next) => {
  try {
    const { timeZone, ...data } = requestSchema.parse(req.body);
    const zone = timeZone ?? "UTC";
    if (data.isAllDay ? isBeforeTodayInTimeZone(data.startDateTime, zone) : isPastDateTime(data.startDateTime)) {
      res.status(400).json({ error: "Requests cannot be made for a date or time in the past." });
      return;
    }
    if (data.isAllDay && !isWholeDayRange(data.startDateTime, data.endDateTime, zone)) {
      res.status(400).json({ error: "All-day requests must span one or more complete calendar days." });
      return;
    }
    const request = await prisma.bookingRequest.create({
      data: { ...data, timeZone: zone, createdBy: req.user!.id },
      include: {
        resource: true,
        requester: { select: { id: true, name: true, username: true } }
      }
    });
    res.status(201).json(request);
  } catch (error) { next(error); }
});

router.post("/:id/approve", requireRole(Role.ADMIN, Role.TEAM_LEAD), async (req: AuthRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const { resourceId } = z.object({ resourceId: z.string().min(1) }).strict().parse(req.body);
    const outcome = await prisma.$transaction(async tx => {
      const request = await tx.bookingRequest.findUnique({ where: { id } });
      if (!request) return { kind: "not-found" as const };
      if (request.status !== BookingRequestStatus.PENDING) return { kind: "not-pending" as const };
      const zone = request.timeZone ?? "UTC";
      if (request.isAllDay ? isBeforeTodayInTimeZone(request.startDateTime, zone) : isPastDateTime(request.startDateTime)) {
        return { kind: "past" as const };
      }
      if (request.isAllDay && !isWholeDayRange(request.startDateTime, request.endDateTime, zone)) {
        return { kind: "invalid-all-day" as const };
      }
      const resource = await tx.resource.findUnique({ where: { id: resourceId } });
      if (!resource || !resource.isActive) return { kind: "inactive-resource" as const };
      const overlap = await tx.booking.findFirst({
        where: {
          resourceId,
          startDateTime: { lt: request.endDateTime },
          endDateTime: { gt: request.startDateTime }
        },
        select: { id: true }
      });
      if (overlap) return { kind: "overlap" as const };
      const claimed = await tx.bookingRequest.updateMany({
        where: { id, status: BookingRequestStatus.PENDING },
        data: { resourceId, status: BookingRequestStatus.APPROVED, reviewedBy: req.user!.id, reviewedAt: new Date() }
      });
      if (claimed.count !== 1) return { kind: "not-pending" as const };
      const booking = await tx.booking.create({
        data: {
          resourceId,
          taskNumber: request.taskNumber,
          taskType: request.taskType,
          taskTitle: request.taskTitle,
          startDateTime: request.startDateTime,
          endDateTime: request.endDateTime,
          isAllDay: request.isAllDay,
          notes: request.notes,
          createdBy: request.createdBy
        },
        include: { resource: true }
      });
      const updatedRequest = await tx.bookingRequest.findUnique({
        where: { id },
        include: {
          resource: true,
          requester: { select: { id: true, name: true, username: true } },
          reviewer: { select: { id: true, name: true } }
        }
      });
      if (!updatedRequest) throw new Error("Approved booking request disappeared within transaction");
      return { kind: "approved" as const, request: updatedRequest, booking };
    });
    if (outcome.kind === "not-found") { res.status(404).json({ error: "Booking request not found" }); return; }
    if (outcome.kind === "not-pending") { res.status(409).json({ error: "This request has already been reviewed." }); return; }
    if (outcome.kind === "past") { res.status(400).json({ error: "This request is now in the past and cannot be approved." }); return; }
    if (outcome.kind === "invalid-all-day") { res.status(400).json({ error: "All-day requests must span one or more complete calendar days." }); return; }
    if (outcome.kind === "inactive-resource") { res.status(400).json({ error: "The requested resource is no longer active." }); return; }
    if (outcome.kind === "overlap") { res.status(409).json({ error: "This resource is already blocked during the requested time. The request remains pending." }); return; }
    res.json(outcome);
  } catch (error) { next(error); }
});

router.post("/:id/reject", requireRole(Role.ADMIN, Role.TEAM_LEAD), async (req: AuthRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const { reason } = z.object({ reason: z.string().trim().max(500).optional() }).parse(req.body ?? {});
    const request = await prisma.bookingRequest.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!request) { res.status(404).json({ error: "Booking request not found" }); return; }
    if (request.status !== BookingRequestStatus.PENDING) { res.status(409).json({ error: "This request has already been reviewed." }); return; }
    const updated = await prisma.bookingRequest.updateMany({
      where: { id, status: BookingRequestStatus.PENDING },
      data: {
        status: BookingRequestStatus.REJECTED,
        rejectionReason: reason || null,
        reviewedBy: req.user!.id,
        reviewedAt: new Date()
      }
    });
    if (updated.count !== 1) { res.status(409).json({ error: "This request has already been reviewed." }); return; }
    const updatedRequest = await prisma.bookingRequest.findUniqueOrThrow({
      where: { id },
      include: {
        resource: true,
        requester: { select: { id: true, name: true, username: true } },
        reviewer: { select: { id: true, name: true } }
      }
    });
    res.json(updatedRequest);
  } catch (error) { next(error); }
});

export default router;
