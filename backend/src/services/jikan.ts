// Jikan (MyAnimeList) API service - fallback for AniList
const JIKAN_API = 'https://api.jikan.moe/v4';

export interface JikanAnime {
    mal_id: number;
    title: string;
    title_english: string | null;
    title_japanese: string | null;
    synopsis: string | null;
    images: { jpg: { large_image_url: string; image_url: string } };
    genres: { mal_id: number; name: string }[];
    themes: { mal_id: number; name: string }[];
    episodes: number | null;
    status: string;
    season: string | null;
    year: number | null;
    score: number | null;
    popularity: number | null;
    source: string | null;
    studios: { name: string }[];
    type: string | null;
    aired: { from: string | null; to: string | null };
    rating: string | null;
}

// Rate limiting: Jikan allows ~3 requests/sec
let lastRequestTime = 0;
async function rateLimitedFetch(url: string): Promise<Response> {
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    if (timeSinceLastRequest < 400) {
        await new Promise(resolve => setTimeout(resolve, 400 - timeSinceLastRequest));
    }
    lastRequestTime = Date.now();
    return fetch(url);
}

export async function searchAnimeJikan(query: string, page = 1): Promise<{ data: JikanAnime[]; hasNextPage: boolean }> {
    const url = `${JIKAN_API}/anime?q=${encodeURIComponent(query)}&page=${page}&limit=20&sfw=true`;
    const response = await rateLimitedFetch(url);

    if (!response.ok) throw new Error(`Jikan API error: ${response.status}`);
    const result: any = await response.json();

    return {
        data: result.data,
        hasNextPage: result.pagination?.has_next_page || false,
    };
}

export async function getAnimeByIdJikan(malId: number): Promise<JikanAnime | null> {
    const url = `${JIKAN_API}/anime/${malId}`;
    const response = await rateLimitedFetch(url);

    if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error(`Jikan API error: ${response.status}`);
    }

    const result: any = await response.json();
    return result.data;
}

export async function getTopAnimeJikan(page = 1, filter = 'bypopularity'): Promise<{ data: JikanAnime[]; hasNextPage: boolean }> {
    const url = `${JIKAN_API}/top/anime?page=${page}&filter=${filter}&limit=20`;
    const response = await rateLimitedFetch(url);

    if (!response.ok) throw new Error(`Jikan API error: ${response.status}`);
    const result: any = await response.json();

    return {
        data: result.data,
        hasNextPage: result.pagination?.has_next_page || false,
    };
}
