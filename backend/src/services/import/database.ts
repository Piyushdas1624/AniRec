import db from '../../utils/db';

export class ImportDatabaseService {
    private buffer: any[] = [];
    private flushTimer: NodeJS.Timeout | null = null;
    private lastFlushTime = Date.now();
    private userId: string;
    private revision: number;

    constructor(userId: string, revision: number) {
        this.userId = userId;
        this.revision = revision;
    }

    public enqueue(entry: {
        id: string;
        animeId: number;
        status: string;
        rating: number | null;
        notes: string | null;
        episodesWatched: number;
    }): void {
        this.buffer.push(entry);

        if (this.buffer.length >= 20 || (Date.now() - this.lastFlushTime >= 1000)) {
            this.flush();
        } else if (!this.flushTimer) {
            this.flushTimer = setTimeout(() => this.flush(), 1000);
        }
    }

    public flush(): void {
        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
            this.flushTimer = null;
        }

        if (this.buffer.length === 0) return;

        const entriesToWrite = [...this.buffer];
        this.buffer = [];
        this.lastFlushTime = Date.now();

        try {
            db.transaction(() => {
                for (const entry of entriesToWrite) {
                    db.prepare(`
                        INSERT INTO user_anime (id, user_id, anime_id, status, rating, notes, episodes_watched, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
                        ON CONFLICT(user_id, anime_id) DO UPDATE SET
                            status = excluded.status,
                            rating = COALESCE(excluded.rating, user_anime.rating),
                            notes = COALESCE(excluded.notes, user_anime.notes),
                            episodes_watched = excluded.episodes_watched,
                            updated_at = datetime('now')
                    `).run(
                        entry.id,
                        this.userId,
                        entry.animeId,
                        entry.status,
                        entry.rating,
                        entry.notes,
                        entry.episodesWatched
                    );

                    db.prepare(`
                        INSERT INTO library_sync_log (user_id, revision, anime_id, action)
                        VALUES (?, ?, ?, 'upsert')
                    `).run(
                        this.userId,
                        this.revision,
                        entry.animeId
                    );
                }
            })();
        } catch (err) {
            console.error('ImportDatabaseService: Batch flush failed:', err);
            throw err;
        }
    }

    public shutdown(): void {
        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
            this.flushTimer = null;
        }
        this.flush();
    }
}
