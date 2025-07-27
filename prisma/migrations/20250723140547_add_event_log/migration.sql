-- AlterTable
ALTER TABLE "users" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "event_logs" (
    "id" TEXT NOT NULL,
    "aggregate_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "event_version" INTEGER NOT NULL,
    "event_data" JSONB NOT NULL,
    "metadata" JSONB,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "position" BIGSERIAL NOT NULL,

    CONSTRAINT "event_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_logs_aggregate_id_idx" ON "event_logs"("aggregate_id");

-- CreateIndex
CREATE INDEX "event_logs_event_type_idx" ON "event_logs"("event_type");

-- CreateIndex
CREATE INDEX "event_logs_occurred_at_idx" ON "event_logs"("occurred_at");

-- CreateIndex
CREATE INDEX "event_logs_position_idx" ON "event_logs"("position");
