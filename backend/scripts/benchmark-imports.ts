import Database from 'better-sqlite3';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// Setup file-based DB for the benchmark to simulate real disk I/O
const tempDbPath = path.join(__dirname, 'temp-benchmark.db');
if (fs.existsSync(tempDbPath)) {
    fs.unlinkSync(tempDbPath);
}

const db = new Database(tempDbPath);

// Setup schemas
db.exec(`
    CREATE TABLE IF NOT EXISTS anime (
        id INTEGER PRIMARY KEY,
        title TEXT
    );
    CREATE TABLE IF NOT EXISTS user_anime (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        anime_id INTEGER,
        status TEXT,
        rating INTEGER,
        notes TEXT,
        episodes_watched INTEGER
    );
`);

// Seed 500 anime metadata entries
console.log('Seeding 500 anime entries...');
const insertAnime = db.prepare('INSERT INTO anime (id, title) VALUES (?, ?)');
const seedTransaction = db.transaction(() => {
    for (let i = 1; i <= 500; i++) {
        insertAnime.run(i, `Anime Title #${i}`);
    }
});
seedTransaction();

// Prepare 500 user_anime entries for import
const userId = 'user-bench-123';
const mockEntries: any[] = [];
for (let i = 1; i <= 500; i++) {
    mockEntries.push({
        id: crypto.randomUUID(),
        userId,
        animeId: i,
        status: 'completed',
        rating: 8,
        notes: `Enjoyed watching episode #${i}`,
        progress: 12
    });
}

console.log('\n--- Running SQLite Import Benchmark (500 Records on Disk) ---');

// 1. Benchmark WITHOUT a transaction (default auto-commit)
console.log('Running WITHOUT transaction (auto-commit, flushing to disk 500 times)...');
db.exec('DELETE FROM user_anime');

const startWithout = performance.now();
for (const entry of mockEntries) {
    db.prepare(`
        INSERT INTO user_anime (id, user_id, anime_id, status, rating, notes, episodes_watched)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(entry.id, entry.userId, entry.animeId, entry.status, entry.rating, entry.notes, entry.progress);
}
const endWithout = performance.now();
const timeWithoutMs = endWithout - startWithout;
console.log(`⏱️  Time WITHOUT transaction: ${(timeWithoutMs / 1000).toFixed(4)} seconds (${timeWithoutMs.toFixed(1)} ms)`);

// 2. Benchmark WITH a transaction
console.log('\nRunning WITH transaction (one disk commit)...');
db.exec('DELETE FROM user_anime');

const startWith = performance.now();
const runTransaction = db.transaction((entries: any[]) => {
    for (const entry of entries) {
        db.prepare(`
            INSERT INTO user_anime (id, user_id, anime_id, status, rating, notes, episodes_watched)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(entry.id, entry.userId, entry.animeId, entry.status, entry.rating, entry.notes, entry.progress);
    }
});
runTransaction(mockEntries);
const endWith = performance.now();
const timeWithMs = endWith - startWith;
console.log(`⏱️  Time WITH transaction: ${(timeWithMs / 1000).toFixed(4)} seconds (${timeWithMs.toFixed(1)} ms)`);

// Output results
const speedup = timeWithoutMs / timeWithMs;
console.log('\n--- Benchmark Result Summary ---');
console.log(`⚡ Speedup: ${speedup.toFixed(1)}x faster`);
console.log(`🚀 Transaction import is ${(100 - (timeWithMs / timeWithoutMs * 100)).toFixed(1)}% more efficient.`);

// Cleanup
db.close();
if (fs.existsSync(tempDbPath)) {
    fs.unlinkSync(tempDbPath);
}
