-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('QUEUED', 'PROCESSING', 'PROCESSED', 'FAILED');

-- CreateTable
CREATE TABLE "Document" (
    "id" UUID NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "bucket" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'QUEUED',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Observation" (
    "id" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "speciesText" TEXT,
    "speciesName" TEXT,
    "latinName" TEXT,
    "genus" TEXT,
    "organismGroup" TEXT,
    "event" TEXT,
    "observedAt" TIMESTAMP(3),
    "observedYear" INTEGER,
    "placeName" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "habitat" TEXT,
    "numericValue" DECIMAL(18,4),
    "numericUnit" TEXT,
    "observer" TEXT,
    "notes" TEXT,
    "sourceVolume" TEXT,
    "sourcePage" INTEGER,
    "sourceExcerpt" TEXT,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Observation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Document_objectKey_key" ON "Document"("objectKey");

-- CreateIndex
CREATE INDEX "Observation_documentId_idx" ON "Observation"("documentId");

-- CreateIndex
CREATE INDEX "Observation_observedAt_idx" ON "Observation"("observedAt");

-- CreateIndex
CREATE INDEX "Observation_observedYear_idx" ON "Observation"("observedYear");

-- CreateIndex
CREATE INDEX "Observation_speciesName_idx" ON "Observation"("speciesName");

-- CreateIndex
CREATE INDEX "Observation_latinName_idx" ON "Observation"("latinName");

-- CreateIndex
CREATE INDEX "Observation_genus_idx" ON "Observation"("genus");

-- CreateIndex
CREATE INDEX "Observation_placeName_idx" ON "Observation"("placeName");

-- CreateIndex
CREATE INDEX "Observation_observer_idx" ON "Observation"("observer");

-- AddForeignKey
ALTER TABLE "Observation" ADD CONSTRAINT "Observation_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
