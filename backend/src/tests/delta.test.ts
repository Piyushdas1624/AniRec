import test from 'node:test';
import assert from 'assert';
import db from '../utils/db';

test('Library Delta Sync Keyset Pagination Logic', () => {
    // 1. Seed user and mock anime records
    db.prepare("INSERT OR IGNORE INTO users (id, email, username, display_name, password_hash) VALUES ('user-delta', 'delta@test.com', 'user-delta', 'User Delta', 'hash')").run();
    
    for (let i = 0; i < 50; i++) {
        db.prepare(`
            INSERT OR IGNORE INTO anime (id, mal_id, title_romaji, title_english, format, episodes)
            VALUES (?, ?, ?, ?, 'TV', 12)
        `).run(20000 + i, 20000 + i, `Delta Anime ${i}`, `Delta Anime ${i}`);
    }

    // 2. Clear old logs
    db.prepare("DELETE FROM library_sync_log WHERE user_id = 'user-delta'").run();
    db.prepare("DELETE FROM user_anime WHERE user_id = 'user-delta'").run();

    // 3. Insert mock sync log changes sequentially
    for (let i = 0; i < 25; i++) {
        db.prepare(`
            INSERT INTO library_sync_log (user_id, revision, anime_id, action)
            VALUES ('user-delta', 1, ?, 'upsert')
        `).run(20000 + i);
    }

    // 4. Assert keyset pagination limit = 10
    const limit1 = 10;
    const logs1 = db.prepare(`
        SELECT l.sequence, l.anime_id, l.action
        FROM library_sync_log l
        WHERE l.user_id = 'user-delta' AND l.sequence > 0
        ORDER BY l.sequence ASC
        LIMIT ?
    `).all(limit1) as any[];

    assert.strictEqual(logs1.length, 10, 'first page should contain exactly 10 logs');
    const firstPageLastSeq = logs1[logs1.length - 1].sequence;

    // 5. Query second page since sequence of last page item
    const limit2 = 10;
    const logs2 = db.prepare(`
        SELECT l.sequence, l.anime_id, l.action
        FROM library_sync_log l
        WHERE l.user_id = 'user-delta' AND l.sequence > ?
        ORDER BY l.sequence ASC
        LIMIT ?
    `).all(firstPageLastSeq, limit2) as any[];

    assert.strictEqual(logs2.length, 10, 'second page should contain exactly 10 logs');
    assert.ok(logs2[0].sequence > firstPageLastSeq, 'second page items should have sequence > firstPageLastSeq');
    const secondPageLastSeq = logs2[logs2.length - 1].sequence;

    // 6. Query third page since secondPageLastSeq (should only return remaining 5 logs)
    const limit3 = 10;
    const logs3 = db.prepare(`
        SELECT l.sequence, l.anime_id, l.action
        FROM library_sync_log l
        WHERE l.user_id = 'user-delta' AND l.sequence > ?
        ORDER BY l.sequence ASC
        LIMIT ?
    `).all(secondPageLastSeq, limit3) as any[];

    assert.strictEqual(logs3.length, 5, 'third page should contain remaining 5 logs');
    assert.ok(logs3[0].sequence > secondPageLastSeq, 'third page items should have sequence > secondPageLastSeq');
});
