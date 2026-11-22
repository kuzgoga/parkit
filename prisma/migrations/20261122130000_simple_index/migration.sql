-- Keep existing observations while moving their searchable labels to a small term table.
CREATE TYPE "TermType" AS ENUM ('SPECIES', 'LATIN', 'GENUS', 'GROUP', 'PLACE', 'HABITAT', 'EVENT', 'OBSERVER', 'KEYWORD');

ALTER TABLE "Document"
  ADD COLUMN "textObjectKey" TEXT,
  ADD COLUMN "aiFileId" TEXT,
  ADD COLUMN "ocrUsed" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "Term" (
  "id" UUID NOT NULL,
  "type" "TermType" NOT NULL,
  "label" TEXT NOT NULL,
  CONSTRAINT "Term_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Term_type_label_key" ON "Term"("type", "label");
CREATE INDEX "Term_label_idx" ON "Term"("label");

CREATE TABLE "ObservationTerm" (
  "observationId" UUID NOT NULL,
  "termId" UUID NOT NULL,
  CONSTRAINT "ObservationTerm_pkey" PRIMARY KEY ("observationId", "termId")
);
CREATE INDEX "ObservationTerm_termId_idx" ON "ObservationTerm"("termId");
ALTER TABLE "ObservationTerm" ADD CONSTRAINT "ObservationTerm_observationId_fkey" FOREIGN KEY ("observationId") REFERENCES "Observation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ObservationTerm" ADD CONSTRAINT "ObservationTerm_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE CASCADE ON UPDATE CASCADE;

WITH labels AS (
  SELECT o.id, 'SPECIES'::"TermType" AS type, COALESCE(NULLIF(o."speciesName", ''), NULLIF(o."speciesText", ''), NULLIF(t."name", '')) AS label FROM "Observation" o LEFT JOIN "Taxon" t ON t.id = o."taxonId"
  UNION ALL SELECT o.id, 'LATIN'::"TermType", COALESCE(NULLIF(o."latinName", ''), NULLIF(t."latinName", '')) FROM "Observation" o LEFT JOIN "Taxon" t ON t.id = o."taxonId"
  UNION ALL SELECT o.id, 'GENUS'::"TermType", COALESCE(NULLIF(o."genus", ''), NULLIF(t."genus", '')) FROM "Observation" o LEFT JOIN "Taxon" t ON t.id = o."taxonId"
  UNION ALL SELECT o.id, 'GROUP'::"TermType", COALESCE(NULLIF(o."organismGroup", ''), NULLIF(t."organismGroup", '')) FROM "Observation" o LEFT JOIN "Taxon" t ON t.id = o."taxonId"
  UNION ALL SELECT id, 'PLACE'::"TermType", "placeName" FROM "Observation"
  UNION ALL SELECT id, 'HABITAT'::"TermType", "habitat" FROM "Observation"
  UNION ALL SELECT id, 'EVENT'::"TermType", "event" FROM "Observation"
  UNION ALL SELECT id, 'OBSERVER'::"TermType", "observer" FROM "Observation"
  UNION ALL SELECT id, 'KEYWORD'::"TermType", unnest("keywords") FROM "Observation"
)
INSERT INTO "Term" (id, type, label)
SELECT gen_random_uuid(), type, btrim(label) FROM labels WHERE label IS NOT NULL AND btrim(label) <> ''
ON CONFLICT (type, label) DO NOTHING;

WITH labels AS (
  SELECT o.id, 'SPECIES'::"TermType" AS type, COALESCE(NULLIF(o."speciesName", ''), NULLIF(o."speciesText", ''), NULLIF(t."name", '')) AS label FROM "Observation" o LEFT JOIN "Taxon" t ON t.id = o."taxonId"
  UNION ALL SELECT o.id, 'LATIN'::"TermType", COALESCE(NULLIF(o."latinName", ''), NULLIF(t."latinName", '')) FROM "Observation" o LEFT JOIN "Taxon" t ON t.id = o."taxonId"
  UNION ALL SELECT o.id, 'GENUS'::"TermType", COALESCE(NULLIF(o."genus", ''), NULLIF(t."genus", '')) FROM "Observation" o LEFT JOIN "Taxon" t ON t.id = o."taxonId"
  UNION ALL SELECT o.id, 'GROUP'::"TermType", COALESCE(NULLIF(o."organismGroup", ''), NULLIF(t."organismGroup", '')) FROM "Observation" o LEFT JOIN "Taxon" t ON t.id = o."taxonId"
  UNION ALL SELECT id, 'PLACE'::"TermType", "placeName" FROM "Observation"
  UNION ALL SELECT id, 'HABITAT'::"TermType", "habitat" FROM "Observation"
  UNION ALL SELECT id, 'EVENT'::"TermType", "event" FROM "Observation"
  UNION ALL SELECT id, 'OBSERVER'::"TermType", "observer" FROM "Observation"
  UNION ALL SELECT id, 'KEYWORD'::"TermType", unnest("keywords") FROM "Observation"
)
INSERT INTO "ObservationTerm" ("observationId", "termId")
SELECT DISTINCT labels.id, t.id FROM labels JOIN "Term" t ON t.type = labels.type AND t.label = btrim(labels.label)
ON CONFLICT DO NOTHING;

-- Keep legacy Observation columns and Taxon for historical data and rollback safety.
ALTER TABLE "Observation" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
