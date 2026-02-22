import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../utils/db';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { searchAnime, getAnimeById, getTrendingAnime, getPopularAnime, getSeasonalAnime, formatAniListDate } from '../services/anilist';
import { searchAnimeJikan, getTopAnimeJikan } from '../services/jikan';
import { getTrendingAnimeKitsu, getPopularAnimeKitsu } from '../services/kitsu';

const router = Router();

// Helper to upsert anime from AniList data
function upsertAnimeFromAniList(media: any): number {
    const existing = db.prepare('SELECT id FROM anime WHERE anilist_id = ?').get(media.id) as any;

    const genres = JSON.stringify(media.genres || []);
    const tags = JSON.stringify((media.tags || []).map((t: any) => t.name));
    const studios = JSON.stringify((media.studios?.nodes || []).map((s: any) => s.name));

    if (existing) {
        db.prepare(`
      UPDATE anime SET
        mal_id = ?, title_romaji = ?, title_english = ?, title_native = ?,
        synopsis = ?, cover_image = ?, banner_image = ?, genres = ?, tags = ?,
        episodes = ?, status = ?, season = ?, season_year = ?,
        average_score = ?, popularity = ?, source = ?, studios = ?,
        format = ?, start_date = ?, end_date = ?, is_adult = ?,
        fetched_at = datetime('now')
      WHERE anilist_id = ?
    `).run(
            media.idMal, media.title.romaji, media.title.english, media.title.native,
            media.description, media.coverImage?.extraLarge || media.coverImage?.large,
            media.bannerImage, genres, tags,
            media.episodes, media.status, media.season, media.seasonYear,
            media.averageScore, media.popularity, media.source, studios,
            media.format, formatAniListDate(media.startDate), formatAniListDate(media.endDate),
            media.isAdult ? 1 : 0, media.id
        );
        return existing.id;
    } else {
        const result = db.prepare(`
      INSERT INTO anime (
        anilist_id, mal_id, title_romaji, title_english, title_native,
        synopsis, cover_image, banner_image, genres, tags,
        episodes, status, season, season_year,
        average_score, popularity, source, studios,
        format, start_date, end_date, is_adult
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
            media.id, media.idMal, media.title.romaji, media.title.english, media.title.native,
            media.description, media.coverImage?.extraLarge || media.coverImage?.large,
            media.bannerImage, genres, tags,
            media.episodes, media.status, media.season, media.seasonYear,
            media.averageScore, media.popularity, media.source, studios,
            media.format, formatAniListDate(media.startDate), formatAniListDate(media.endDate),
            media.isAdult ? 1 : 0
        );
        return Number(result.lastInsertRowid);
    }
}

// Normalize Jikan item to our response format (for fallback)
function normalizeJikanToResponse(j: any) {
    return {
        id: 0,
        malId: j.mal_id,
        title: j.title_english || j.title,
        titleRomaji: j.title,
        synopsis: j.synopsis,
        coverImage: j.images?.jpg?.large_image_url || j.images?.jpg?.image_url,
        bannerImage: null,
        genres: (j.genres || []).map((g: any) => g.name),
        episodes: j.episodes,
        status: j.status,
        averageScore: j.score ? j.score * 10 : null,
        format: j.type,
        seasonYear: j.year,
    };
}

// =====================================================
// LIST ROUTES — MUST come BEFORE /:id to avoid conflicts
// =====================================================

// POST /api/anime/list/add
router.post('/list/add', authMiddleware, (req: AuthRequest, res: Response) => {
    try {
        const { animeId, status = 'planning' } = req.body;

        if (!animeId) {
            res.status(400).json({ error: 'animeId is required' });
            return;
        }

        const existing = db.prepare('SELECT id FROM user_anime WHERE user_id = ? AND anime_id = ?')
            .get(req.userId, animeId) as any;

        if (existing) {
            res.status(409).json({ error: 'Anime already in your list' });
            return;
        }

        const id = uuidv4();
        db.prepare(`
      INSERT INTO user_anime (id, user_id, anime_id, status) VALUES (?, ?, ?, ?)
    `).run(id, req.userId, animeId, status);

        res.status(201).json({ id, animeId, status, entry: { id, status } });
    } catch (error: any) {
        console.error('Add to list error:', error);
        res.status(500).json({ error: 'Failed to add anime to list' });
    }
});

// GET /api/anime/list/my
router.get('/list/my', authMiddleware, (req: AuthRequest, res: Response) => {
    try {
        const list = db.prepare(`
      SELECT ua.*, a.title_romaji, a.title_english, a.cover_image, a.genres, a.tags,
             a.ai_tags, a.episodes, a.status as anime_status, a.average_score,
             a.synopsis, a.format, a.season_year, a.anilist_id, a.banner_image, a.mal_id
      FROM user_anime ua
      JOIN anime a ON a.id = ua.anime_id
      WHERE ua.user_id = ?
      ORDER BY ua.updated_at DESC
    `).all(req.userId) as any[];

        const formattedList = list.map(item => ({
            id: item.id,
            animeId: item.anime_id,
            anilistId: item.anilist_id,
            malId: item.mal_id,
            title: item.title_english || item.title_romaji,
            titleRomaji: item.title_romaji,
            coverImage: item.cover_image,
            bannerImage: item.banner_image,
            synopsis: item.synopsis,
            genres: JSON.parse(item.genres || '[]'),
            tags: JSON.parse(item.tags || '[]'),
            aiTags: JSON.parse(item.ai_tags || '[]'),
            episodes: item.episodes,
            animeStatus: item.anime_status,
            averageScore: item.average_score,
            format: item.format,
            seasonYear: item.season_year,
            // User-specific
            status: item.status,
            rating: item.rating,
            notes: item.notes,
            favorite: item.favorite === 1,
            episodesWatched: item.episodes_watched,
            addedAt: item.added_at,
            updatedAt: item.updated_at,
        }));

        res.json({ list: formattedList });
    } catch (error: any) {
        console.error('Get list error:', error);
        res.status(500).json({ error: 'Failed to get anime list' });
    }
});

// PUT /api/anime/list/:id
router.put('/list/:id', authMiddleware, (req: AuthRequest, res: Response) => {
    try {
        const { rating, notes, status, favorite, episodesWatched, startDate, endDate, tags } = req.body;
        const entryId = req.params.id as string;

        const existing = db.prepare('SELECT id FROM user_anime WHERE id = ? AND user_id = ?')
            .get(entryId, req.userId) as any;

        if (!existing) {
            res.status(404).json({ error: 'Anime not found in your list' });
            return;
        }

        const updates: string[] = [];
        const values: any[] = [];

        if (rating !== undefined) { updates.push('rating = ?'); values.push(rating); }
        if (notes !== undefined) { updates.push('notes = ?'); values.push(notes); }
        if (status !== undefined) { updates.push('status = ?'); values.push(status); }
        if (favorite !== undefined) { updates.push('favorite = ?'); values.push(favorite ? 1 : 0); }
        if (episodesWatched !== undefined) { updates.push('episodes_watched = ?'); values.push(episodesWatched); }
        if (startDate !== undefined) { updates.push('start_date = ?'); values.push(startDate); }
        if (endDate !== undefined) { updates.push('end_date = ?'); values.push(endDate); }
        if (tags !== undefined) { updates.push('tags = ?'); values.push(JSON.stringify(tags)); }

        if (updates.length > 0) {
            updates.push("updated_at = datetime('now')");
            values.push(entryId);
            db.prepare(`UPDATE user_anime SET ${updates.join(', ')} WHERE id = ?`).run(...values);
        }

        res.json({ success: true });
    } catch (error: any) {
        console.error('Update list error:', error);
        res.status(500).json({ error: 'Failed to update anime' });
    }
});

// DELETE /api/anime/list — Delete ENTIRE list (no :id param!)
// MUST be before DELETE /list/:id so "/list" doesn't match ":id"
router.delete('/list', authMiddleware, (req: AuthRequest, res: Response) => {
    // Extra check: if there's no additional path, this is "delete all"
    try {
        const result = db.prepare('DELETE FROM user_anime WHERE user_id = ?').run(req.userId);
        console.log(`Deleted ${result.changes} anime entries for user ${req.userId}`);
        res.json({ success: true, deleted: result.changes });
    } catch (error: any) {
        console.error('Delete list error:', error);
        res.status(500).json({ error: 'Failed to delete list' });
    }
});

// DELETE /api/anime/list/:id — Delete a single entry
router.delete('/list/:id', authMiddleware, (req: AuthRequest, res: Response) => {
    try {
        const result = db.prepare('DELETE FROM user_anime WHERE id = ? AND user_id = ?')
            .run(req.params.id, req.userId);

        if (result.changes === 0) {
            res.status(404).json({ error: 'Anime not found in your list' });
            return;
        }

        res.json({ success: true });
    } catch (error: any) {
        console.error('Delete from list error:', error);
        res.status(500).json({ error: 'Failed to remove anime' });
    }
});

// =====================================================
// SEARCH / DISCOVERY ROUTES
// =====================================================

// GET /api/anime/search?q=...&page=1
router.get('/search', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const query = req.query.q as string;
        const page = parseInt(req.query.page as string) || 1;

        if (!query) {
            res.status(400).json({ error: 'Search query required' });
            return;
        }

        try {
            const result = await searchAnime(query, page);
            const anime = result.media.map(media => {
                const dbId = upsertAnimeFromAniList(media);
                return {
                    id: dbId,
                    anilistId: media.id,
                    malId: media.idMal,
                    title: media.title.english || media.title.romaji,
                    titleRomaji: media.title.romaji,
                    synopsis: media.description,
                    coverImage: media.coverImage?.extraLarge || media.coverImage?.large,
                    bannerImage: media.bannerImage,
                    genres: media.genres,
                    tags: (media.tags || []).map((t: any) => t.name),
                    episodes: media.episodes,
                    status: media.status,
                    averageScore: media.averageScore,
                    format: media.format,
                    seasonYear: media.seasonYear,
                };
            });

            res.json({ anime, hasNextPage: result.hasNextPage });
        } catch (anilistError) {
            console.warn('AniList failed for search, falling back to Jikan:', anilistError);
            try {
                const result = await searchAnimeJikan(query, page);
                const anime = result.data.map(normalizeJikanToResponse);
                res.json({ anime, hasNextPage: result.hasNextPage });
            } catch (jikanError) {
                console.warn('Jikan also failed, search unavailable');
                res.status(500).json({ error: 'All anime APIs are currently unavailable' });
            }
        }
    } catch (error: any) {
        console.error('Search error:', error);
        res.status(500).json({ error: 'Failed to search anime' });
    }
});

// GET /api/anime/trending
router.get('/trending', authMiddleware, async (_req: AuthRequest, res: Response) => {
    try {
        const result = await getTrendingAnime(1, 20);
        const anime = result.media.map(media => {
            const dbId = upsertAnimeFromAniList(media);
            return {
                id: dbId,
                anilistId: media.id,
                malId: media.idMal,
                title: media.title.english || media.title.romaji,
                titleRomaji: media.title.romaji,
                synopsis: media.description,
                coverImage: media.coverImage?.extraLarge || media.coverImage?.large,
                bannerImage: media.bannerImage,
                genres: media.genres,
                episodes: media.episodes,
                status: media.status,
                averageScore: media.averageScore,
                format: media.format,
            };
        });
        res.json({ anime });
    } catch (anilistError: any) {
        console.warn('AniList trending failed, trying Jikan:', anilistError.message);
        try {
            const result = await getTopAnimeJikan(1, 'airing');
            const anime = result.data.map(normalizeJikanToResponse);
            res.json({ anime });
        } catch (jikanError: any) {
            console.warn('Jikan trending failed, trying Kitsu:', jikanError.message);
            try {
                const kitsuAnime = await getTrendingAnimeKitsu(20);
                res.json({ anime: kitsuAnime });
            } catch (kitsuError: any) {
                console.error('All trending sources failed');
                res.status(500).json({ error: 'Failed to fetch trending anime' });
            }
        }
    }
});

// GET /api/anime/popular
router.get('/popular', authMiddleware, async (_req: AuthRequest, res: Response) => {
    try {
        const result = await getPopularAnime(1, 20);
        const anime = result.media.map(media => {
            const dbId = upsertAnimeFromAniList(media);
            return {
                id: dbId,
                anilistId: media.id,
                malId: media.idMal,
                title: media.title.english || media.title.romaji,
                titleRomaji: media.title.romaji,
                synopsis: media.description,
                coverImage: media.coverImage?.extraLarge || media.coverImage?.large,
                bannerImage: media.bannerImage,
                genres: media.genres,
                episodes: media.episodes,
                status: media.status,
                averageScore: media.averageScore,
                format: media.format,
            };
        });
        res.json({ anime });
    } catch (anilistError: any) {
        console.warn('AniList popular failed, trying Jikan:', anilistError.message);
        try {
            const result = await getTopAnimeJikan(1, 'bypopularity');
            const anime = result.data.map(normalizeJikanToResponse);
            res.json({ anime });
        } catch (jikanError: any) {
            console.warn('Jikan popular failed, trying Kitsu:', jikanError.message);
            try {
                const kitsuAnime = await getPopularAnimeKitsu(20);
                res.json({ anime: kitsuAnime });
            } catch (kitsuError: any) {
                console.error('All popular sources failed');
                res.status(500).json({ error: 'Failed to fetch popular anime' });
            }
        }
    }
});

// GET /api/anime/seasonal?season=WINTER&year=2025
router.get('/seasonal', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const season = (req.query.season as string) || 'WINTER';
        const year = parseInt(req.query.year as string) || new Date().getFullYear();
        const result = await getSeasonalAnime(season, year);
        const anime = result.media.map(media => {
            const dbId = upsertAnimeFromAniList(media);
            return {
                id: dbId,
                anilistId: media.id,
                malId: media.idMal,
                title: media.title.english || media.title.romaji,
                titleRomaji: media.title.romaji,
                synopsis: media.description,
                coverImage: media.coverImage?.extraLarge || media.coverImage?.large,
                bannerImage: media.bannerImage,
                genres: media.genres,
                episodes: media.episodes,
                status: media.status,
                averageScore: media.averageScore,
                format: media.format,
                season: media.season,
                seasonYear: media.seasonYear,
            };
        });
        res.json({ anime, hasNextPage: result.hasNextPage });
    } catch (error: any) {
        console.error('Seasonal error:', error);
        res.status(500).json({ error: 'Failed to fetch seasonal anime' });
    }
});

// =====================================================
// SINGLE ANIME DETAIL — MUST be LAST (catches everything)
// =====================================================

// GET /api/anime/:id
router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const idParam = req.params.id as string;
        let animeToReturn: any = null;
        let anilistData: any = null;
        let listEntry: any = null;
        let dbId: number | null = null;

        // Check if it's a local DB ID
        const animeFromDb = db.prepare('SELECT * FROM anime WHERE id = ?').get(idParam) as any;

        if (animeFromDb) {
            dbId = animeFromDb.id;
            animeToReturn = {
                ...animeFromDb,
                genres: JSON.parse(animeFromDb.genres || '[]'),
                tags: JSON.parse(animeFromDb.tags || '[]'),
                ai_tags: JSON.parse(animeFromDb.ai_tags || '[]'),
                studios: JSON.parse(animeFromDb.studios || '[]'),
            };
            // Try to get relations from AniList
            if (animeFromDb.anilist_id) {
                try {
                    anilistData = await getAnimeById(animeFromDb.anilist_id);
                    // Also update the DB record with fresh data
                    if (anilistData) {
                        upsertAnimeFromAniList(anilistData);
                        // Re-read the updated record
                        const fresh = db.prepare('SELECT * FROM anime WHERE id = ?').get(dbId) as any;
                        if (fresh) {
                            animeToReturn = {
                                ...fresh,
                                genres: JSON.parse(fresh.genres || '[]'),
                                tags: JSON.parse(fresh.tags || '[]'),
                                ai_tags: JSON.parse(fresh.ai_tags || '[]'),
                                studios: JSON.parse(fresh.studios || '[]'),
                            };
                        }
                    }
                } catch (e) {
                    // Relations just won't load, that's ok
                }
            }
        } else {
            // Might be an AniList ID
            const numericId = parseInt(idParam);
            if (!isNaN(numericId)) {
                try {
                    anilistData = await getAnimeById(numericId);
                    if (anilistData) {
                        dbId = upsertAnimeFromAniList(anilistData);
                        const freshDb = db.prepare('SELECT * FROM anime WHERE id = ?').get(dbId) as any;
                        if (freshDb) {
                            animeToReturn = {
                                ...freshDb,
                                genres: JSON.parse(freshDb.genres || '[]'),
                                tags: JSON.parse(freshDb.tags || '[]'),
                                ai_tags: JSON.parse(freshDb.ai_tags || '[]'),
                                studios: JSON.parse(freshDb.studios || '[]'),
                            };
                        }
                    }
                } catch {
                    // Not found via AniList either
                }
            }
        }

        if (!animeToReturn) {
            res.status(404).json({ error: 'Anime not found' });
            return;
        }

        // Check user's list entry
        if (dbId) {
            const userEntry = db.prepare('SELECT * FROM user_anime WHERE user_id = ? AND anime_id = ?').get(req.userId, dbId) as any;
            if (userEntry) {
                listEntry = {
                    id: userEntry.id,
                    status: userEntry.status,
                    rating: userEntry.rating,
                    notes: userEntry.notes,
                    episodesWatched: userEntry.episodes_watched,
                    favorite: userEntry.favorite === 1,
                    startDate: userEntry.start_date,
                    endDate: userEntry.end_date,
                    tags: userEntry.tags ? JSON.parse(userEntry.tags) : [],
                };
            }
        }

        // Parse relations from AniList data
        const relations: any[] = [];
        if (anilistData?.relations?.edges) {
            for (const edge of anilistData.relations.edges) {
                if (edge.node?.type === 'ANIME') {
                    relations.push({
                        id: edge.node.id,
                        malId: edge.node.idMal,
                        title: edge.node.title?.english || edge.node.title?.romaji,
                        relationType: edge.relationType,
                        coverImage: edge.node.coverImage?.large,
                        format: edge.node.format,
                        status: edge.node.status,
                        episodes: edge.node.episodes,
                        averageScore: edge.node.averageScore,
                    });
                }
            }
        }

        res.json({
            anime: {
                ...animeToReturn,
                relations,
            },
            listEntry,
        });
    } catch (error: any) {
        console.error('Get anime error:', error);
        res.status(500).json({ error: 'Failed to get anime' });
    }
});

export default router;
