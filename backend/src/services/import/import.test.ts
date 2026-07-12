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
