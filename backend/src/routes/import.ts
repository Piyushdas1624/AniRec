import { Router, Response } from 'express';
import multer from 'multer';
import zlib from 'zlib';
import { v4 as uuidv4 } from 'uuid';
import db from '../utils/db';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { searchAnime, getAnimeById, getAnimeByMalId, getAnimeByIds } from '../services/anilist';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// MAL status mapping
const MAL_STATUS_MAP: Record<string, string> = {
    'Watching': 'watching',
    'Completed': 'completed',
    'On-Hold': 'paused',
    'Dropped': 'dropped',
    'Plan to Watch': 'planning',
    'Plan to Read': 'planning',
};

// Simple XML parser for MAL format (no external dependency needed)
function parseMALXml(xmlString: string): {
    entries: {
        malId: number;
        title: string;
        type: string;
        episodes: number;
        watchedEpisodes: number;
        score: number;
        status: string;
        comments: string;
        tags: string;
        startDate: string;
        finishDate: string;
    }[];
    userInfo: { username: string; totalAnime: number };
} {
    const entries: any[] = [];
    let userInfo = { username: '', totalAnime: 0 };

    // Parse user info
    const usernameMatch = xmlString.match(/<user_name>(.*?)<\/user_name>/);
    const totalMatch = xmlString.match(/<user_total_anime>(.*?)<\/user_total_anime>/);
    if (usernameMatch) userInfo.username = usernameMatch[1];
    if (totalMatch) userInfo.totalAnime = parseInt(totalMatch[1]) || 0;

    // Parse anime entries
    const animeRegex = /<anime>([\s\S]*?)<\/anime>/g;
    let match;
    while ((match = animeRegex.exec(xmlString)) !== null) {
        const block = match[1];
        const get = (tag: string) => {
            const m = block.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?(.*?)(?:\\]\\]>)?<\\/${tag}>`));
            return m ? m[1].trim() : '';
        };
        entries.push({
            malId: parseInt(get('series_animedb_id')) || 0,
            title: get('series_title'),
            type: get('series_type'),
            episodes: parseInt(get('series_episodes')) || 0,
            watchedEpisodes: parseInt(get('my_watched_episodes')) || 0,
            score: parseInt(get('my_score')) || 0,
            status: MAL_STATUS_MAP[get('my_status')] || 'planning',
            comments: get('my_comments'),
            tags: get('my_tags'),
            startDate: get('my_start_date'),
            finishDate: get('my_finish_date'),
        });
    }

    return { entries, userInfo };
}

// AniList raw export numeric status mapping
const ANILIST_RAW_STATUS_MAP: Record<number, string> = {
    0: 'watching',    // CURRENT
    1: 'planning',    // PLANNING
    2: 'completed',   // COMPLETED
    3: 'dropped',     // DROPPED
    4: 'paused',      // PAUSED
    5: 'rewatching',  // REPEATING
};

// AniList GraphQL status mapping
const ANILIST_GQL_STATUS_MAP: Record<string, string> = {
    'CURRENT': 'watching',
    'COMPLETED': 'completed',
    'PAUSED': 'paused',
    'DROPPED': 'dropped',
    'PLANNING': 'planning',
    'REPEATING': 'rewatching',
};

interface AniListUserProfile {
    id: number;
    userName: string;
    displayName: string;
    email?: string;
    about?: string;
    avatarUrl?: string;
    bannerUrl?: string;
    animeCount?: number;
    mangaCount?: number;
    meanScore?: number;
    minutesWatched?: number;
    createdAt?: string;
}

// Parse AniList JSON export format — handles BOTH raw database export and GraphQL API format
function parseAniListJson(jsonData: any): {
    entries: {
        anilistId: number;
        title: string;
        status: string;
        score: number;
        progress: number;
        notes: string;
        repeat?: number;
        startedOn?: string;
        finishedOn?: string;
    }[];
    userProfile?: AniListUserProfile;
} {
    const entries: any[] = [];
    let userProfile: AniListUserProfile | undefined;

    // ── Detect raw AniList database export format ──
    // Raw format has: { user: {...}, lists: [{series_id, series_type, status (number), ...}] }
    if (jsonData.user && jsonData.lists && Array.isArray(jsonData.lists)) {
        const user = jsonData.user;

        // Extract user profile
        let stats: any = {};
        try {
            stats = typeof user.statistics === 'string' ? JSON.parse(user.statistics) : (user.statistics || {});
        } catch { /* ignore parse errors */ }

        userProfile = {
            id: user.id,
            userName: user.user_name || user.display_name || '',
            displayName: user.display_name || user.user_name || '',
            email: user.email || undefined,
            about: user.about || undefined,
            avatarUrl: user.avatar_url || undefined,
            bannerUrl: user.banner_url || undefined,
            animeCount: stats?.anime?.count || 0,
            mangaCount: stats?.manga?.count || 0,
            meanScore: stats?.anime?.meanScore || 0,
            minutesWatched: stats?.anime?.minutesWatched || 0,
            createdAt: user.created_at || undefined,
        };

        // Parse list entries — only anime (series_type === 0)
        for (const entry of jsonData.lists) {
            // series_type: 0 = ANIME, 1 = MANGA — skip manga
            if (entry.series_type !== 0) continue;

            const rawScore = entry.score || 0;
            // AniList raw export uses 0-100 scale; convert to 0-10
            const normalizedScore = rawScore > 10 ? Math.round(rawScore / 10) : rawScore;

            // Parse YYYYMMDD dates
            let startedOn: string | undefined;
            let finishedOn: string | undefined;
            if (entry.started_on && entry.started_on > 0) {
                const s = String(entry.started_on);
                startedOn = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
            }
            if (entry.finished_on && entry.finished_on > 0) {
                const f = String(entry.finished_on);
                finishedOn = `${f.slice(0, 4)}-${f.slice(4, 6)}-${f.slice(6, 8)}`;
            }

            entries.push({
                anilistId: entry.series_id,
                title: '', // Will be filled from AniList API during import
                status: ANILIST_RAW_STATUS_MAP[entry.status] || 'planning',
                score: normalizedScore,
                progress: entry.progress || 0,
                notes: (entry.notes || '').trim(),
                repeat: entry.repeat || 0,
                startedOn,
                finishedOn,
            });
        }

        console.log(`[AniList Raw] Parsed ${entries.length} anime from raw export (user: ${userProfile.displayName}, total list items: ${jsonData.lists.length})`);
        return { entries, userProfile };
    }

    // ── Standard GraphQL API format ──
    // GraphQL format: { data: { MediaListCollection: { lists: [...] } } } or { lists: [...] }
    const lists = jsonData.data?.MediaListCollection?.lists || jsonData.lists || jsonData;

    if (Array.isArray(lists)) {
        for (const list of lists) {
            const listEntries = list.entries || list;
            if (Array.isArray(listEntries)) {
                for (const entry of listEntries) {
                    entries.push({
                        anilistId: entry.media?.id || entry.mediaId || entry.id,
                        title: entry.media?.title?.english || entry.media?.title?.romaji || entry.title || '',
                        status: ANILIST_GQL_STATUS_MAP[entry.status || list.status || 'PLANNING'] || 'planning',
                        score: entry.score || entry.scoreRaw || 0,
                        progress: entry.progress || 0,
                        notes: entry.notes || '',
                    });
                }
            }
        }
    }

    return { entries };
}

// Helper: lookup anime by MAL ID and upsert to DB
async function upsertAnimeByMalId(malId: number, title: string, type: string, episodes: number): Promise<number | null> {
    // Check if already in DB by mal_id
    const existing = db.prepare('SELECT id FROM anime WHERE mal_id = ?').get(malId) as any;
    if (existing) return existing.id;

    // Try to find on AniList by exact MAL ID
    try {
        await new Promise(resolve => setTimeout(resolve, 500)); // Only delay if hitting API
        let matched = await getAnimeByMalId(malId);

        // If not found by exact MAL ID, do NOT fall back to an arbitrary title search result,
        // because it causes 100% incorrect AniList mappings for missing entries.
        // We will instead let it fall through to Jikan.
        if (!matched) {
            console.log(`MAL ID ${malId} not found directly via AniList idMal. Delegating to Jikan fallback...`);
        }

        if (matched) {
            const genres = JSON.stringify(matched.genres || []);
            const tags = JSON.stringify((matched.tags || []).map((t: any) => t.name));
            const studios = JSON.stringify((matched.studios?.nodes || []).map((s: any) => s.name));

            const res = db.prepare(`
        INSERT INTO anime (anilist_id, mal_id, title_romaji, title_english, title_native,
          synopsis, cover_image, banner_image, genres, tags, episodes, status, season, season_year,
          average_score, popularity, source, studios, format, is_adult)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(anilist_id) DO UPDATE SET mal_id = ?
      `).run(
                matched.id, malId, matched.title.romaji, matched.title.english, matched.title.native,
                matched.description, matched.coverImage?.extraLarge || matched.coverImage?.large,
                matched.bannerImage, genres, tags, matched.episodes, matched.status,
                matched.season, matched.seasonYear, matched.averageScore, matched.popularity,
                matched.source, studios, matched.format, matched.isAdult ? 1 : 0, malId
            );
            return Number(res.lastInsertRowid) || (db.prepare('SELECT id FROM anime WHERE anilist_id = ?').get(matched.id) as any)?.id;
        }
    } catch (err) {
        console.warn(`Failed to look up MAL ID ${malId} (${title}):`, err);
    }

    // Fallback: If AniList fails, fetch from Jikan for cover image
    let coverImage = null;
    let synopsis = null;
    let genres = '[]';
    try {
        await new Promise(resolve => setTimeout(resolve, 350)); // Jikan rate limit is 3/sec
        const jikanRes = await fetch(`https://api.jikan.moe/v4/anime/${malId}`);
        if (jikanRes.ok) {
            const jikanData: any = await jikanRes.json();
            const data = jikanData.data;
            if (data) {
                coverImage = data.images?.webp?.large_image_url || data.images?.jpg?.large_image_url || null;
                synopsis = data.synopsis || null;
                genres = JSON.stringify((data.genres || []).map((g: any) => g.name));
                title = data.title_english || data.title;
            }
        }
    } catch (err) {
        console.warn(`Failed to fetch Jikan fallback for MAL ID ${malId}`);
    }

    const res = db.prepare(`
    INSERT INTO anime (mal_id, title_romaji, title_english, format, episodes, cover_image, synopsis, genres)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(malId, title, title, type, episodes, coverImage, synopsis, genres);
    return Number(res.lastInsertRowid);
}

// Helper: lookup anime by AniList ID
async function upsertAnimeByAnilistId(anilistId: number): Promise<number | null> {
    const existing = db.prepare('SELECT id FROM anime WHERE anilist_id = ?').get(anilistId) as any;
    if (existing) return existing.id;

    try {
        await new Promise(resolve => setTimeout(resolve, 500)); // Only delay if hitting API
        const media = await getAnimeById(anilistId);
        if (media) {
            return upsertAnimeFromMedia(media);
        }
    } catch (err) {
        console.warn(`Failed to look up AniList ID ${anilistId}:`, err);
    }
    return null;
}

// Helper: insert or update anime in DB from AniList media object
function upsertAnimeFromMedia(media: any): number | null {
    if (!media) return null;
    try {
        const genres = JSON.stringify(media.genres || []);
        const tags = JSON.stringify((media.tags || []).map((t: any) => t.name));
        const studios = JSON.stringify((media.studios?.nodes || []).map((s: any) => s.name));

        const res = db.prepare(`
            INSERT INTO anime (anilist_id, mal_id, title_romaji, title_english, title_native,
                synopsis, cover_image, banner_image, genres, tags, episodes, status, season, season_year,
                average_score, popularity, source, studios, format, is_adult)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(anilist_id) DO UPDATE SET
                mal_id = COALESCE(excluded.mal_id, anime.mal_id),
                title_romaji = COALESCE(excluded.title_romaji, anime.title_romaji),
                title_english = COALESCE(excluded.title_english, anime.title_english)
        `).run(
            media.id, media.idMal, media.title?.romaji, media.title?.english, media.title?.native,
            media.description, media.coverImage?.extraLarge || media.coverImage?.large,
            media.bannerImage, genres, tags, media.episodes, media.status,
            media.season, media.seasonYear, media.averageScore, media.popularity,
            media.source, studios, media.format, media.isAdult ? 1 : 0
        );
        return Number(res.lastInsertRowid) || (db.prepare('SELECT id FROM anime WHERE anilist_id = ?').get(media.id) as any)?.id;
    } catch (err) {
        console.warn(`Failed to upsert anime ${media.id}:`, err);
        return null;
    }
}

// ── BATCH AniList import (dramatically faster: 50 per API call instead of 1) ──
// Returns: { imported, skipped, failed, results }
async function batchImportAnilistEntries(
    entries: { anilistId: number; title: string; status: string; score: number; progress: number; notes: string }[],
    userId: string | undefined
): Promise<{ imported: number; skipped: number; failed: number; results: { title: string; status: string; result: string }[] }> {
    let imported = 0, skipped = 0, failed = 0;
    const results: { title: string; status: string; result: string }[] = [];

    // 1. Collect all unique anilist IDs
    const allIds = [...new Set(entries.filter(e => e.anilistId).map(e => e.anilistId))];

    // 2. Check which ones are already in DB
    const dbExisting = new Map<number, { id: number; titleEnglish: string; titleRomaji: string }>();
    for (const anilistId of allIds) {
        const row = db.prepare('SELECT id, title_english, title_romaji FROM anime WHERE anilist_id = ?').get(anilistId) as any;
        if (row) {
            dbExisting.set(anilistId, { id: row.id, titleEnglish: row.title_english, titleRomaji: row.title_romaji });
        }
    }

    // 3. Batch-fetch MISSING anime from AniList API (50 at a time → ~8 API calls for 400 anime)
    const missingIds = allIds.filter(id => !dbExisting.has(id));
    const BATCH_SIZE = 50;
    const titleMap = new Map<number, string>(); // anilistId → display title

    // Pre-populate titleMap from DB entries
    for (const [anilistId, row] of dbExisting) {
        titleMap.set(anilistId, row.titleEnglish || row.titleRomaji || `AniList #${anilistId}`);
    }

    console.log(`[Batch Import] ${allIds.length} unique IDs: ${dbExisting.size} in DB, ${missingIds.length} to fetch from AniList API`);

    const fetchedMediaList: any[] = [];

    for (let i = 0; i < missingIds.length; i += BATCH_SIZE) {
        const batch = missingIds.slice(i, i + BATCH_SIZE);
        try {
            // Rate limit: ~1s pause between batch calls
            if (i > 0) await new Promise(r => setTimeout(r, 1200));

            const mediaList = await getAnimeByIds(batch);
            console.log(`[Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(missingIds.length / BATCH_SIZE)}] Fetched ${mediaList.length}/${batch.length} anime from AniList API`);

            // Store each fetched anime in memory list
            const fetchedIds = new Set<number>();
            for (const media of mediaList) {
                fetchedMediaList.push(media);
                const title = media.title?.english || media.title?.romaji || `AniList #${media.id}`;
                titleMap.set(media.id, title);
                fetchedIds.add(media.id);
            }

            // Mark unfound IDs in this batch
            for (const id of batch) {
                if (!fetchedIds.has(id) && !dbExisting.has(id)) {
                    titleMap.set(id, `AniList #${id}`);
                }
            }
        } catch (err: any) {
            console.warn(`[Batch Import] Batch fetch failed for chunk ${i}:`, err.message);
            // On rate limit (429), wait longer and retry once
            if (err.message?.includes('429')) {
                console.log('[Batch Import] Rate limited, waiting 5s before retry...');
                await new Promise(r => setTimeout(r, 5000));
                try {
                    const mediaList = await getAnimeByIds(batch);
                    for (const media of mediaList) {
                        fetchedMediaList.push(media);
                        const title = media.title?.english || media.title?.romaji || `AniList #${media.id}`;
                        titleMap.set(media.id, title);
                    }
                } catch (retryErr) {
                    console.warn('[Batch Import] Retry also failed:', retryErr);
                }
            }
        }
    }

    // 4. Now process each entry inside a single database transaction (synchronous writes)
    const runImportTransaction = db.transaction(() => {
        // First upsert all fetched media metadata into the 'anime' table
        for (const media of fetchedMediaList) {
            const dbId = upsertAnimeFromMedia(media);
            if (dbId) {
                dbExisting.set(media.id, { id: dbId, titleEnglish: media.title?.english, titleRomaji: media.title?.romaji });
                titleMap.set(media.id, media.title?.english || media.title?.romaji || `AniList #${media.id}`);
            }
        }

        // Now process user list entries
        for (const entry of entries) {
            try {
                if (!entry.anilistId) continue;

                const dbEntry = dbExisting.get(entry.anilistId);
                const displayTitle = entry.title || titleMap.get(entry.anilistId) || `AniList #${entry.anilistId}`;

                if (!dbEntry) {
                    failed++;
                    results.push({ title: displayTitle, status: 'failed', result: 'Not found on AniList' });
                    continue;
                }

                const existing = db.prepare('SELECT id FROM user_anime WHERE user_id = ? AND anime_id = ?')
                    .get(userId, dbEntry.id) as any;

                if (existing) {
                    skipped++;
                    results.push({ title: displayTitle, status: 'skipped', result: 'Already in list' });
                    continue;
                }

                const id = uuidv4();
                db.prepare(`
                    INSERT INTO user_anime (id, user_id, anime_id, status, rating, notes, episodes_watched)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `).run(id, userId, dbEntry.id, entry.status,
                    entry.score > 0 ? entry.score : null, entry.notes || null, entry.progress);

                imported++;
                results.push({ title: displayTitle, status: entry.status, result: 'imported' });
            } catch (err: any) {
                const displayTitle = entry.title || titleMap.get(entry.anilistId) || `AniList #${entry.anilistId}`;
                failed++;
                results.push({ title: displayTitle, status: 'error', result: err.message });
            }
        }
    });

    runImportTransaction();

    return { imported, skipped, failed, results };
}

