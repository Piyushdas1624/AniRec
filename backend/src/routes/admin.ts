import { Router, Response } from 'express';
import db from '../utils/db';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';
import { encrypt, decrypt } from '../utils/crypto';

const router = Router();

// ─── POST /api/session/share ─────────────────────────────────────────────
// Any authenticated user who has Antigravity tokens can create a shared session.
// Stores their tokens server-side and returns a unique invite link.
router.post('/share', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { accessToken, refreshToken, projectId, email, tokenExpiry } = req.body;
        if (!accessToken || !projectId) {
            res.status(400).json({ error: 'Antigravity accessToken and projectId are required to share' });
            return;
        }

        // Deactivate any previous sessions from this admin
        db.prepare(`UPDATE shared_sessions SET is_active = 0 WHERE admin_user_id = ?`).run(req.userId);

        // Create new session with unique invite token
        const sessionId = uuidv4();
        const inviteToken = uuidv4();

        const encryptedAccessToken = encrypt(accessToken);
        const encryptedRefreshToken = refreshToken ? encrypt(refreshToken) : '';

        db.prepare(`
            INSERT INTO shared_sessions (id, admin_user_id, invite_token, access_token, refresh_token, project_id, email, token_expiry)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(sessionId, req.userId, inviteToken, encryptedAccessToken, encryptedRefreshToken, projectId, email || '', tokenExpiry || 0);

        res.json({
            sessionId,
            inviteToken,
            inviteUrl: `/?invite=${inviteToken}`,
        });
    } catch (error: any) {
        console.error('Share session error:', error);
        res.status(500).json({ error: error.message || 'Failed to create shared session' });
    }
});

// ─── GET /api/session/info ───────────────────────────────────────────────
// Get admin's current active session + list of guests
router.get('/info', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const session = db.prepare(`
            SELECT id, invite_token, email, is_active, created_at
            FROM shared_sessions WHERE admin_user_id = ? AND is_active = 1
        `).get(req.userId) as any;

        if (!session) {
            res.json({ hasSession: false, guests: [] });
            return;
        }

        const guests = db.prepare(`
            SELECT sg.id as guestEntryId, sg.guest_user_id, sg.is_active, sg.joined_at,
                   u.username, u.display_name
            FROM session_guests sg
            JOIN users u ON u.id = sg.guest_user_id
            WHERE sg.session_id = ? AND sg.is_active = 1
            ORDER BY sg.joined_at DESC
        `).all(session.id) as any[];

        res.json({
            hasSession: true,
            inviteToken: session.invite_token,
            inviteUrl: `/?invite=${session.invite_token}`,
            email: session.email,
            createdAt: session.created_at,
            guests: guests.map(g => ({
                guestEntryId: g.guestEntryId,
                userId: g.guest_user_id,
                username: g.username,
                displayName: g.display_name,
                joinedAt: g.joined_at,
            })),
        });
    } catch (error: any) {
        console.error('Session info error:', error);
        res.status(500).json({ error: error.message || 'Failed to get session info' });
    }
});

// ─── POST /api/session/join ──────────────────────────────────────────────
// Guest joins a session via invite token
router.post('/join', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { inviteToken } = req.body;
        if (!inviteToken) {
            res.status(400).json({ error: 'inviteToken is required' });
            return;
        }

        const session = db.prepare(`
            SELECT id, admin_user_id, email FROM shared_sessions
            WHERE invite_token = ? AND is_active = 1
        `).get(inviteToken) as any;

        if (!session) {
            res.status(404).json({ error: 'Invalid or expired invite link' });
            return;
        }

        // Don't let admin join their own session
        if (session.admin_user_id === req.userId) {
            res.status(400).json({ error: 'You cannot join your own session' });
            return;
        }

        // Check if already joined
        const existing = db.prepare(`
            SELECT id, is_active FROM session_guests
            WHERE session_id = ? AND guest_user_id = ?
        `).get(session.id, req.userId) as any;

        if (existing && existing.is_active) {
            // Already joined — just return success
            const admin = db.prepare(`SELECT display_name, username FROM users WHERE id = ?`).get(session.admin_user_id) as any;
            res.json({
                joined: true,
                adminName: admin?.display_name || admin?.username || 'Unknown',
                adminEmail: session.email,
            });
            return;
        }

        if (existing && !existing.is_active) {
            // Was revoked — reactivate
            db.prepare(`UPDATE session_guests SET is_active = 1, joined_at = datetime('now') WHERE id = ?`).run(existing.id);
        } else {
            // New guest
            db.prepare(`
                INSERT INTO session_guests (id, session_id, guest_user_id)
                VALUES (?, ?, ?)
            `).run(uuidv4(), session.id, req.userId);
        }

        const admin = db.prepare(`SELECT display_name, username FROM users WHERE id = ?`).get(session.admin_user_id) as any;

        res.json({
            joined: true,
            adminName: admin?.display_name || admin?.username || 'Unknown',
            adminEmail: session.email,
        });
    } catch (error: any) {
        console.error('Join session error:', error);
        res.status(500).json({ error: error.message || 'Failed to join session' });
    }
});

// ─── POST /api/session/revoke/:guestUserId ───────────────────────────────
// Admin revokes a specific guest's access
router.post('/revoke/:guestUserId', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { guestUserId } = req.params;

        // Verify the admin owns the session
        const session = db.prepare(`
            SELECT id FROM shared_sessions
            WHERE admin_user_id = ? AND is_active = 1
        `).get(req.userId) as any;

        if (!session) {
            res.status(404).json({ error: 'No active session found' });
            return;
        }

        const result = db.prepare(`
            UPDATE session_guests SET is_active = 0
            WHERE session_id = ? AND guest_user_id = ?
        `).run(session.id, guestUserId);

        res.json({ revoked: (result.changes || 0) > 0 });
    } catch (error: any) {
        console.error('Revoke error:', error);
        res.status(500).json({ error: error.message || 'Failed to revoke access' });
    }
});

// ─── DELETE /api/session/stop ────────────────────────────────────────────
// Admin stops sharing entirely (deactivates session + all guests)
router.delete('/stop', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const session = db.prepare(`
            SELECT id FROM shared_sessions
            WHERE admin_user_id = ? AND is_active = 1
        `).get(req.userId) as any;

        if (session) {
            db.prepare(`UPDATE session_guests SET is_active = 0 WHERE session_id = ?`).run(session.id);
            db.prepare(`UPDATE shared_sessions SET is_active = 0 WHERE id = ?`).run(session.id);
        }

        res.json({ stopped: true });
    } catch (error: any) {
        console.error('Stop session error:', error);
        res.status(500).json({ error: error.message || 'Failed to stop session' });
    }
});

// ─── GET /api/session/guest-status ───────────────────────────────────────
// Check if the current user is a guest on someone else's session.
// Returns the admin's name for the banner display.
router.get('/guest-status', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const guestEntry = db.prepare(`
            SELECT sg.session_id, ss.admin_user_id, ss.email as adminEmail
            FROM session_guests sg
            JOIN shared_sessions ss ON ss.id = sg.session_id
            WHERE sg.guest_user_id = ? AND sg.is_active = 1 AND ss.is_active = 1
        `).get(req.userId) as any;

        if (!guestEntry) {
            res.json({ isGuest: false });
            return;
        }

        const admin = db.prepare(`SELECT display_name, username FROM users WHERE id = ?`).get(guestEntry.admin_user_id) as any;

        res.json({
            isGuest: true,
            adminName: admin?.display_name || admin?.username || 'Unknown',
            adminEmail: guestEntry.adminEmail,
        });
    } catch (error: any) {
        console.error('Guest status error:', error);
        res.status(500).json({ error: error.message || 'Failed to check guest status' });
    }
});

// ─── POST /api/session/leave ─────────────────────────────────────────────
// Guest voluntarily leaves (e.g. when they get their own Antigravity auth)
router.post('/leave', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        db.prepare(`
            UPDATE session_guests SET is_active = 0
            WHERE guest_user_id = ? AND is_active = 1
        `).run(req.userId);

        res.json({ left: true });
    } catch (error: any) {
        console.error('Leave session error:', error);
        res.status(500).json({ error: error.message || 'Failed to leave session' });
    }
});

// ─── POST /api/session/update-tokens ─────────────────────────────────────
// Admin updates their stored tokens (e.g. after token refresh)
router.post('/update-tokens', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { accessToken, refreshToken, projectId, tokenExpiry } = req.body;
        if (!accessToken) {
            res.status(400).json({ error: 'accessToken is required' });
            return;
        }

        const encryptedAccessToken = encrypt(accessToken);
        const encryptedRefreshToken = refreshToken ? encrypt(refreshToken) : null;

        const result = db.prepare(`
            UPDATE shared_sessions 
            SET access_token = ?, 
                refresh_token = COALESCE(?, refresh_token),
                project_id = COALESCE(?, project_id),
                token_expiry = COALESCE(?, token_expiry)
            WHERE admin_user_id = ? AND is_active = 1
        `).run(encryptedAccessToken, encryptedRefreshToken, projectId || null, tokenExpiry || null, req.userId);

        res.json({ updated: (result.changes || 0) > 0 });
    } catch (error: any) {
        console.error('Update tokens error:', error);
        res.status(500).json({ error: error.message || 'Failed to update tokens' });
    }
});

// ─── Export: Get shared auth for a specific user ─────────────────────────
// Used by Gemini routes to inject shared tokens for guests
export function getSharedAntigravityAuth(userId: string): { accessToken: string; projectId: string } | null {
    try {
        // Check if user is an active guest
        const guestEntry = db.prepare(`
            SELECT ss.access_token, ss.project_id
            FROM session_guests sg
            JOIN shared_sessions ss ON ss.id = sg.session_id
            WHERE sg.guest_user_id = ? AND sg.is_active = 1 AND ss.is_active = 1
        `).get(userId) as any;

        if (!guestEntry) return null;

        return {
            accessToken: decrypt(guestEntry.access_token),
            projectId: guestEntry.project_id,
        };
    } catch {
        return null;
    }
}

export default router;
