/*
  Warnings:

  - You are about to drop the column `updated_by_email` on the `event_logs` table. All the data in the column will be lost.
  - You are about to drop the column `updated_by_id` on the `event_logs` table. All the data in the column will be lost.
  - You are about to drop the column `updated_by_name` on the `event_logs` table. All the data in the column will be lost.
  - You are about to drop the column `updated_by_email` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `updated_by_id` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `updated_by_name` on the `users` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "event_logs" DROP COLUMN "updated_by_email",
DROP COLUMN "updated_by_id",
DROP COLUMN "updated_by_name",
ADD COLUMN     "updated_by" JSONB;

-- AlterTable
ALTER TABLE "users" DROP COLUMN "updated_by_email",
DROP COLUMN "updated_by_id",
DROP COLUMN "updated_by_name",
ADD COLUMN     "updated_by" JSONB;
