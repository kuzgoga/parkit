-- CreateIndex
CREATE INDEX "Observation_keywords_idx" ON "Observation" USING GIN ("keywords" array_ops);

-- CreateIndex
CREATE INDEX "Taxon_synonyms_idx" ON "Taxon" USING GIN ("synonyms" array_ops);
