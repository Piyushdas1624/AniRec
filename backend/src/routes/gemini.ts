import { Router, Response } from 'express';
import db from '../utils/db';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import {
    extractTagsWithFlash,
    generateRecommendations,
    generateUserMd,
    listGeminiModels,
} from '../services/gemini';
import { v4 as uuidv4 } from 'uuid';
import { getSharedAntigravityAuth } from './admin';

import crypto from 'crypto';

const router = Router();

interface ModelCache {
    list: any[];
    timestamp: number;
    authHash: string;
}

let modelCache: ModelCache | null = null;

// Helper: extract auth credentials from request body (supports API key, user's Antigravity, or shared session)
function getAuthFromBody(body: any, userId?: string): { apiKey: string; antigravityAuth?: { accessToken: string; projectId: string } } {
    // User's own Antigravity auth
    if (body.accessToken) {
        return {
            apiKey: '',
            antigravityAuth: {
                accessToken: body.accessToken,
                projectId: body.projectId || '',
            },
        };
    }
    // User's own API key
    if (body.apiKey) {
        return { apiKey: body.apiKey };
    }
    // Fall back to shared session (if this user is an active guest)
    if (userId) {
        const shared = getSharedAntigravityAuth(userId);
        if (shared) {
            return {
                apiKey: '',
                antigravityAuth: {
                    accessToken: shared.accessToken,
                    projectId: shared.projectId,
                },
            };
        }
    }
    return { apiKey: '' };
}

function hasAuth(body: any, userId?: string): boolean {
    return !!(body.apiKey || body.accessToken || (userId && getSharedAntigravityAuth(userId)));
}

// POST /api/gemini/models - List available Gemini models
router.post('/models', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        let { apiKey, forceRefresh = false } = req.body;
        let accessToken: string | undefined;

        if (!apiKey) {
            const auth = getAuthFromBody(req.body, req.userId);
            if (auth.antigravityAuth?.accessToken) {
                accessToken = auth.antigravityAuth.accessToken;
            } else {
                res.status(400).json({ error: 'API key or active Antigravity session required' });
                return;
            }
        }

        // Generate SHA-256 hash of credential
        const credentialToHash = apiKey || accessToken || '';
        const authHash = crypto.createHash('sha256').update(credentialToHash).digest('hex');

        // Check cache (TTL = 1 hour)
        const cacheTTL = 60 * 60 * 1000;
        if (!forceRefresh && modelCache && modelCache.authHash === authHash && (Date.now() - modelCache.timestamp < cacheTTL)) {
            return res.json({ models: modelCache.list });
        }

        const models = await listGeminiModels(apiKey, accessToken);
        
        // Update cache
        modelCache = {
            list: models,
            timestamp: Date.now(),
            authHash
        };

        res.json({ models });
    } catch (error: any) {
        console.error('List models error:', error);
        res.status(500).json({ error: error.message || 'Failed to list models' });
    }
});

// POST /api/gemini/flash/tags - Extract tags using Gemini Flash
router.post('/flash/tags', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { animeId, model } = req.body;
        if (!hasAuth(req.body, req.userId) || !animeId) {
            res.status(400).json({ error: 'Authentication (apiKey or accessToken) and animeId are required' });
            return;
        }

        const { apiKey, antigravityAuth } = getAuthFromBody(req.body, req.userId);

        const anime = db.prepare('SELECT * FROM anime WHERE id = ?').get(animeId) as any;
        if (!anime) {
            res.status(404).json({ error: 'Anime not found' });
            return;
        }

        // Get user's preferred flash model or use provided/default
        const settings = db.prepare('SELECT flash_model FROM user_settings WHERE user_id = ?').get(req.userId) as any;
        const flashModel = model || settings?.flash_model || 'gemini-3-flash-preview';

        const existingTags = JSON.parse(anime.tags || '[]');
        const result = await extractTagsWithFlash(
            apiKey,
            flashModel,
            anime.title_english || anime.title_romaji,
            anime.synopsis || '',
            existingTags,
            antigravityAuth
        );

        // Store AI tags in database
        db.prepare(`
      UPDATE anime SET ai_tags = ?, ai_blurb = ?, tags_extracted_at = datetime('now')
      WHERE id = ?
    `).run(JSON.stringify(result.normalized_tags), result.short_blurb, animeId);

        res.json({
            animeId,
            ...result,
        });
    } catch (error: any) {
        console.error('Tag extraction error:', error);
        res.status(500).json({ error: error.message || 'Failed to extract tags' });
    }
});

