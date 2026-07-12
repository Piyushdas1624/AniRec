import db from '../../utils/db';
import { ImportJob } from './types';

export class ImportRepository {
    public static saveJob(job: ImportJob): void {
        db.prepare(`
            INSERT OR REPLACE INTO import_jobs (id, user_id, status, stage, processed, total, error, result_json, started_at, completed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            job.jobId,
            job.userId,
            job.status,
            job.stage,
            job.processed,
            job.total,
            job.errors[0] || null,
            JSON.stringify({
                issues: job.issues,
                warnings: job.warnings,
                statistics: job.statistics
            }),
            new Date(job.startTime).toISOString(),
            job.completedAt ? new Date(job.completedAt).toISOString() : null
        );
    }

    public static saveCheckpoint(jobId: string, processed: number, statistics: any, issues: any[], warnings: any[]): void {
        db.prepare(`
            UPDATE import_jobs
            SET processed = ?, result_json = ?
            WHERE id = ?
        `).run(
            processed,
            JSON.stringify({ statistics, issues, warnings }),
            jobId
        );
    }

    public static getHistory(userId: string, limit: number): any[] {
        const rows = db.prepare(`
            SELECT id, user_id, status, stage, processed, total, error, result_json, started_at, completed_at
            FROM import_jobs
            WHERE user_id = ? AND status IN ('completed', 'failed', 'cancelled', 'abandoned')
            ORDER BY completed_at DESC, started_at DESC
            LIMIT ?
        `).all(userId, limit) as any[];

        return rows.map(row => {
            let meta: any = { statistics: { resolvedAniList: 0, resolvedJikan: 0, skippedAlreadyInList: 0, failedNotFound: 0, failedError: 0 }, issues: [], warnings: [] };
            try {
                if (row.result_json) meta = JSON.parse(row.result_json);
            } catch (e) {}
            return {
                jobId: row.id,
                userId: row.user_id,
                status: row.status,
                stage: row.stage,
                processed: row.processed,
                total: row.total,
                errors: row.error ? [row.error] : [],
                statistics: meta.statistics,
                issues: meta.issues || [],
                warnings: meta.warnings || [],
                startTime: new Date(row.started_at).getTime(),
                completedAt: row.completed_at ? new Date(row.completed_at).getTime() : undefined
            };
        });
    }

    public static deleteOldHistory(userId: string, limit = 50): void {
        db.prepare(`
            DELETE FROM import_jobs
            WHERE user_id = ? AND status IN ('completed', 'failed', 'cancelled', 'abandoned')
            AND id NOT IN (
                SELECT id FROM import_jobs
                WHERE user_id = ? AND status IN ('completed', 'failed', 'cancelled', 'abandoned')
                ORDER BY completed_at DESC, started_at DESC
                LIMIT ?
            )
        `).run(userId, userId, limit);
    }

    public static getLibraryState(userId: string): { version: number; lastUpdated: number } | null {
        const row = db.prepare(`
            SELECT version, last_updated
            FROM library_state
            WHERE user_id = ?
        `).get(userId) as any;

        if (!row) return null;
        return {
            version: row.version,
            lastUpdated: new Date(row.last_updated).getTime()
        };
    }

    public static updateLibraryState(userId: string, version: number): void {
        db.prepare(`
            INSERT OR REPLACE INTO library_state (user_id, version, last_updated)
            VALUES (?, ?, datetime('now'))
        `).run(userId, version);
    }

    public static insertSyncLog(userId: string, version: number, animeId: number, action: 'upsert' | 'delete'): void {
        db.prepare(`
            INSERT INTO library_sync_log (user_id, revision, anime_id, action)
            VALUES (?, ?, ?, ?)
        `).run(userId, version, animeId, action);
    }
}
