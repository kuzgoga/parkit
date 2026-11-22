-- AlterTable
ALTER TABLE "Observation" ADD COLUMN     "taxonId" UUID;

-- CreateTable
CREATE TABLE "Taxon" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "latinName" TEXT,
    "genus" TEXT,
    "organismGroup" TEXT,
    "synonyms" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "Taxon_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Taxon_name_idx" ON "Taxon"("name");

-- CreateIndex
CREATE INDEX "Taxon_latinName_idx" ON "Taxon"("latinName");

-- CreateIndex
CREATE INDEX "Taxon_genus_idx" ON "Taxon"("genus");

-- CreateIndex
CREATE INDEX "Observation_taxonId_idx" ON "Observation"("taxonId");

-- AddForeignKey
ALTER TABLE "Observation" ADD CONSTRAINT "Observation_taxonId_fkey" FOREIGN KEY ("taxonId") REFERENCES "Taxon"("id") ON DELETE SET NULL ON UPDATE CASCADE;
