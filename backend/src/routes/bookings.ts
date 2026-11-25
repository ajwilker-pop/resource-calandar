import { Router } from "express";
import { Role, TaskType } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { rangesOverlap } from "../utils/overlap.js";
import { isBeforeTodayInTimeZone, isPastDateTime, isValidTimeZone, isWholeDayRange } from "../utils/time.js";
import type { AuthRequest } from "../types.js";

const router = Router();
const bookingFields = z.object({
  resourceId: z.string().min(1),
  taskNumber: z.string().trim().min(1).max(50),
  taskType: z.nativeEnum(TaskType),
  taskTitle: z.string().trim().max(200).optional().nullable(),
  startDateTime: z.coerce.date(),
  endDateTime: z.coerce.date(),
  isAllDay: z.boolean().default(false),
  notes: z.string().max(2000).default(""),
  timeZone: z.string().optional().refine(value => !value || isValidTimeZone(value), "Invalid time zone")
});
const schema = bookingFields.refine(value => value.startDateTime < value.endDateTime, { path: ["endDateTime"], message: "End must be after start" });
const writers = requireRole(Role.ADMIN, Role.TEAM_LEAD);
router.use(authenticate);

async function overlapExists(resourceId: string, startDateTime: Date, endDateTime: Date, excludeId?: string) {
  const candidates = await prisma.booking.findMany({
    where: { resourceId, ...(excludeId ? { id: { not: excludeId } } : {}), startDateTime: { lt: endDateTime }, endDateTime: { gt: startDateTime } },
    select: { startDateTime: true, endDateTime: true }
  });
  return candidates.some(item => rangesOverlap({ startDateTime, endDateTime }, item));
}

router.get("/", async (req, res, next) => {
  try {
    const query = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional(), resourceId: z.string().optional() }).parse(req.query);
    res.json(await prisma.booking.findMany({
      where: {
        ...(query.resourceId ? { resourceId: query.resourceId } : {}),
        ...(query.from || query.to ? { startDateTime: { ...(query.to ? { lt: query.to } : {}) }, endDateTime: { ...(query.from ? { gt: query.from } : {}) } } : {})
      },
      include: { resource: true, creator: { select: { id: true, name: true, username: true } } },
      orderBy: { startDateTime: "asc" }
    }));
  } catch (error) { next(error); }
});
router.post("/", writers, async (req: AuthRequest, res, next) => {
  try {
    const { timeZone, ...data } = schema.parse(req.body);
    const zone = timeZone ?? "UTC";
    if (data.isAllDay ? isBeforeTodayInTimeZone(data.startDateTime, zone) : isPastDateTime(data.startDateTime)) {
      res.status(400).json({ error: "Resources cannot be blocked for a date or time in the past." }); return;
    }
    if (data.isAllDay && !isWholeDayRange(data.startDateTime, data.endDateTime, zone)) {
      res.status(400).json({ error: "All-day blocks must span one or more complete calendar days." }); return;
    }
    const resource = await prisma.resource.findUnique({ where: { id: data.resourceId } });
    if (!resource || !resource.isActive) { res.status(400).json({ error: "Choose an active resource" }); return; }
    if (await overlapExists(data.resourceId, data.startDateTime, data.endDateTime)) {
      res.status(409).json({ error: "This resource is already blocked during the selected time." }); return;
    }
    res.status(201).json(await prisma.booking.create({ data: { ...data, createdBy: req.user!.id }, include: { resource: true } }));
  } catch (error) { next(error); }
});
router.put("/:id", writers, async (req: AuthRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const existing = await prisma.booking.findUnique({ where: { id } });
    if (!existing) { res.status(404).json({ error: "Booking not found" }); return; }
    const canManageAll = req.user!.roles.some(role => role === Role.ADMIN || role === Role.TEAM_LEAD);
    if (!canManageAll && existing.createdBy !== req.user!.id) { res.status(403).json({ error: "You can only edit your own bookings" }); return; }
    const { timeZone, ...data } = bookingFields.partial().parse(req.body);
    const resourceId = data.resourceId ?? existing.resourceId;
    const startDateTime = data.startDateTime ?? existing.startDateTime;
    const endDateTime = data.endDateTime ?? existing.endDateTime;
    const isAllDay = data.isAllDay ?? existing.isAllDay;
    const zone = timeZone ?? "UTC";
    const changesSchedule = data.resourceId !== undefined || data.startDateTime !== undefined || data.endDateTime !== undefined || data.isAllDay !== undefined;
    if (changesSchedule && (isAllDay ? isBeforeTodayInTimeZone(startDateTime, zone) : isPastDateTime(startDateTime))) {
      res.status(400).json({ error: "Past bookings cannot be rescheduled." }); return;
    }
    if (changesSchedule && isAllDay && !isWholeDayRange(startDateTime, endDateTime, zone)) {
      res.status(400).json({ error: "All-day blocks must span one or more complete calendar days." }); return;
    }
    if (startDateTime >= endDateTime) { res.status(400).json({ error: "End must be after start" }); return; }
    if (await overlapExists(resourceId, startDateTime, endDateTime, existing.id)) {
      res.status(409).json({ error: "This resource is already blocked during the selected time." }); return;
    }
    res.json(await prisma.booking.update({ where: { id: existing.id }, data, include: { resource: true } }));
  } catch (error) { next(error); }
});
router.delete("/:id", writers, async (req: AuthRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const existing = await prisma.booking.findUnique({ where: { id } });
    if (!existing) { res.status(404).json({ error: "Booking not found" }); return; }
    const canManageAll = req.user!.roles.some(role => role === Role.ADMIN || role === Role.TEAM_LEAD);
    if (!canManageAll && existing.createdBy !== req.user!.id) { res.status(403).json({ error: "You can only delete your own bookings" }); return; }
    await prisma.booking.delete({ where: { id: existing.id } });
    res.json({ message: "Booking deleted" });
  } catch (error) { next(error); }
});
export default router;