// POST /api/gemini/recommend - Get recommendations using Gemini Pro
router.post('/recommend', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { count = 10, model } = req.body;
        if (!hasAuth(req.body, req.userId)) {
            res.status(400).json({ error: 'Authentication required (apiKey or accessToken)' });
            return;
        }

        const { apiKey, antigravityAuth } = getAuthFromBody(req.body, req.userId);

        // Get user's personalization
        const personalization = db.prepare('SELECT user_md FROM user_personalization WHERE user_id = ?')
            .get(req.userId) as any;
        const userMd = personalization?.user_md || '';

        if (!userMd || userMd.includes('(No ratings yet)')) {
            res.status(400).json({ error: 'Please rate some anime first to get personalized recommendations' });
            return;
        }

        // Get user's preferred pro model or use provided/default
        const settings = db.prepare('SELECT pro_model FROM user_settings WHERE user_id = ?').get(req.userId) as any;
        const proModel = model || settings?.pro_model || 'gemini-3-pro-preview';

        // Get the user's FULL list with statuses (so AI knows what they've seen)
        const userList = db.prepare(`
      SELECT a.title_english, a.title_romaji, ua.status, ua.rating, ua.notes, ua.favorite
      FROM user_anime ua
      JOIN anime a ON a.id = ua.anime_id
      WHERE ua.user_id = ?
      ORDER BY ua.rating DESC NULLS LAST
    `).all(req.userId) as any[];

        const userListSummary = userList.map(u => {
            const title = u.title_english || u.title_romaji;
            const parts = [`"${title}"`];
            if (u.status) parts.push(`[${u.status}]`);
            if (u.rating) parts.push(`${u.rating}/10`);
            if (u.favorite) parts.push('★fav');
            return parts.join(' ');
        }).join('\n');

        // Get candidate anime (popular ones NOT in the user's list at all)
        const candidates = db.prepare(`
      SELECT a.id, a.title_english, a.title_romaji, a.synopsis, a.tags, a.ai_tags,
             a.average_score, a.genres, a.popularity, a.format, a.episodes
      FROM anime a
      WHERE a.id NOT IN (
        SELECT anime_id FROM user_anime WHERE user_id = ?
      )
      ORDER BY a.popularity DESC
      LIMIT 150
    `).all(req.userId) as any[];

        if (candidates.length === 0) {
            res.status(400).json({ error: 'Not enough candidate anime. Try browsing and adding some anime first.' });
            return;
        }

        const candidateData = candidates.map(c => ({
            id: c.id,
            title: c.title_english || c.title_romaji,
            synopsis: c.synopsis || '',
            tags: [...JSON.parse(c.tags || '[]'), ...JSON.parse(c.ai_tags || '[]')],
            score: c.average_score || 0,
        }));

        const result = await generateRecommendations(apiKey, proModel, userMd, candidateData, count, antigravityAuth, userListSummary);

        if (result.recommendations.length > 0) {
            // Enrich with anime details
            const enriched = result.recommendations.map(rec => {
                const anime = db.prepare(`
          SELECT id, title_english, title_romaji, cover_image, genres, tags, ai_tags,
                 average_score, episodes, format, synopsis, anilist_id
          FROM anime WHERE id = ?
        `).get(rec.animeId) as any;

                return {
                    ...rec,
                    anime: anime ? {
                        id: anime.id,
                        anilistId: anime.anilist_id,
                        title: anime.title_english || anime.title_romaji,
                        coverImage: anime.cover_image,
                        genres: JSON.parse(anime.genres || '[]'),
                        tags: JSON.parse(anime.tags || '[]'),
                        aiTags: JSON.parse(anime.ai_tags || '[]'),
                        averageScore: anime.average_score,
                        episodes: anime.episodes,
                        format: anime.format,
                        synopsis: anime.synopsis,
                    } : null,
                };
            }).filter(r => r.anime);

            // Save recommendation history
            const recId = uuidv4();
            db.prepare(`
        INSERT INTO recommendations (id, user_id, anime_ids, explanations, model_used)
        VALUES (?, ?, ?, ?, ?)
      `).run(
                recId,
                req.userId,
                JSON.stringify(enriched.map(r => r.animeId)),
                JSON.stringify(Object.fromEntries(enriched.map(r => [r.animeId, r.explanation]))),
                proModel
            );

            res.json({ recommendations: enriched, id: recId, modelUsed: proModel, listSize: userList.length });
        } else {
            res.json({ recommendations: [] });
        }
    } catch (error: any) {
        console.error('Recommendation error:', error);
        res.status(500).json({ error: error.message || 'Failed to generate recommendations' });
    }
});

