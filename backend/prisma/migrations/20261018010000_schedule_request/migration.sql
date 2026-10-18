CREATE TABLE "ScheduleRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScheduleRequest_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Email" ADD COLUMN "scheduleRequestId" TEXT;
ALTER TABLE "Email" ADD COLUMN "sendingLeaseUntil" TIMESTAMP(3);

INSERT INTO "ScheduleRequest" ("id", "userId", "idempotencyKey", "createdAt")
SELECT DISTINCT ON ("userId", left("idempotencyKey", length("idempotencyKey") - length(substring("idempotencyKey" from ':[0-9]+$'))))
    'legacy-' || md5("userId" || ':' || left("idempotencyKey", length("idempotencyKey") - length(substring("idempotencyKey" from ':[0-9]+$')))),
    "userId",
    left("idempotencyKey", length("idempotencyKey") - length(substring("idempotencyKey" from ':[0-9]+$'))),
    MIN("createdAt") OVER (PARTITION BY "userId", left("idempotencyKey", length("idempotencyKey") - length(substring("idempotencyKey" from ':[0-9]+$'))))
FROM "Email"
ORDER BY "userId", left("idempotencyKey", length("idempotencyKey") - length(substring("idempotencyKey" from ':[0-9]+$'))), "createdAt";

UPDATE "Email" e
SET "scheduleRequestId" = sr."id"
FROM "ScheduleRequest" sr
WHERE e."userId" = sr."userId"
  AND left(e."idempotencyKey", length(e."idempotencyKey") - length(substring(e."idempotencyKey" from ':[0-9]+$'))) = sr."idempotencyKey";

ALTER TABLE "Email" ALTER COLUMN "scheduleRequestId" SET NOT NULL;
CREATE UNIQUE INDEX "ScheduleRequest_userId_idempotencyKey_key" ON "ScheduleRequest"("userId", "idempotencyKey");
CREATE INDEX "Email_scheduleRequestId_idx" ON "Email"("scheduleRequestId");
ALTER TABLE "ScheduleRequest" ADD CONSTRAINT "ScheduleRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Email" ADD CONSTRAINT "Email_scheduleRequestId_fkey" FOREIGN KEY ("scheduleRequestId") REFERENCES "ScheduleRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
