import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import db from '../utils/db';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// Generate device fingerprint from request
function getDeviceId(req: Request): string {
    const ua = req.headers['user-agent'] || '';
    const ip = req.ip || req.socket.remoteAddress || '';
    // Simple device fingerprint - in production use a proper fingerprinting library
    return Buffer.from(`${ua}-${ip}`).toString('base64').substring(0, 32);
}

// POST /api/auth/signup
router.post('/signup', (req: Request, res: Response) => {
    try {
        const { email, username, displayName, password } = req.body;

        if (!email || !username || !password) {
            res.status(400).json({ error: 'Email, username, and password are required' });
            return;
        }

        if (password.length < 6) {
            res.status(400).json({ error: 'Password must be at least 6 characters' });
            return;
        }

        // Check if email or username already exists
        const existing = db.prepare('SELECT id FROM users WHERE email = ? OR username = ?').get(email.toLowerCase(), username.toLowerCase());
        if (existing) {
            res.status(409).json({ error: 'Email or username already exists' });
            return;
        }

        const id = uuidv4();
        const passwordHash = bcrypt.hashSync(password, 12);
        const deviceId = getDeviceId(req);
        const deviceIds = JSON.stringify([deviceId]);

        db.prepare(`
      INSERT INTO users (id, email, username, display_name, password_hash, device_ids)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, email.toLowerCase(), username.toLowerCase(), displayName || username, passwordHash, deviceIds);

        // Create default settings
        db.prepare(`
      INSERT INTO user_settings (user_id) VALUES (?)
    `).run(id);

        // Create empty personalization
        db.prepare(`
      INSERT INTO user_personalization (user_id, user_md) VALUES (?, ?)
    `).run(id, generateInitialUserMd(id, displayName || username));

        const expiresIn: any = process.env.JWT_EXPIRES_IN || '7d';
        const token = jwt.sign(
            { userId: id, deviceId },
            process.env.JWT_SECRET || 'dev-secret',
            { expiresIn }
        );

        res.status(201).json({
            token,
            user: {
                id,
                email: email.toLowerCase(),
                username: username.toLowerCase(),
                displayName: displayName || username,
            },
        });
    } catch (error: any) {
        console.error('Signup error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/auth/login
router.post('/login', (req: Request, res: Response) => {
    try {
        const { emailOrUsername, password } = req.body;

        if (!emailOrUsername || !password) {
            res.status(400).json({ error: 'Email/username and password are required' });
            return;
        }

        const user = db.prepare(`
      SELECT id, email, username, display_name, password_hash, device_ids 
      FROM users 
      WHERE email = ? OR username = ?
    `).get(emailOrUsername.toLowerCase(), emailOrUsername.toLowerCase()) as any;

        if (!user || !bcrypt.compareSync(password, user.password_hash)) {
            res.status(401).json({ error: 'Invalid credentials' });
            return;
        }

        const deviceId = getDeviceId(req);

        // Add device ID if new
        let deviceIds: string[] = JSON.parse(user.device_ids || '[]');
        if (!deviceIds.includes(deviceId)) {
            deviceIds.push(deviceId);
            db.prepare('UPDATE users SET device_ids = ? WHERE id = ?').run(JSON.stringify(deviceIds), user.id);
        }

        const expiresIn: any = process.env.JWT_EXPIRES_IN || '7d';
        const token = jwt.sign(
            { userId: user.id, deviceId },
            process.env.JWT_SECRET || 'dev-secret',
            { expiresIn }
        );

        res.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                username: user.username,
                displayName: user.display_name,
            },
        });
    } catch (error: any) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/auth/me
router.get('/me', authMiddleware, (req: AuthRequest, res: Response) => {
    try {
        const user = db.prepare(`
      SELECT u.id, u.email, u.username, u.display_name, u.created_at,
             s.pro_model, s.flash_model, s.theme
      FROM users u
      LEFT JOIN user_settings s ON s.user_id = u.id
      WHERE u.id = ?
    `).get(req.userId) as any;

        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        res.json({
            user: {
                id: user.id,
                email: user.email,
                username: user.username,
                displayName: user.display_name,
                createdAt: user.created_at,
                settings: {
                    proModel: user.pro_model,
                    flashModel: user.flash_model,
                    theme: user.theme,
                },
            },
        });
    } catch (error: any) {
        console.error('Me error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// PUT /api/auth/settings
router.put('/settings', authMiddleware, (req: AuthRequest, res: Response) => {
    try {
        const { proModel, flashModel, theme } = req.body;

        const updates: string[] = [];
        const values: any[] = [];

        if (proModel) { updates.push('pro_model = ?'); values.push(proModel); }
        if (flashModel) { updates.push('flash_model = ?'); values.push(flashModel); }
        if (theme) { updates.push('theme = ?'); values.push(theme); }

        if (updates.length > 0) {
            updates.push("updated_at = datetime('now')");
            values.push(req.userId);
            db.prepare(`UPDATE user_settings SET ${updates.join(', ')} WHERE user_id = ?`).run(...values);
        }

        res.json({ success: true });
    } catch (error: any) {
        console.error('Settings error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

function generateInitialUserMd(userId: string, displayName: string): string {
    return `---
user_id: ${userId}
created_at: ${new Date().toISOString()}
---
# profile
display_name: ${displayName}
preferences: []

# ratings_summary
(No ratings yet)

# favorite_tags
(No tags yet)

# notes_highlights
(No notes yet)

# explicit_preferences
(No preferences set yet)
`;
}

// DELETE /api/auth/account - Delete user account and all data
router.delete('/account', authMiddleware, (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId;

        // Delete in correct order to respect foreign keys
        db.prepare('DELETE FROM user_anime WHERE user_id = ?').run(userId);
        db.prepare('DELETE FROM user_settings WHERE user_id = ?').run(userId);
        db.prepare('DELETE FROM user_personalization WHERE user_id = ?').run(userId);
        db.prepare('DELETE FROM users WHERE id = ?').run(userId);

        res.json({ success: true, message: 'Account deleted successfully' });
    } catch (error: any) {
        console.error('Delete account error:', error);
        res.status(500).json({ error: 'Failed to delete account' });
    }
});

export default router;
