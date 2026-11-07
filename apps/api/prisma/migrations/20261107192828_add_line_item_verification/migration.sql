-- AlterTable
ALTER TABLE "LineItem" ADD COLUMN     "correctionNote" TEXT,
ADD COLUMN     "verificationStatus" "FieldVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED';
