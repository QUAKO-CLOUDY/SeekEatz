/**
 * SeekEatz Ingestion Job Runner
 *
 * Orchestrates ingestion jobs across all data sources. Tracks each run
 * in the ingestion_jobs table so you have a full audit trail.
 *
 * Usage (from scripts/):
 *   const runner = new JobRunner(supabase);
 *   await runner.runJSONImport('data/jsons');
 *
 * The runner handles:
 *   - Job creation and status tracking in ingestion_jobs table
 *   - Error logging per job
 *   - Duration tracking
 *   - Source ID resolution
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { importAllJSONFiles, summarizeResults } from './sources/json-importer';

// ─── Job Runner ───────────────────────────────────────────────────────────────

export class JobRunner {
  constructor(private supabase: SupabaseClient) {}

  // ── JSON Import ────────────────────────────────────────────────────────────

  async runJSONImport(jsonDir: string): Promise<void> {
    const batchId = `json_${Date.now()}`;
    const sourceId = await this.resolveSourceId('JSON Import');

    console.log(`\n[JobRunner] Starting JSON import from: ${jsonDir}`);
    console.log(`[JobRunner] Batch ID: ${batchId}`);

    const jobId = await this.createJob({
      sourceId,
      jobType: 'full',
      batchId,
    });

    const startedAt = Date.now();

    try {
      await this.updateJobStatus(jobId, 'running');

      const results = await importAllJSONFiles(
        this.supabase,
        jsonDir,
        sourceId,
        batchId,
        (result, index, total) => {
          const status = result.failed > 0 ? '❌' : result.errors.length > 0 ? '⚠️' : '✅';
          console.log(
            `  ${status} [${index + 1}/${total}] ${result.restaurantName}: ` +
            `${result.updated} upserted, ${result.failed} failed`
          );
        }
      );

      const summary = summarizeResults(results);
      const durationMs = Date.now() - startedAt;

      console.log(`\n[JobRunner] Import complete in ${(durationMs / 1000).toFixed(1)}s`);
      console.log(`  Restaurants: ${summary.totalRestaurants}`);
      console.log(`  Upserted:    ${summary.totalUpdated}`);
      console.log(`  Failed:      ${summary.totalFailed}`);
      if (summary.errors.length > 0) {
        console.log(`  Errors:`);
        summary.errors.forEach(e => console.log(`    - ${e}`));
      }

      await this.completeJob(jobId, {
        itemsInserted: summary.totalInserted,
        itemsUpdated:  summary.totalUpdated,
        itemsSkipped:  summary.totalSkipped,
        itemsFailed:   summary.totalFailed,
        errorLog:      summary.errors.slice(0, 50), // cap at 50
        durationMs,
      });

    } catch (err) {
      const durationMs = Date.now() - startedAt;
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[JobRunner] Fatal error: ${errMsg}`);

      await this.updateJobStatus(jobId, 'failed', [errMsg], durationMs);
    }
  }

  // ── Job tracking helpers ───────────────────────────────────────────────────

  private async resolveSourceId(sourceName: string): Promise<string> {
    const { data } = await this.supabase
      .from('sources')
      .select('id')
      .eq('name', sourceName)
      .single();
    if (!data?.id) throw new Error(`Source not found: ${sourceName}`);
    return data.id;
  }

  private async createJob(params: {
    sourceId:    string;
    restaurantId?: string;
    jobType:     string;
    batchId:     string;
  }): Promise<string> {
    const { data, error } = await this.supabase
      .from('ingestion_jobs')
      .insert({
        source_id:     params.sourceId,
        restaurant_id: params.restaurantId,
        job_type:      params.jobType,
        batch_id:      params.batchId,
        status:        'pending',
      })
      .select('id')
      .single();

    if (error || !data?.id) throw new Error(`Failed to create job: ${error?.message}`);
    return data.id;
  }

  private async updateJobStatus(
    jobId:      string,
    status:     'pending' | 'running' | 'done' | 'failed',
    errorLog?:  string[],
    durationMs?: number
  ): Promise<void> {
    const update: Record<string, string | string[] | number> = { status };
    if (status === 'running') update.started_at   = new Date().toISOString();
    if (status === 'done' || status === 'failed') {
      update.completed_at = new Date().toISOString();
    }
    if (errorLog)   update.error_log   = errorLog;
    if (durationMs) update.duration_ms = durationMs;

    await this.supabase.from('ingestion_jobs').update(update).eq('id', jobId);
  }

  private async completeJob(jobId: string, stats: {
    itemsInserted: number;
    itemsUpdated:  number;
    itemsSkipped:  number;
    itemsFailed:   number;
    errorLog:      string[];
    durationMs:    number;
  }): Promise<void> {
    await this.supabase.from('ingestion_jobs').update({
      status:         'done',
      completed_at:   new Date().toISOString(),
      items_inserted: stats.itemsInserted,
      items_updated:  stats.itemsUpdated,
      items_skipped:  stats.itemsSkipped,
      items_failed:   stats.itemsFailed,
      error_log:      stats.errorLog,
      duration_ms:    stats.durationMs,
    }).eq('id', jobId);
  }
}
