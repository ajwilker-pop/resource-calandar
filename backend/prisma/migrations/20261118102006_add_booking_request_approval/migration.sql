-- CreateTable
CREATE TABLE "BookingRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "resourceId" TEXT NOT NULL,
    "taskNumber" TEXT NOT NULL,
    "taskType" TEXT NOT NULL,
    "taskTitle" TEXT,
    "startDateTime" DATETIME NOT NULL,
    "endDateTime" DATETIME NOT NULL,
    "isAllDay" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "timeZone" TEXT,
    "createdBy" TEXT NOT NULL,
    "reviewedBy" TEXT,
    "reviewedAt" DATETIME,
    "rejectionReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BookingRequest_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BookingRequest_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BookingRequest_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "BookingRequest_status_createdAt_idx" ON "BookingRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "BookingRequest_createdBy_createdAt_idx" ON "BookingRequest"("createdBy", "createdAt");
