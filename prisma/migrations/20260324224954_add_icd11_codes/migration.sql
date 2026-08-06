/*
  Warnings:

  - You are about to drop the column `category` on the `LabTestCatalog` table. All the data in the column will be lost.
  - Added the required column `categoryId` to the `LabTestCatalog` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "NursingCareLevel" AS ENUM ('STANDARD', 'INTERMEDIATE', 'INTENSIVE', 'SPECIAL', 'ONE_TO_ONE');

-- CreateEnum
CREATE TYPE "BillableItemCategory" AS ENUM ('ROOM_BOARD', 'NURSING_FEE', 'MEDICAL_FEE', 'PROCEDURE', 'MEDICATION', 'CONSUMABLE', 'LABORATORY', 'RADIOLOGY', 'THERAPY', 'SUNDRY', 'DEPOSIT', 'OTHER');

-- CreateEnum
CREATE TYPE "ChargeFrequency" AS ENUM ('ONE_TIME', 'DAILY', 'PER_SHIFT', 'PER_SERVICE', 'PER_UNIT', 'HOURLY');

-- CreateEnum
CREATE TYPE "ChargeApplication" AS ENUM ('AUTO', 'MANUAL', 'ORDER_BASED', 'TASK_BASED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'MOBILE_MONEY', 'CARD', 'BANK_TRANSFER', 'PAYMENT_PLAN');

-- AlterTable
ALTER TABLE "Diagnosis" ADD COLUMN     "icdVersion" TEXT;

-- AlterTable
ALTER TABLE "LabTestCatalog" DROP COLUMN "category",
ADD COLUMN     "categoryId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "ICD11Code" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,

    CONSTRAINT "ICD11Code_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ward" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bed" (
    "id" TEXT NOT NULL,
    "wardId" TEXT NOT NULL,
    "bedNumber" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "features" TEXT,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "ratePerDay" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Admission" (
    "id" TEXT NOT NULL,
    "admissionNumber" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "visitId" TEXT,
    "wardId" TEXT,
    "bedId" TEXT,
    "admittingDoctorId" TEXT NOT NULL,
    "admissionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dischargeDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ADMITTED',
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Admission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillableItem" (
    "id" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "description" TEXT,
    "category" "BillableItemCategory" NOT NULL,
    "subCategory" TEXT,
    "frequency" "ChargeFrequency" NOT NULL,
    "application" "ChargeApplication" NOT NULL,
    "defaultQuantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unitOfMeasure" TEXT,
    "standardRate" DOUBLE PRECISION NOT NULL,
    "insuranceRate" DOUBLE PRECISION,
    "memberRate" DOUBLE PRECISION,
    "staffRate" DOUBLE PRECISION,
    "taxRateId" TEXT,
    "isTaxable" BOOLEAN NOT NULL DEFAULT true,
    "revenueAccountId" TEXT,
    "autoApplyRules" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "requiresAuth" BOOLEAN NOT NULL DEFAULT false,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillableItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WardBillableRate" (
    "id" TEXT NOT NULL,
    "wardId" TEXT NOT NULL,
    "billableItemId" TEXT NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WardBillableRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsuranceBillableRate" (
    "id" TEXT NOT NULL,
    "insuranceId" TEXT NOT NULL,
    "billableItemId" TEXT NOT NULL,
    "packageId" TEXT,
    "rate" DOUBLE PRECISION NOT NULL,
    "copayPercentage" DOUBLE PRECISION DEFAULT 0,
    "copayFixed" DOUBLE PRECISION DEFAULT 0,
    "requiresAuth" BOOLEAN NOT NULL DEFAULT false,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InsuranceBillableRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InpatientCharge" (
    "id" TEXT NOT NULL,
    "chargeNumber" TEXT NOT NULL,
    "admissionId" TEXT NOT NULL,
    "billableItemId" TEXT NOT NULL,
    "chargeDate" TIMESTAMP(3) NOT NULL,
    "chargeTime" TIMESTAMP(3),
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "generationMethod" TEXT NOT NULL,
    "sourceId" TEXT,
    "shiftDate" TIMESTAMP(3),
    "shiftType" TEXT,
    "nurseId" TEXT,
    "nursingLevel" "NursingCareLevel",
    "sundryType" TEXT,
    "dispensingId" TEXT,
    "insuranceId" TEXT,
    "insuranceShare" DOUBLE PRECISION,
    "patientShare" DOUBLE PRECISION,
    "copayAmount" DOUBLE PRECISION DEFAULT 0,
    "isBilled" BOOLEAN NOT NULL DEFAULT false,
    "invoiceId" TEXT,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "dailyChargeSummaryId" TEXT,

    CONSTRAINT "InpatientCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyChargeSummary" (
    "id" TEXT NOT NULL,
    "admissionId" TEXT NOT NULL,
    "chargeDate" TIMESTAMP(3) NOT NULL,
    "dayOfStay" INTEGER NOT NULL,
    "roomBoardTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "nursingTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "medicalTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "medicationTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "procedureTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "labTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "radiologyTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sundryTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "otherTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "subtotal" DOUBLE PRECISION NOT NULL,
    "taxTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "grandTotal" DOUBLE PRECISION NOT NULL,
    "insuranceTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "patientTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isFinalized" BOOLEAN NOT NULL DEFAULT false,
    "finalizedAt" TIMESTAMP(3),
    "finalizedById" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyChargeSummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InpatientDeposit" (
    "id" TEXT NOT NULL,
    "depositNumber" TEXT NOT NULL,
    "admissionId" TEXT NOT NULL,
    "depositDate" TIMESTAMP(3) NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "receiptNumber" TEXT,
    "receivedById" TEXT NOT NULL,
    "notes" TEXT,
    "remainingBalance" DOUBLE PRECISION NOT NULL,
    "isFullyApplied" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InpatientDeposit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepositApplication" (
    "id" TEXT NOT NULL,
    "depositId" TEXT NOT NULL,
    "chargeId" TEXT,
    "invoiceId" TEXT,
    "amountApplied" DOUBLE PRECISION NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedById" TEXT NOT NULL,

    CONSTRAINT "DepositApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FloorStock" (
    "id" TEXT NOT NULL,
    "wardId" TEXT NOT NULL,
    "drugId" TEXT NOT NULL,
    "batchNumber" TEXT,
    "quantityOnHand" INTEGER NOT NULL,
    "reorderLevel" INTEGER NOT NULL,
    "maxStock" INTEGER NOT NULL,
    "lastCountDate" TIMESTAMP(3),
    "lastCountBy" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FloorStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FloorStockUsage" (
    "id" TEXT NOT NULL,
    "floorStockId" TEXT NOT NULL,
    "admissionId" TEXT NOT NULL,
    "quantityUsed" INTEGER NOT NULL,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedById" TEXT NOT NULL,
    "chargeId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FloorStockUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ICD11Code_code_key" ON "ICD11Code"("code");

-- CreateIndex
CREATE UNIQUE INDEX "LabCategory_name_key" ON "LabCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Bed_bedNumber_key" ON "Bed"("bedNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Admission_admissionNumber_key" ON "Admission"("admissionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Admission_visitId_key" ON "Admission"("visitId");

-- CreateIndex
CREATE UNIQUE INDEX "BillableItem_itemCode_key" ON "BillableItem"("itemCode");

-- CreateIndex
CREATE UNIQUE INDEX "WardBillableRate_wardId_billableItemId_effectiveFrom_key" ON "WardBillableRate"("wardId", "billableItemId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "InsuranceBillableRate_insuranceId_billableItemId_packageId_key" ON "InsuranceBillableRate"("insuranceId", "billableItemId", "packageId");

-- CreateIndex
CREATE UNIQUE INDEX "InpatientCharge_chargeNumber_key" ON "InpatientCharge"("chargeNumber");

-- CreateIndex
CREATE UNIQUE INDEX "InpatientDeposit_depositNumber_key" ON "InpatientDeposit"("depositNumber");

-- AddForeignKey
ALTER TABLE "LabTestCatalog" ADD CONSTRAINT "LabTestCatalog_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "LabCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bed" ADD CONSTRAINT "Bed_wardId_fkey" FOREIGN KEY ("wardId") REFERENCES "Ward"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_wardId_fkey" FOREIGN KEY ("wardId") REFERENCES "Ward"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_bedId_fkey" FOREIGN KEY ("bedId") REFERENCES "Bed"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_admittingDoctorId_fkey" FOREIGN KEY ("admittingDoctorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillableItem" ADD CONSTRAINT "BillableItem_taxRateId_fkey" FOREIGN KEY ("taxRateId") REFERENCES "TaxRate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillableItem" ADD CONSTRAINT "BillableItem_revenueAccountId_fkey" FOREIGN KEY ("revenueAccountId") REFERENCES "ChartOfAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WardBillableRate" ADD CONSTRAINT "WardBillableRate_wardId_fkey" FOREIGN KEY ("wardId") REFERENCES "Ward"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WardBillableRate" ADD CONSTRAINT "WardBillableRate_billableItemId_fkey" FOREIGN KEY ("billableItemId") REFERENCES "BillableItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceBillableRate" ADD CONSTRAINT "InsuranceBillableRate_insuranceId_fkey" FOREIGN KEY ("insuranceId") REFERENCES "InsuranceCompany"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceBillableRate" ADD CONSTRAINT "InsuranceBillableRate_billableItemId_fkey" FOREIGN KEY ("billableItemId") REFERENCES "BillableItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceBillableRate" ADD CONSTRAINT "InsuranceBillableRate_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "InsurancePackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InpatientCharge" ADD CONSTRAINT "InpatientCharge_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "Admission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InpatientCharge" ADD CONSTRAINT "InpatientCharge_billableItemId_fkey" FOREIGN KEY ("billableItemId") REFERENCES "BillableItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InpatientCharge" ADD CONSTRAINT "InpatientCharge_nurseId_fkey" FOREIGN KEY ("nurseId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InpatientCharge" ADD CONSTRAINT "InpatientCharge_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InpatientCharge" ADD CONSTRAINT "InpatientCharge_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InpatientCharge" ADD CONSTRAINT "InpatientCharge_dailyChargeSummaryId_fkey" FOREIGN KEY ("dailyChargeSummaryId") REFERENCES "DailyChargeSummary"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyChargeSummary" ADD CONSTRAINT "DailyChargeSummary_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "Admission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyChargeSummary" ADD CONSTRAINT "DailyChargeSummary_finalizedById_fkey" FOREIGN KEY ("finalizedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InpatientDeposit" ADD CONSTRAINT "InpatientDeposit_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "Admission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InpatientDeposit" ADD CONSTRAINT "InpatientDeposit_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepositApplication" ADD CONSTRAINT "DepositApplication_depositId_fkey" FOREIGN KEY ("depositId") REFERENCES "InpatientDeposit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepositApplication" ADD CONSTRAINT "DepositApplication_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "InpatientCharge"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepositApplication" ADD CONSTRAINT "DepositApplication_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepositApplication" ADD CONSTRAINT "DepositApplication_appliedById_fkey" FOREIGN KEY ("appliedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FloorStock" ADD CONSTRAINT "FloorStock_wardId_fkey" FOREIGN KEY ("wardId") REFERENCES "Ward"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FloorStock" ADD CONSTRAINT "FloorStock_drugId_fkey" FOREIGN KEY ("drugId") REFERENCES "Drug"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FloorStockUsage" ADD CONSTRAINT "FloorStockUsage_floorStockId_fkey" FOREIGN KEY ("floorStockId") REFERENCES "FloorStock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FloorStockUsage" ADD CONSTRAINT "FloorStockUsage_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "Admission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FloorStockUsage" ADD CONSTRAINT "FloorStockUsage_usedById_fkey" FOREIGN KEY ("usedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FloorStockUsage" ADD CONSTRAINT "FloorStockUsage_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "InpatientCharge"("id") ON DELETE SET NULL ON UPDATE CASCADE;
