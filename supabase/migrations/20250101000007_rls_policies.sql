-- Migration 007: RLS policies for all new tables

-- sources: public read, service_role write
ALTER TABLE sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sources_public_read"   ON sources FOR SELECT USING (TRUE);
CREATE POLICY "sources_service_write" ON sources FOR ALL USING (auth.role() = 'service_role');

-- ingestion_jobs: service_role only (internal)
ALTER TABLE ingestion_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ingestion_jobs_service_only" ON ingestion_jobs FOR ALL USING (auth.role() = 'service_role');
