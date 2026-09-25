-- Se elimina el rol SOSTENEDOR: sus usuarios pasan a DIRECTOR antes de cambiar el enum.
UPDATE "User" SET "role" = 'DIRECTOR' WHERE "role" = 'SOSTENEDOR';
DELETE FROM "DocumentVisibility" WHERE "role" = 'SOSTENEDOR';

-- CreateEnum
CREATE TYPE "CitationResponse" AS ENUM ('ACEPTADA', 'RECHAZADA', 'REPROGRAMAR');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'RESPOND_CITATION';

-- AlterEnum
BEGIN;
CREATE TYPE "Role_new" AS ENUM ('DIRECTOR', 'EQUIPO_DIRECTIVO', 'DOCENTE', 'APODERADO');
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role_new" USING ("role"::text::"Role_new");
ALTER TABLE "DocumentVisibility" ALTER COLUMN "role" TYPE "Role_new" USING ("role"::text::"Role_new");
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "public"."Role_old";
COMMIT;

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "citationAt" TIMESTAMP(3),
ADD COLUMN     "citationPlace" TEXT;

-- AlterTable
ALTER TABLE "DocumentRecipient" ADD COLUMN     "respondedAt" TIMESTAMP(3),
ADD COLUMN     "response" "CitationResponse",
ADD COLUMN     "responseComment" TEXT;

