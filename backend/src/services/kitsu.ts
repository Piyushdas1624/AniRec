// Kitsu API service - fallback for image loading and anime data
const KITSU_API = 'https://kitsu.io/api/edge';

const KITSU_HEADERS = {
    'Accept': 'application/vnd.api+json',
    'Content-Type': 'application/vnd.api+json',
};

export async function searchAnimeKitsu(query: string, limit = 10): Promise<any[]> {
    const url = `${KITSU_API}/anime?filter[text]=${encodeURIComponent(query)}&page[limit]=${limit}`;
    const response = await fetch(url, { headers: KITSU_HEADERS });
    if (!response.ok) throw new Error(`Kitsu API error: ${response.status}`);
    const json: any = await response.json();
    return (json.data || []).map(normalizeKitsuAnime);
}

export async function getTrendingAnimeKitsu(limit = 20): Promise<any[]> {
    const url = `${KITSU_API}/trending/anime?limit=${limit}`;
    const response = await fetch(url, { headers: KITSU_HEADERS });
    if (!response.ok) throw new Error(`Kitsu API error: ${response.status}`);
    const json: any = await response.json();
    return (json.data || []).map(normalizeKitsuAnime);
}

export async function getPopularAnimeKitsu(limit = 20): Promise<any[]> {
    const url = `${KITSU_API}/anime?sort=-userCount&page[limit]=${limit}`;
    const response = await fetch(url, { headers: KITSU_HEADERS });
    if (!response.ok) throw new Error(`Kitsu API error: ${response.status}`);
    const json: any = await response.json();
    return (json.data || []).map(normalizeKitsuAnime);
}

export async function getAnimeByIdKitsu(kitsuId: number): Promise<any | null> {
    const url = `${KITSU_API}/anime/${kitsuId}`;
    const response = await fetch(url, { headers: KITSU_HEADERS });
    if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error(`Kitsu API error: ${response.status}`);
    }
    const json: any = await response.json();
    return json.data ? normalizeKitsuAnime(json.data) : null;
}

// Kitsu's poster image URLs in multiple sizes
export function getKitsuImageUrl(anime: any): string {
    const attr = anime?.attributes || anime;
    return attr?.posterImage?.large
        || attr?.posterImage?.medium
        || attr?.posterImage?.small
        || attr?.posterImage?.original
        || '';
}

// Normalize Kitsu response to a standard format matching our DB schema
function normalizeKitsuAnime(item: any): any {
    const attr = item.attributes || {};
    const rating = attr.averageRating ? parseFloat(attr.averageRating) : null;
    return {
        kitsuId: parseInt(item.id),
        title: attr.canonicalTitle || attr.titles?.en || attr.titles?.en_jp || 'Unknown',
        titleRomaji: attr.titles?.en_jp || attr.canonicalTitle || '',
        titleEnglish: attr.titles?.en || null,
        synopsis: attr.synopsis || null,
        coverImage: attr.posterImage?.large || attr.posterImage?.medium || null,
        bannerImage: attr.coverImage?.large || attr.coverImage?.original || null,
        genres: [], // Kitsu needs a separate categories request
        episodes: attr.episodeCount || null,
        status: attr.status || '',
        averageScore: rating ? Math.round(rating) : null,
        format: mapKitsuFormat(attr.subtype),
        seasonYear: attr.startDate ? parseInt(attr.startDate.substring(0, 4)) : null,
    };
}

function mapKitsuFormat(subtype: string | null): string {
    if (!subtype) return '';
    const map: Record<string, string> = {
        'TV': 'TV', 'movie': 'MOVIE', 'OVA': 'OVA', 'ONA': 'ONA',
        'special': 'SPECIAL', 'music': 'MUSIC',
    };
    return map[subtype] || subtype.toUpperCase();
}
