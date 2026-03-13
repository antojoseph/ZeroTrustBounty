-- AlterTable
ALTER TABLE "reports" ADD COLUMN "tlsProof" TEXT;
ALTER TABLE "reports" ADD COLUMN "tlsProofRecvData" TEXT;
ALTER TABLE "reports" ADD COLUMN "tlsProofSentData" TEXT;
ALTER TABLE "reports" ADD COLUMN "tlsProofServerName" TEXT;
ALTER TABLE "reports" ADD COLUMN "tlsProofStatus" TEXT;
ALTER TABLE "reports" ADD COLUMN "tlsProofTime" DATETIME;