// POST /api/gemini/update-user-md - Update user.md via Gemini Flash
// Smart caching: only regenerates if the list has changed since last generation
router.post('/update-user-md', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { model, force = false } = req.body;
        if (!hasAuth(req.body, req.userId)) {
            res.status(400).json({ error: 'Authentication required (apiKey or accessToken)' });
            return;
        }

        const { apiKey, antigravityAuth } = getAuthFromBody(req.body, req.userId);

        // Get user info
        const user = db.prepare('SELECT display_name FROM users WHERE id = ?').get(req.userId) as any;

        // Get ALL user's anime with status and notes (not just rated)
        const allAnime = db.prepare(`
      SELECT a.title_english, a.title_romaji, ua.rating, ua.notes, ua.status,
             ua.favorite, ua.episodes_watched, ua.updated_at
      FROM user_anime ua
      JOIN anime a ON a.id = ua.anime_id
      WHERE ua.user_id = ?
      ORDER BY ua.rating DESC NULLS LAST
    `).all(req.userId) as any[];

        const ratedAnime = allAnime.filter(a => a.rating != null);

        if (ratedAnime.length === 0) {
            res.status(400).json({ error: 'Please rate some anime first' });
            return;
        }

        // Get current user.md and check if regeneration is needed
        const personalization = db.prepare('SELECT user_md, version, updated_at FROM user_personalization WHERE user_id = ?')
            .get(req.userId) as any;

        // Smart skip: check if list changed since last user.md update
        if (!force && personalization?.user_md && personalization.updated_at) {
            const lastUpdate = new Date(personalization.updated_at).getTime();
            const latestListChange = db.prepare(`
          SELECT MAX(updated_at) as latest FROM user_anime WHERE user_id = ?
        `).get(req.userId) as any;

            if (latestListChange?.latest) {
                const listModTime = new Date(latestListChange.latest).getTime();
                if (listModTime <= lastUpdate) {
                    // List hasn't changed — return cached user.md
                    console.log('[user.md] Skipping regeneration — list unchanged since last update');
                    res.json({
                        userMd: personalization.user_md,
                        version: personalization.version,
                        cached: true,
                    });
                    return;
                }
            }
        }

        const settings = db.prepare('SELECT flash_model FROM user_settings WHERE user_id = ?').get(req.userId) as any;
        const flashModel = model || settings?.flash_model || 'gemini-3-flash-preview';

        // Include ALL anime with status info, not just rated
        const formattedRatings = allAnime.map(r => ({
            title: r.title_english || r.title_romaji,
            rating: r.rating,
            notes: r.notes || '',
            status: r.status || 'unknown',
            favorite: !!r.favorite,
            episodesWatched: r.episodes_watched || 0,
        }));

        const newUserMd = await generateUserMd(
            apiKey,
            flashModel,
            req.userId!,
            user.display_name,
            formattedRatings,
            personalization?.user_md || '',
            antigravityAuth
        );

        const newVersion = (personalization?.version || 0) + 1;
        db.prepare(`
      INSERT INTO user_personalization (user_id, user_md, version, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(user_id) DO UPDATE SET user_md = ?, version = ?, updated_at = datetime('now')
    `).run(req.userId, newUserMd, newVersion, newUserMd, newVersion);

        res.json({ userMd: newUserMd, version: newVersion, cached: false });
    } catch (error: any) {
        console.error('Update user.md error:', error);
        res.status(500).json({ error: error.message || 'Failed to update user.md' });
    }
});

// GET /api/gemini/user-md - Get user's personalization file
router.get('/user-md', authMiddleware, (req: AuthRequest, res: Response) => {
    try {
        const personalization = db.prepare('SELECT * FROM user_personalization WHERE user_id = ?')
            .get(req.userId) as any;

        // Also check if regeneration is needed
        const latestListChange = db.prepare(`
      SELECT MAX(updated_at) as latest, COUNT(*) as total FROM user_anime WHERE user_id = ?
    `).get(req.userId) as any;

        const needsUpdate = personalization?.updated_at && latestListChange?.latest
            ? new Date(latestListChange.latest).getTime() > new Date(personalization.updated_at).getTime()
            : false;

        res.json({
            userMd: personalization?.user_md || '',
            version: personalization?.version || 0,
            updatedAt: personalization?.updated_at,
            listSize: latestListChange?.total || 0,
            needsUpdate,
        });
    } catch (error: any) {
        console.error('Get user.md error:', error);
        res.status(500).json({ error: 'Failed to get user.md' });
    }
});

// POST /api/gemini/register-client-key - Register encrypted backup
router.post('/register-client-key', authMiddleware, (req: AuthRequest, res: Response) => {
    try {
        const { encryptedUserMd, metadata } = req.body;

        if (!encryptedUserMd) {
            res.status(400).json({ error: 'encryptedUserMd is required' });
            return;
        }

        const id = uuidv4();
        db.prepare(`
      INSERT INTO encrypted_backups (id, user_id, encrypted_blob, metadata)
      VALUES (?, ?, ?, ?)
    `).run(id, req.userId, encryptedUserMd, JSON.stringify(metadata || {}));

        res.json({ id, status: 'backed_up' });
    } catch (error: any) {
        console.error('Register client key error:', error);
        res.status(500).json({ error: 'Failed to store backup' });
    }
});

// GET /api/gemini/recommendations/history
router.get('/recommendations/history', authMiddleware, (req: AuthRequest, res: Response) => {
    try {
        const history = db.prepare(`
      SELECT * FROM recommendations WHERE user_id = ? ORDER BY created_at DESC LIMIT 20
    `).all(req.userId) as any[];

        const formatted = history.map(h => ({
            id: h.id,
            animeIds: JSON.parse(h.anime_ids),
            explanations: JSON.parse(h.explanations),
            modelUsed: h.model_used,
            createdAt: h.created_at,
        }));

        res.json({ history: formatted });
    } catch (error: any) {
        console.error('Recommendation history error:', error);
        res.status(500).json({ error: 'Failed to get history' });
    }
});

export default router;