// POST /api/import/file - Import from file (MAL XML/XML.gz, AniList JSON, plain text)
router.post('/file', authMiddleware, upload.single('file'), async (req: AuthRequest, res: Response) => {
    try {
        if (!req.file) {
            res.status(400).json({ error: 'No file uploaded' });
            return;
        }

        const fileName = req.file.originalname.toLowerCase();
        let content: string;
        let importType: 'mal_xml' | 'anilist_json' | 'text' = 'text';

        // Decompress if gzip
        if (fileName.endsWith('.gz')) {
            content = zlib.gunzipSync(req.file.buffer).toString('utf-8');
        } else {
            content = req.file.buffer.toString('utf-8');
        }

        // Detect format
        if (content.includes('<myanimelist>') || content.includes('<series_animedb_id>')) {
            importType = 'mal_xml';
        } else if (fileName.endsWith('.json') || content.trim().startsWith('{') || content.trim().startsWith('[')) {
            try {
                JSON.parse(content);
                importType = 'anilist_json';
            } catch {
                importType = 'text';
            }
        }

        let imported = 0;
        let skipped = 0;
        let failed = 0;
        const results: { title: string; status: string; result: string }[] = [];

        if (importType === 'mal_xml') {
            const { entries, userInfo } = parseMALXml(content);
            console.log(`Importing ${entries.length} anime from MAL export (user: ${userInfo.username})`);

            // 1. Fetch/Resolve all Anime IDs asynchronously first
            const entryDbIds = new Map<number, number>();
            for (const entry of entries) {
                try {
                    const existingAnime = db.prepare('SELECT id FROM anime WHERE mal_id = ?').get(entry.malId) as any;
                    if (existingAnime) {
                        entryDbIds.set(entry.malId, existingAnime.id);
                    } else {
                        const animeDbId = await upsertAnimeByMalId(entry.malId, entry.title, entry.type, entry.episodes);
                        if (animeDbId) {
                            entryDbIds.set(entry.malId, animeDbId);
                        }
                    }
                } catch (e) {
                    console.warn(`MAL Import ID pre-resolution failed for MAL ID ${entry.malId}:`, e);
                }
            }

            // 2. Execute all insertions inside a single database transaction
            const runMALImportTransaction = db.transaction(() => {
                for (const entry of entries) {
                    try {
                        const animeDbId = entryDbIds.get(entry.malId);
                        if (!animeDbId) {
                            failed++;
                            results.push({ title: entry.title, status: 'failed', result: 'Could not find anime' });
                            continue;
                        }

                        // Check if already in user's list
                        const existing = db.prepare('SELECT id FROM user_anime WHERE user_id = ? AND anime_id = ?')
                            .get(req.userId, animeDbId) as any;

                        if (existing) {
                            skipped++;
                            results.push({ title: entry.title, status: 'skipped', result: 'Already in list' });
                            continue;
                        }

                        const id = uuidv4();
                        const notes = [entry.comments, entry.tags].filter(Boolean).join(' | ') || null;

                        db.prepare(`
                            INSERT INTO user_anime (id, user_id, anime_id, status, rating, notes, episodes_watched)
                            VALUES (?, ?, ?, ?, ?, ?, ?)
                        `).run(
                            id, req.userId, animeDbId, entry.status,
                            entry.score > 0 ? entry.score : null,
                            notes, entry.watchedEpisodes
                        );

                        imported++;
                        results.push({ title: entry.title, status: entry.status, result: 'imported' });
                    } catch (err: any) {
                        failed++;
                        results.push({ title: entry.title, status: 'error', result: err.message });
                    }
                }
            });

            runMALImportTransaction();
        } else if (importType === 'anilist_json') {
            const parsed = parseAniListJson(JSON.parse(content));
            console.log(`Importing ${parsed.entries.length} anime from AniList export`);

            // Use fast batch import (50 anime per API call instead of 1)
            const batchResult = await batchImportAnilistEntries(parsed.entries, req.userId);
            imported = batchResult.imported;
            skipped = batchResult.skipped;
            failed = batchResult.failed;
            results.push(...batchResult.results);

            // Include user profile info in response if available (raw export)
            if (parsed.userProfile) {
                (res as any).__anilistProfile = parsed.userProfile;
            }
        }

        const responseData: any = {
            importType,
            total: results.length,
            imported,
            skipped,
            failed,
            results, // Send full results for frontend 'Show More' functionality
        };

        // Include AniList profile info if available from raw export
        if ((res as any).__anilistProfile) {
            responseData.anilistProfile = (res as any).__anilistProfile;
        }

        res.json(responseData);
    } catch (error: any) {
        console.error('Import error:', error);
        res.status(500).json({ error: error.message || 'Import failed' });
    }
});

