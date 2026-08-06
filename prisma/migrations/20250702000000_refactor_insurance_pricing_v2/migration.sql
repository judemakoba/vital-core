-- Migration: refactor_insurance_pricing_v2
-- Removes package/plan/copay complexity; keeps simple negotiated-price lookup

BEGIN;

-- 0. Alter InsurancePriceListItem: rename priceValue → negotiatedPrice, drop dead columns
ALTER TABLE "InsurancePriceListItem" ADD COLUMN IF NOT EXISTS "negotiatedPrice" DOUBLE PRECISION;
UPDATE "InsurancePriceListItem" SET "negotiatedPrice" = "priceValue" WHERE "negotiatedPrice" IS NULL;
ALTER TABLE "InsurancePriceListItem" DROP COLUMN IF EXISTS "priceType";
ALTER TABLE "InsurancePriceListItem" DROP COLUMN IF EXISTS "priceValue";
ALTER TABLE "InsurancePriceListItem" DROP COLUMN IF EXISTS "appliesToAll";
ALTER TABLE "InsurancePriceListItem" DROP COLUMN IF EXISTS "priority";
ALTER TABLE "InsurancePriceListItem" ALTER COLUMN "negotiatedPrice" SET NOT NULL;

-- 0b. Drop unique constraint on old columns, add new one on serviceId
DO $$
BEGIN
    DROP INDEX IF EXISTS "InsurancePriceListItem_insuranceId_serviceType_serviceId_key";
EXCEPTION WHEN OTHERS THEN NULL;
END
$$;
CREATE UNIQUE INDEX IF NOT EXISTS "InsurancePriceListItem_insuranceId_serviceId_key"
    ON "InsurancePriceListItem"("insuranceId", "serviceId")
    WHERE "serviceId" IS NOT NULL;

-- 1. Drop FK constraints referencing deleted tables

-- 1. Drop FK constraints referencing deleted tables
ALTER TABLE "PatientInsurance" DROP CONSTRAINT IF EXISTS "PatientInsurance_packageId_fkey";
ALTER TABLE "InsurancePriceListItem" DROP CONSTRAINT IF EXISTS "InsurancePriceListItem_priceListItemId_fkey";

-- 2. Drop columns on surviving tables
ALTER TABLE "PatientInsurance" DROP COLUMN IF EXISTS "packageId";
ALTER TABLE "InsuranceClaim" DROP COLUMN IF EXISTS "copayAmount";
ALTER TABLE "InpatientCharge" DROP COLUMN IF EXISTS "copayAmount";
ALTER TABLE "DispensingLog" DROP COLUMN IF EXISTS "copayAmount";
ALTER TABLE "InvoiceLine" DROP COLUMN IF EXISTS "copayAmount";

-- 3. Drop deleted tables
DROP TABLE IF EXISTS "InsurancePlan" CASCADE;
DROP TABLE IF EXISTS "InsurancePackage" CASCADE;
DROP TABLE IF EXISTS "PackagePriceOverride" CASCADE;
DROP TABLE IF EXISTS "InsuranceDrugPrice" CASCADE;
DROP TABLE IF EXISTS "WardBillableRate" CASCADE;

COMMIT;
