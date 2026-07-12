import db from '../../utils/db';
import { getAnimeByMalId, getAnimeById } from '../anilist';
import { getAnimeByIdJikan } from '../jikan';

export class ResolverCoordinator {
    public static async resolveAnime(
        malId: number,
        title: string,
        type: string,
        episodes: number,
        signal?: AbortSignal
    ): Promise<number | null> {
        if (signal?.aborted) throw new Error('AbortError');

        // Check if already in DB by mal_id
        const existing = db.prepare('SELECT id FROM anime WHERE mal_id = ?').get(malId) as any;
        if (existing) return existing.id;

        // Try to find on AniList by exact MAL ID
        try {
            // Delay AniList API hit to stay within limits, check abort signal
            await new Promise<void>((resolve, reject) => {
                const t = setTimeout(resolve, 500);
                if (signal) {
                    signal.addEventListener('abort', () => {
                        clearTimeout(t);
                        reject(new Error('AbortError'));
                    });
                }
            });

            if (signal?.aborted) throw new Error('AbortError');
            const matched = await getAnimeByMalId(malId, signal);

            if (matched) {
                const animeId = this.upsertAnimeFromMedia(matched);
                if (animeId) return animeId;
            }
        } catch (err: any) {
            if (err.name === 'AbortError' || err.message === 'AbortError') {
                throw err;
            }
            console.warn(`Failed to look up MAL ID ${malId} (${title}) via AniList:`, err.message);
        }

        if (signal?.aborted) throw new Error('AbortError');

        // Fallback: If AniList fails or not found, fetch from Jikan
        let coverImage: string | null = null;
        let synopsis: string | null = null;
        let genres = '[]';
        try {
            await new Promise<void>((resolve, reject) => {
                const t = setTimeout(resolve, 350); // Jikan rate limits
                if (signal) {
                    signal.addEventListener('abort', () => {
                        clearTimeout(t);
                        reject(new Error('AbortError'));
                    });
                }
            });

            if (signal?.aborted) throw new Error('AbortError');
            const jikanData = await getAnimeByIdJikan(malId, signal);
            if (jikanData) {
                coverImage = jikanData.images?.jpg?.large_image_url || jikanData.images?.jpg?.image_url || null;
                synopsis = jikanData.synopsis || null;
                genres = JSON.stringify((jikanData.genres || []).map((g: any) => g.name));
                title = jikanData.title_english || jikanData.title || title;
            }
        } catch (err: any) {
            if (err.name === 'AbortError' || err.message === 'AbortError') {
                throw err;
            }
            console.warn(`Failed to fetch Jikan fallback for MAL ID ${malId}:`, err.message);
        }

        if (signal?.aborted) throw new Error('AbortError');

        const res = db.prepare(`
            INSERT INTO anime (mal_id, title_romaji, title_english, format, episodes, cover_image, synopsis, genres)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(malId, title, title, type, episodes, coverImage, synopsis, genres);
        
        return Number(res.lastInsertRowid);
    }

    public static async resolveAnimeByAnilistId(anilistId: number, signal?: AbortSignal): Promise<number | null> {
        if (signal?.aborted) throw new Error('AbortError');

        const existing = db.prepare('SELECT id FROM anime WHERE anilist_id = ?').get(anilistId) as any;
        if (existing) return existing.id;

        try {
            await new Promise<void>((resolve, reject) => {
                const t = setTimeout(resolve, 500);
                if (signal) {
                    signal.addEventListener('abort', () => {
                        clearTimeout(t);
                        reject(new Error('AbortError'));
                    });
                }
            });

            if (signal?.aborted) throw new Error('AbortError');
            const media = await getAnimeById(anilistId, signal);
            if (media) {
                return this.upsertAnimeFromMedia(media);
            }
        } catch (err: any) {
            if (err.name === 'AbortError' || err.message === 'AbortError') {
                throw err;
            }
            console.warn(`Failed to look up AniList ID ${anilistId} via AniList:`, err.message);
        }
        return null;
    }

    public static upsertAnimeFromMedia(media: any): number | null {
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
}