// POST /api/import/anilist-username - Import from public AniList profile by username
router.post('/anilist-username', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { username } = req.body;
        if (!username || typeof username !== 'string') {
            res.status(400).json({ error: 'Provide an AniList username' });
            return;
        }

        console.log(`Fetching public AniList list for user: ${username}`);

        // Fetch user profile + full anime list via AniList GraphQL API
        const query = `
            query ($name: String) {
                User(name: $name) {
                    id
                    name
                    about
                    avatar { large medium }
                    bannerImage
                    statistics {
                        anime {
                            count
                            meanScore
                            minutesWatched
                            episodesWatched
                        }
                    }
                    createdAt
                }
                MediaListCollection(userName: $name, type: ANIME) {
                    lists {
                        name
                        status
                        entries {
                            media {
                                id
                                title { romaji english native }
                                coverImage { large }
                            }
                            status
                            score(format: POINT_10)
                            progress
                            notes
                            repeat
                            startedAt { year month day }
                            completedAt { year month day }
                        }
                    }
                }
            }
        `;

        const gqlRes = await fetch('https://graphql.anilist.co', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, variables: { name: username } }),
        });

        if (!gqlRes.ok) {
            const errData: any = await gqlRes.json().catch(() => ({}));
            if (gqlRes.status === 404 || errData?.errors?.[0]?.message?.includes('User')) {
                res.status(404).json({ error: `User "${username}" not found on AniList` });
                return;
            }
            if (gqlRes.status === 429) {
                res.status(429).json({ error: 'AniList rate limit hit. Please try again in a few seconds.' });
                return;
            }
            throw new Error(`AniList API error: ${gqlRes.status}`);
        }

        const gqlData: any = await gqlRes.json();

        if (gqlData.errors) {
            const errMsg = gqlData.errors[0]?.message || 'Unknown AniList error';
            if (errMsg.includes('private') || errMsg.includes('Private')) {
                res.status(403).json({ error: `User "${username}"'s list is private. Use the JSON file import instead.` });
                return;
            }
            throw new Error(errMsg);
        }

        const userData = gqlData.data?.User;
        const listsData = gqlData.data?.MediaListCollection?.lists || [];

        // Build user profile
        const userProfile: AniListUserProfile = {
            id: userData?.id || 0,
            userName: userData?.name || username,
            displayName: userData?.name || username,
            about: userData?.about || undefined,
            avatarUrl: userData?.avatar?.large || userData?.avatar?.medium || undefined,
            bannerUrl: userData?.bannerImage || undefined,
            animeCount: userData?.statistics?.anime?.count || 0,
            meanScore: userData?.statistics?.anime?.meanScore || 0,
            minutesWatched: userData?.statistics?.anime?.minutesWatched || 0,
        };

        // Parse all entries
        const parsed = parseAniListJson({ data: { MediaListCollection: { lists: listsData } } });
        console.log(`Fetched ${parsed.entries.length} anime from AniList user ${username}`);

        // Use fast batch import
        const batchResult = await batchImportAnilistEntries(parsed.entries, req.userId);

        res.json({
            importType: 'anilist_public',
            total: batchResult.results.length,
            imported: batchResult.imported,
            skipped: batchResult.skipped,
            failed: batchResult.failed,
            results: batchResult.results,
            anilistProfile: userProfile,
        });
    } catch (error: any) {
        console.error('AniList username import error:', error);
        res.status(500).json({ error: error.message || 'Failed to fetch AniList data' });
    }
});

