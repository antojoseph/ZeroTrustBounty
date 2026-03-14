ALTER TABLE "reports" ADD COLUMN "tlsProofFullRevealedAt" DATETIME;
ALTER TABLE "reports" ADD COLUMN "tlsProofFullSentData" TEXT;
ALTER TABLE "reports" ADD COLUMN "tlsProofHasHiddenComponents" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "reports" ADD COLUMN "tlsProofRevealState" TEXT;
ALTER TABLE "reports" ADD COLUMN "tlsProofRevealUnlockedAt" DATETIME;
