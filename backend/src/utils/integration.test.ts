import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';

// Set environment variables for testing before importing modules
const TEST_DB_PATH = './data/test-integration-recommender.db';
process.env.DB_PATH = TEST_DB_PATH;
process.env.ENCRYPTION_KEY = 'test-secret-key-encryption-integration';
process.env.NODE_ENV = 'test';

import db from './db';
import { encrypt, decrypt } from './crypto';

test('Security E2E Integration Lifecycle Test', async (t) => {
    const adminUserId = 'admin-user-123';
    const guestUserId = 'guest-user-456';
    const legacyGuestUserId = 'guest-legacy-user-333';
    const inviteToken = 'test-invite-token-789';
    const originalAccessToken = 'ya29.a0AcW5O-access-token-999';
    const originalRefreshToken = '1//0gF3-refresh-token-888';
    const projectId = 'rising-fact-p41fc';
    const email = 'admin@example.com';
    const tokenExpiry = Date.now() + 3600000;

    // Seed mock users to satisfy FOREIGN KEY constraints
    db.prepare('DELETE FROM session_guests').run();
    db.prepare('DELETE FROM shared_sessions').run();
    db.prepare('DELETE FROM users').run();

    db.prepare(`
        INSERT INTO users (id, email, username, display_name, password_hash)
        VALUES (?, ?, ?, ?, ?)
    `).run(adminUserId, 'admin@example.com', 'adminuser', 'Admin User', 'dummy-hash');

    db.prepare(`
        INSERT INTO users (id, email, username, display_name, password_hash)
        VALUES (?, ?, ?, ?, ?)
    `).run(guestUserId, 'guest@example.com', 'guestuser', 'Guest User', 'dummy-hash');

    db.prepare(`
        INSERT INTO users (id, email, username, display_name, password_hash)
        VALUES (?, ?, ?, ?, ?)
    `).run(legacyGuestUserId, 'legacy@example.com', 'legacyuser', 'Legacy User', 'dummy-hash');

    await t.test('1. Should store encrypted tokens in the database', () => {
        const sessionId = 'session-uuid-111';
        
        // Encrypt tokens
        const encryptedAccessToken = encrypt(originalAccessToken);
        const encryptedRefreshToken = encrypt(originalRefreshToken);

        // Verify that the encrypted tokens start with version v1: and are not plaintext
        assert.ok(encryptedAccessToken.startsWith('v1:'));
        assert.ok(encryptedRefreshToken.startsWith('v1:'));
        assert.notStrictEqual(encryptedAccessToken, originalAccessToken);
        assert.notStrictEqual(encryptedRefreshToken, originalRefreshToken);

        // Insert into the database
        db.prepare(`
            INSERT INTO shared_sessions (id, admin_user_id, invite_token, access_token, refresh_token, project_id, email, token_expiry)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(sessionId, adminUserId, inviteToken, encryptedAccessToken, encryptedRefreshToken, projectId, email, tokenExpiry);

        // Join as guest
        db.prepare(`
            INSERT INTO session_guests (id, session_id, guest_user_id, is_active)
            VALUES (?, ?, ?, 1)
        `).run('guest-entry-uuid', sessionId, guestUserId);

        // Retrieve raw from DB to confirm it's stored encrypted
        const rawRow = db.prepare('SELECT access_token, refresh_token FROM shared_sessions WHERE id = ?').get(sessionId) as any;
        assert.ok(rawRow.access_token.startsWith('v1:'));
        assert.ok(rawRow.refresh_token.startsWith('v1:'));
    });

    await t.test('2. Should retrieve and decrypt tokens correctly in application flows', () => {
        // Retrieve using the getSharedAntigravityAuth flow
        // Check if user is an active guest and gets decrypted tokens
        const guestEntry = db.prepare(`
            SELECT ss.access_token, ss.project_id
            FROM session_guests sg
            JOIN shared_sessions ss ON ss.id = sg.session_id
            WHERE sg.guest_user_id = ? AND sg.is_active = 1 AND ss.is_active = 1
        `).get(guestUserId) as any;

        assert.ok(guestEntry);
        
        // Perform decryption
        const decryptedAccessToken = decrypt(guestEntry.access_token);
        
        // Verify decrypted values match original input
        assert.strictEqual(decryptedAccessToken, originalAccessToken);
    });

    await t.test('3. Should support backward-compatible decryption for legacy plaintext tokens', () => {
        const legacyPlaintextToken = 'ya29.legacy-plaintext-raw-google-token';
        const legacySessionId = 'session-legacy-222';
        const legacyInviteToken = 'legacy-invite-token-222';

        // Insert legacy plaintext token directly
        db.prepare(`
            INSERT INTO shared_sessions (id, admin_user_id, invite_token, access_token, refresh_token, project_id, email, token_expiry)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(legacySessionId, adminUserId, legacyInviteToken, legacyPlaintextToken, '', projectId, email, tokenExpiry);

        // Join guest
        db.prepare(`
            INSERT INTO session_guests (id, session_id, guest_user_id, is_active)
            VALUES (?, ?, ?, 1)
        `).run('guest-legacy-uuid', legacySessionId, legacyGuestUserId);

        // Fetch through flow
        const guestEntry = db.prepare(`
            SELECT ss.access_token
            FROM session_guests sg
            JOIN shared_sessions ss ON ss.id = sg.session_id
            WHERE sg.guest_user_id = ? AND sg.is_active = 1 AND ss.is_active = 1
        `).get(legacyGuestUserId) as any;

        assert.ok(guestEntry);

        // Decrypt should return legacy plaintext unmodified
        const decryptedToken = decrypt(guestEntry.access_token);
        assert.strictEqual(decryptedToken, legacyPlaintextToken);
    });

    // Cleanup test database file after completion
    t.after(() => {
        db.close();
        try {
            if (fs.existsSync(TEST_DB_PATH)) {
                fs.unlinkSync(TEST_DB_PATH);
            }
            const dbDir = path.dirname(TEST_DB_PATH);
            const walFile = `${TEST_DB_PATH}-wal`;
            const shmFile = `${TEST_DB_PATH}-shm`;
            if (fs.existsSync(walFile)) fs.unlinkSync(walFile);
            if (fs.existsSync(shmFile)) fs.unlinkSync(shmFile);
        } catch (err) {
            console.warn('Could not remove test database files:', err);
        }
    });
});
