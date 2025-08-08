-- AlterTable
ALTER TABLE "users" ADD COLUMN     "created_by" JSONB,
ADD COLUMN     "deleted_by" JSONB;
