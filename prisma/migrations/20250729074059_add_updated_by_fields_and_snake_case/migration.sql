/*
  Warnings:

  - You are about to drop the column `createdAt` on the `outbox_events` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `users` table. All the data in the column will be lost.
  - Added the required column `updated_at` to the `users` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "event_logs" ADD COLUMN     "updated_by_email" TEXT,
ADD COLUMN     "updated_by_id" TEXT,
ADD COLUMN     "updated_by_name" TEXT;

-- AlterTable
ALTER TABLE "outbox_events" DROP COLUMN "createdAt",
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "users" DROP COLUMN "createdAt",
DROP COLUMN "updatedAt",
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "updated_by_email" TEXT,
ADD COLUMN     "updated_by_id" TEXT,
ADD COLUMN     "updated_by_name" TEXT;
