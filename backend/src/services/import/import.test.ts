import test from 'node:test';
import assert from 'assert';
import { getImportManager } from './index';
import db from '../../utils/db';

// Insert mock user to satisfy foreign key constraints
db.prepare("INSERT OR IGNORE INTO users (id, email, username, display_name, password_hash) VALUES ('user1', 'user1@test.com', 'user1', 'User One', 'hash')").run();

test('ImportManager - Job Lifecycle & Snaphots', () => {
    const manager = getImportManager();
    const jobId = manager.createJob('user1', 10, 'NORMAL');
    assert.ok(jobId, 'jobId should be defined');

    const job = manager.getJobSnapshot(jobId);
    assert.ok(job, 'should retrieve job snapshot');
    assert.strictEqual(job.status, 'pending', 'initial status should be pending');
    assert.strictEqual(job.priority, 'NORMAL', 'priority should match settings');

    // Immutable snapshot verification
    assert.throws(() => {
        (job as any).status = 'running';
    }, TypeError, 'DTO snapshot should be frozen or read-only');

    // Listeners verification
    let progressFired = false;
    const listener = (snapshot: any) => {
        if (snapshot.jobId === jobId) {
            progressFired = true;
        }
    };
    manager.subscribe(listener);

    // Cancel job
    manager.cancelJob(jobId);
    const cancelledJob = manager.getJobSnapshot(jobId);
    assert.ok(cancelledJob);
    assert.strictEqual(cancelledJob.status, 'cancelling', 'status should be cancelling');

    manager.unsubscribe(listener);
});

test('ImportManager - Status snapshot caching', () => {
    const manager = getImportManager();
    const snapshot1 = manager.getStatusSnapshot('user1');
    const snapshot2 = manager.getStatusSnapshot('user1');
    
    assert.strictEqual(snapshot1.summary.snapshotId, snapshot2.summary.snapshotId, 'subsequent snapshots within 250ms should return cached DTO');
});

test('ImportDatabaseService - Batching and flusher logic', () => {
    const { ResolverCoordinator } = require('./resolver');
    const { ImportDatabaseService } = require('./database');

    // 1. Seed distinct mock anime records
    for (let i = 0; i < 25; i++) {
        db.prepare(`
            INSERT OR IGNORE INTO anime (id, mal_id, title_romaji, title_english, format, episodes)
            VALUES (?, ?, ?, ?, 'TV', 12)
        `).run(9000 + i, 9000 + i, `Test Anime ${i}`, `Test Anime ${i}`);
    }

    // 2. Clear old user_anime and sync log for clean assertion
    db.prepare("DELETE FROM user_anime WHERE user_id = 'user1'").run();
    db.prepare("DELETE FROM library_sync_log WHERE user_id = 'user1'").run();

    const flusher = new ImportDatabaseService('user1', 10);

    // 3. Enqueue 19 items (no flush should happen yet because batch threshold is 20)
    for (let i = 0; i < 19; i++) {
        flusher.enqueue({
            id: `id-${i}`,
            animeId: 9000 + i,
            status: 'watching',
            rating: 8,
            notes: 'good',
            episodesWatched: 5
        });
    }

    // Assert database is still empty
    const countBefore = (db.prepare("SELECT COUNT(*) as count FROM user_anime WHERE user_id = 'user1'").get() as any).count;
    assert.strictEqual(countBefore, 0, 'should not flush before 20 items');

    // 4. Enqueue the 20th item (should trigger auto-flush)
    flusher.enqueue({
        id: 'id-19',
        animeId: 9019,
        status: 'watching',
        rating: 8,
        notes: 'good',
        episodesWatched: 5
    });

    const countAfter = (db.prepare("SELECT COUNT(*) as count FROM user_anime WHERE user_id = 'user1'").get() as any).count;
    assert.strictEqual(countAfter, 20, 'should auto-flush when buffer reaches 20 items');

    // Verify sync logs were created
    const logCount = (db.prepare("SELECT COUNT(*) as count FROM library_sync_log WHERE user_id = 'user1' AND revision = 10").get() as any).count;
    assert.strictEqual(logCount, 20, 'should write sync log entries for all flushed items');

    // 5. Enqueue 1 item and call shutdown (should force flush remaining)
    flusher.enqueue({
        id: 'id-20',
        animeId: 9020,
        status: 'watching',
        rating: 9,
        notes: 'superb',
        episodesWatched: 6
    });

    flusher.shutdown();

    const countFinal = (db.prepare("SELECT COUNT(*) as count FROM user_anime WHERE user_id = 'user1'").get() as any).count;
    assert.strictEqual(countFinal, 21, 'shutdown should flush remaining items in buffer');
});

test('ImportDatabaseService - Time-based flusher trigger', async () => {
    const { ImportDatabaseService } = require('./database');

    db.prepare("DELETE FROM user_anime WHERE user_id = 'user1'").run();
    db.prepare("DELETE FROM library_sync_log WHERE user_id = 'user1'").run();

    const flusher = new ImportDatabaseService('user1', 20);

    // Enqueue 19 items (below 20 threshold)
    for (let i = 0; i < 19; i++) {
        flusher.enqueue({
            id: `timer-id-${i}`,
            animeId: 9000 + i,
            status: 'watching',
            rating: 8,
            notes: 'good',
            episodesWatched: 5
        });
    }

    // Wait 400ms - should not have committed yet
    await new Promise(resolve => setTimeout(resolve, 400));
    const countMid = (db.prepare("SELECT COUNT(*) as count FROM user_anime WHERE user_id = 'user1'").get() as any).count;
    assert.strictEqual(countMid, 0, 'should not commit after 400ms');

    // Wait another 800ms (total 1200ms) - should have committed
    await new Promise(resolve => setTimeout(resolve, 800));
    const countEnd = (db.prepare("SELECT COUNT(*) as count FROM user_anime WHERE user_id = 'user1'").get() as any).count;
    assert.strictEqual(countEnd, 19, 'should commit automatically after 1000ms timer');
});

test('ImportDatabaseService - Size-based flusher trigger (immediate)', () => {
    const { ImportDatabaseService } = require('./database');

    db.prepare("DELETE FROM user_anime WHERE user_id = 'user1'").run();
    db.prepare("DELETE FROM library_sync_log WHERE user_id = 'user1'").run();

    const flusher = new ImportDatabaseService('user1', 30);

    // Enqueue 20 items immediately
    for (let i = 0; i < 20; i++) {
        flusher.enqueue({
            id: `size-id-${i}`,
            animeId: 9000 + i,
            status: 'watching',
            rating: 8,
            notes: 'good',
            episodesWatched: 5
        });
    }

    // Check count immediately without waiting - should be 20
    const countImmediate = (db.prepare("SELECT COUNT(*) as count FROM user_anime WHERE user_id = 'user1'").get() as any).count;
    assert.strictEqual(countImmediate, 20, 'should commit 20 items immediately');
});

test('ResolverCoordinator - AbortSignal cancellation', async () => {
    const { ResolverCoordinator } = require('./resolver');
    const controller = new AbortController();
    controller.abort(); // pre-abort

    await assert.rejects(async () => {
        await ResolverCoordinator.resolveAnime(12345, 'Cancelled Anime', 'TV', 12, controller.signal);
    }, /AbortError/, 'should reject immediately with AbortError if signal is aborted');
});