// POST /api/import/text - Import from plain text (AI-assisted)
import { compareTwoStrings } from '../utils/similarity';

router.post('/text', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { names } = req.body; // Array of anime names
        if (!names || !Array.isArray(names) || names.length === 0) {
            res.status(400).json({ error: 'Provide an array of anime names' });
            return;
        }

        const results: { name: string; result: string; animeId?: number; requireResolution?: boolean; candidates?: any[] }[] = [];
        let imported = 0;
        let failed = 0;

        for (const name of names.slice(0, 200)) {
            try {
                const trimmedName = name.trim();
                if (!trimmedName) continue;

                await new Promise(resolve => setTimeout(resolve, 800)); // Rate limit buffer

                let searchResult: any = null;
                let usedJikan = false;

                try {
                    searchResult = await searchAnime(trimmedName, 1, 5);
                } catch (apiErr: any) {
                    if (apiErr.message?.includes('429')) {
                        console.log(`AniList 429 for ${trimmedName}, falling back to Jikan...`);
                        await new Promise(r => setTimeout(r, 1000));
                        const jRes = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(trimmedName)}&limit=5`);
                        if (jRes.ok) {
                            const jData: any = await jRes.json();
                            searchResult = { media: jData.data || [] };
                            usedJikan = true;
                        } else {
                            throw new Error('Fallback Jikan API also failed');
                        }
                    } else {
                        throw apiErr;
                    }
                }

                if (!searchResult || !searchResult.media || searchResult.media.length === 0) {
                    failed++;
                    results.push({ name: trimmedName, result: 'Not found' });
                    continue;
                }

                // Calculate probability
                const candidates = searchResult.media;
                let bestMatch = candidates[0];
                let maxSimilarity = 0;

                for (const candidate of candidates) {
                    const titlesToCompare = [];
                    if (usedJikan) {
                        if (candidate.title_english) titlesToCompare.push(candidate.title_english.toLowerCase());
                        if (candidate.title) titlesToCompare.push(candidate.title.toLowerCase());
                    } else {
                        if (candidate.title?.english) titlesToCompare.push(candidate.title.english.toLowerCase());
                        if (candidate.title?.romaji) titlesToCompare.push(candidate.title.romaji.toLowerCase());
                    }

                    for (const t of titlesToCompare) {
                        const sim = compareTwoStrings(trimmedName, t);
                        if (sim > maxSimilarity) {
                            maxSimilarity = sim;
                            bestMatch = candidate;
                        }
                    }
                }

                // If probability is less than 80%, send it back for manual resolution
                if (maxSimilarity < 0.8) {
                    failed++;
                    results.push({
                        name: trimmedName,
                        result: `Confidence too low (${(maxSimilarity * 100).toFixed(0)}%). Requires manual resolution.`,
                        requireResolution: true,
                        candidates: candidates.slice(0, 3).map((c: any) => ({
                            id: usedJikan ? null : c.id,
                            malId: usedJikan ? c.mal_id : c.idMal,
                            title: usedJikan ? (c.title_english || c.title) : (c.title?.english || c.title?.romaji),
                            image: usedJikan ? c.images?.webp?.large_image_url : (c.coverImage?.extraLarge || c.coverImage?.large)
                        }))
                    });
                    continue;
                }

                // If Jikan fallback was used, we must properly upsert by MAL ID natively
                let animeDbId: number | null = null;
                if (usedJikan) {
                    animeDbId = await upsertAnimeByMalId(bestMatch.mal_id, bestMatch.title_english || bestMatch.title, 'TV', bestMatch.episodes || 0);
                } else {
                    const media = bestMatch;
                    const genres = JSON.stringify(media.genres || []);
                    const tags = JSON.stringify((media.tags || []).map((t: any) => t.name));
                    const studios = JSON.stringify((media.studios?.nodes || []).map((s: any) => s.name));

                    const existingAnime = db.prepare('SELECT id FROM anime WHERE anilist_id = ?').get(media.id) as any;
                    if (existingAnime) {
                        animeDbId = existingAnime.id;
                    } else {
                        const r = db.prepare(`
                            INSERT INTO anime (anilist_id, mal_id, title_romaji, title_english, title_native,
                              synopsis, cover_image, banner_image, genres, tags, episodes, status, season, season_year,
                              average_score, popularity, source, studios, format, is_adult)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        `).run(
                            media.id, media.idMal, media.title.romaji, media.title.english, media.title.native,
                            media.description, media.coverImage?.extraLarge || media.coverImage?.large,
                            media.bannerImage, genres, tags, media.episodes, media.status,
                            media.season, media.seasonYear, media.averageScore, media.popularity,
                            media.source, studios, media.format, media.isAdult ? 1 : 0
                        );
                        animeDbId = Number(r.lastInsertRowid);
                    }
                }

                if (!animeDbId) throw new Error("Could not upsert anime to database");

                const existingEntry = db.prepare('SELECT id FROM user_anime WHERE user_id = ? AND anime_id = ?')
                    .get(req.userId, animeDbId) as any;

                if (existingEntry) {
                    results.push({ name: trimmedName, result: 'Already in list', animeId: animeDbId });
                    continue;
                }

                const id = uuidv4();
                db.prepare(`INSERT INTO user_anime (id, user_id, anime_id, status) VALUES (?, ?, ?, 'completed')`)
                    .run(id, req.userId, animeDbId);

                imported++;
                results.push({
                    name: trimmedName,
                    result: `Imported as: ${usedJikan ? (bestMatch.title_english || bestMatch.title) : (bestMatch.title.english || bestMatch.title.romaji)}`,
                    animeId: animeDbId,
                });
            } catch (err: any) {
                failed++;
                results.push({ name: name.trim(), result: `Error: ${err.message}` });
            }
        }

        res.json({ imported, failed, total: results.length, results });
    } catch (error: any) {
        console.error('Text import error:', error);
        res.status(500).json({ error: 'Import failed' });
    }
});

// POST /api/import/resolve - Manual resolution: user picks a candidate for an ambiguous match
router.post('/resolve', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { anilistId, malId, title, status } = req.body;
        const importStatus = status || 'completed';

        if (!anilistId && !malId) {
            res.status(400).json({ error: 'Provide anilistId or malId' });
            return;
        }

        let animeDbId: number | null = null;

        if (anilistId) {
            animeDbId = await upsertAnimeByAnilistId(anilistId);
        }

        if (!animeDbId && malId) {
            animeDbId = await upsertAnimeByMalId(malId, title || 'Unknown', 'TV', 0);
        }

        if (!animeDbId) {
            res.status(404).json({ error: 'Could not find or create anime record' });
            return;
        }

        // Check if already in user's list
        const existing = db.prepare('SELECT id FROM user_anime WHERE user_id = ? AND anime_id = ?')
            .get(req.userId, animeDbId) as any;

        if (existing) {
            res.json({ success: true, result: 'Already in list', animeId: animeDbId });
            return;
        }

        const id = uuidv4();
        db.prepare(`INSERT INTO user_anime (id, user_id, anime_id, status) VALUES (?, ?, ?, ?)`)
            .run(id, req.userId, animeDbId, importStatus);

        res.json({ success: true, result: 'imported', animeId: animeDbId, entryId: id });
    } catch (error: any) {
        console.error('Resolve error:', error);
        res.status(500).json({ error: error.message || 'Resolution failed' });
    }
});

// GET /api/import/stats - Get user statistics
router.get('/stats', authMiddleware, (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId;

        // Total counts by status
        const statusCounts = db.prepare(`
      SELECT status, COUNT(*) as count FROM user_anime WHERE user_id = ? GROUP BY status
    `).all(userId) as any[];

        // Rating distribution
        const ratingDist = db.prepare(`
      SELECT rating, COUNT(*) as count FROM user_anime WHERE user_id = ? AND rating IS NOT NULL GROUP BY rating ORDER BY rating
    `).all(userId) as any[];

        // Average rating
        const avgRating = db.prepare(`
      SELECT AVG(rating) as avg, COUNT(*) as rated FROM user_anime WHERE user_id = ? AND rating IS NOT NULL
    `).get(userId) as any;

        // Genre breakdown
        const allAnime = db.prepare(`
      SELECT a.genres FROM user_anime ua JOIN anime a ON a.id = ua.anime_id WHERE ua.user_id = ?
    `).all(userId) as any[];

        const genreCounts: Record<string, number> = {};
        for (const item of allAnime) {
            const genres: string[] = JSON.parse(item.genres || '[]');
            for (const g of genres) {
                genreCounts[g] = (genreCounts[g] || 0) + 1;
            }
        }

        // Total episodes watched
        const totalEps = db.prepare(`
      SELECT SUM(episodes_watched) as total FROM user_anime WHERE user_id = ?
    `).get(userId) as any;

        // Favorites count
        const favCount = db.prepare(`
      SELECT COUNT(*) as count FROM user_anime WHERE user_id = ? AND favorite = 1
    `).get(userId) as any;

        // Top rated — deduplicated by anilist_id, includes anime_id
        const topRated = db.prepare(`
      SELECT ua.rating, ua.anime_id, a.title_english, a.title_romaji, a.cover_image, a.anilist_id, a.mal_id, a.format
      FROM user_anime ua JOIN anime a ON a.id = ua.anime_id
      WHERE ua.user_id = ? AND ua.rating IS NOT NULL
      GROUP BY a.anilist_id
      ORDER BY ua.rating DESC, ua.updated_at DESC LIMIT 10
    `).all(userId) as any[];

        // Recent activity — includes anime_id
        const recent = db.prepare(`
      SELECT ua.updated_at, ua.status, ua.anime_id, a.title_english, a.title_romaji, a.cover_image, a.anilist_id, a.mal_id
      FROM user_anime ua JOIN anime a ON a.id = ua.anime_id
      WHERE ua.user_id = ?
      ORDER BY ua.updated_at DESC LIMIT 10
    `).all(userId) as any[];

        // Format breakdown
        const formatCounts = db.prepare(`
      SELECT a.format, COUNT(*) as count
      FROM user_anime ua JOIN anime a ON a.id = ua.anime_id
      WHERE ua.user_id = ? AND a.format IS NOT NULL GROUP BY a.format
    `).all(userId) as any[];

        // Format anime list — grouped by format, with full data for display
        const formatAnimeRaw = db.prepare(`
      SELECT a.format, ua.anime_id, ua.rating, a.title_english, a.title_romaji, a.cover_image, a.anilist_id, a.mal_id, a.average_score
      FROM user_anime ua JOIN anime a ON a.id = ua.anime_id
      WHERE ua.user_id = ? AND a.format IS NOT NULL
      ORDER BY a.format, ua.rating DESC
    `).all(userId) as any[];

        const formatAnimeList: Record<string, any[]> = {};
        for (const item of formatAnimeRaw) {
            if (!formatAnimeList[item.format]) formatAnimeList[item.format] = [];
            formatAnimeList[item.format].push({
                animeId: item.anime_id,
                anilistId: item.anilist_id,
                malId: item.mal_id,
                title: item.title_english || item.title_romaji,
                coverImage: item.cover_image,
                rating: item.rating,
                averageScore: item.average_score,
            });
        }

        res.json({
            statusCounts: Object.fromEntries(statusCounts.map(s => [s.status, s.count])),
            ratingDistribution: Object.fromEntries(ratingDist.map(r => [r.rating, r.count])),
            averageRating: avgRating?.avg ? parseFloat(avgRating.avg.toFixed(2)) : 0,
            totalRated: avgRating?.rated || 0,
            genreBreakdown: genreCounts,
            totalEpisodesWatched: totalEps?.total || 0,
            favoritesCount: favCount?.count || 0,
            topRated: topRated.map(t => ({
                animeId: t.anime_id,
                anilistId: t.anilist_id,
                malId: t.mal_id,
                title: t.title_english || t.title_romaji,
                rating: t.rating,
                coverImage: t.cover_image,
                format: t.format,
            })),
            recentActivity: recent.map(r => ({
                animeId: r.anime_id,
                anilistId: r.anilist_id,
                malId: r.mal_id,
                title: r.title_english || r.title_romaji,
                status: r.status,
                updatedAt: r.updated_at,
                coverImage: r.cover_image,
            })),
            formatBreakdown: Object.fromEntries(formatCounts.map(f => [f.format, f.count])),
            formatAnimeList,
            totalAnime: allAnime.length,
        });
    } catch (error: any) {
        console.error('Stats error:', error);
        res.status(500).json({ error: 'Failed to get stats' });
    }
});

// GET /api/import/export - Export list
router.get('/export', authMiddleware, (req: AuthRequest, res: Response) => {
    try {
        const format = req.query.format as string || 'json';
        const list = db.prepare(`
      SELECT ua.*, a.title_english, a.title_romaji, a.anilist_id, a.mal_id, a.genres, a.tags, a.episodes, a.format as anime_format, a.cover_image
      FROM user_anime ua JOIN anime a ON a.id = ua.anime_id
      WHERE ua.user_id = ? ORDER BY ua.updated_at DESC
    `).all(req.userId) as any[];

        const formatted = list.map(item => ({
            title: item.title_english || item.title_romaji,
            anilistId: item.anilist_id,
            malId: item.mal_id,
            status: item.status,
            rating: item.rating,
            notes: item.notes,
            episodesWatched: item.episodes_watched,
            totalEpisodes: item.episodes,
            genres: JSON.parse(item.genres || '[]'),
            format: item.anime_format,
        }));

        if (format === 'csv') {
            const header = 'Title,Status,Rating,Episodes Watched,Total Episodes,Notes,Genres\n';
            const rows = formatted.map(f =>
                `"${f.title}","${f.status}",${f.rating || ''},${f.episodesWatched},${f.totalEpisodes || ''},"${(f.notes || '').replace(/"/g, '""')}","${f.genres.join(', ')}"`
            ).join('\n');
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename=anime-list.csv');
            res.send(header + rows);
        } else if (format === 'markdown') {
            let md = '# My Anime List\n\n';
            const grouped: Record<string, typeof formatted> = {};
            for (const f of formatted) {
                if (!grouped[f.status]) grouped[f.status] = [];
                grouped[f.status].push(f);
            }
            for (const [status, items] of Object.entries(grouped)) {
                md += `## ${status.charAt(0).toUpperCase() + status.slice(1)} (${items.length})\n\n`;
                for (const item of items) {
                    md += `- **${item.title}** ${item.rating ? `— ${item.rating}/10` : ''}\n`;
                    if (item.notes) md += `  - _${item.notes}_\n`;
                }
                md += '\n';
            }
            res.setHeader('Content-Type', 'text/markdown');
            res.setHeader('Content-Disposition', 'attachment; filename=anime-list.md');
            res.send(md);
        } else {
            res.json({ list: formatted });
        }
    } catch (error: any) {
        console.error('Export error:', error);
        res.status(500).json({ error: 'Export failed' });
    }
});

export default router;
