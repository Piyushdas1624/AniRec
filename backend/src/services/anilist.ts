// AniList GraphQL API service
const ANILIST_API = 'https://graphql.anilist.co';

// Lightweight fragment for list/search queries (no relations — prevents 500s)
const MEDIA_FRAGMENT_LIGHT = `
  id
  idMal
  title { romaji english native }
  description(asHtml: false)
  coverImage { large extraLarge }
  bannerImage
  genres
  tags { name rank }
  episodes
  status
  season
  seasonYear
  averageScore
  popularity
  source
  studios { nodes { name } }
  format
  startDate { year month day }
  endDate { year month day }
  isAdult
`;

// Full fragment for single anime detail (includes relations)
const MEDIA_FRAGMENT_FULL = `
  id
  idMal
  title { romaji english native }
  description(asHtml: false)
  coverImage { large extraLarge }
  bannerImage
  genres
  tags { name rank }
  episodes
  status
  season
  seasonYear
  averageScore
  popularity
  source
  studios { nodes { name } }
  format
  startDate { year month day }
  endDate { year month day }
  isAdult
  relations { edges { relationType node { id idMal title { romaji english } coverImage { large } format type status episodes averageScore } } }
`;

export async function searchAnime(query: string, page = 1, perPage = 20): Promise<{ media: any[]; hasNextPage: boolean }> {
  const graphqlQuery = `
    query ($search: String, $page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        pageInfo { hasNextPage }
        media(search: $search, type: ANIME, sort: [SEARCH_MATCH, POPULARITY_DESC]) {
          ${MEDIA_FRAGMENT_LIGHT}
        }
      }
    }
  `;

  const response = await fetch(ANILIST_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: graphqlQuery,
      variables: { search: query, page, perPage },
    }),
  });

  if (!response.ok) throw new Error(`AniList API error: ${response.status}`);
  const data: any = await response.json();
  return {
    media: data.data.Page.media,
    hasNextPage: data.data.Page.pageInfo.hasNextPage,
  };
}

export async function getAnimeById(anilistId: number, signal?: AbortSignal): Promise<any | null> {
  const graphqlQuery = `
    query ($id: Int) {
      Media(id: $id, type: ANIME) {
        ${MEDIA_FRAGMENT_FULL}
      }
    }
  `;

  const response = await fetch(ANILIST_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: graphqlQuery,
      variables: { id: anilistId },
    }),
    signal
  });

  if (!response.ok) throw new Error(`AniList API error: ${response.status}`);
  const data: any = await response.json();
  return data.data.Media;
}

export async function getAnimeByMalId(malId: number, signal?: AbortSignal): Promise<any | null> {
  const graphqlQuery = `
    query ($id: Int) {
      Media(idMal: $id, type: ANIME) {
        ${MEDIA_FRAGMENT_FULL}
      }
    }
  `;

  const response = await fetch(ANILIST_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: graphqlQuery,
      variables: { id: malId },
    }),
    signal
  });

  if (!response.ok) return null; // Don't throw, just return null if not found
  const data: any = await response.json();
  return data.data?.Media || null;
}

export async function getAnimeByIds(anilistIds: number[], signal?: AbortSignal): Promise<any[]> {
  const graphqlQuery = `
    query ($ids: [Int]) {
      Page(perPage: 50) {
        media(id_in: $ids, type: ANIME) {
          ${MEDIA_FRAGMENT_LIGHT}
        }
      }
    }
  `;

  const response = await fetch(ANILIST_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: graphqlQuery,
      variables: { ids: anilistIds },
    }),
    signal
  });

  if (!response.ok) throw new Error(`AniList API error: ${response.status}`);
  const data: any = await response.json();
  return data.data.Page.media;
}

export async function getTrendingAnime(page = 1, perPage = 20): Promise<{ media: any[]; hasNextPage: boolean }> {
  const graphqlQuery = `
    query ($page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        pageInfo { hasNextPage }
        media(type: ANIME, sort: TRENDING_DESC) {
          ${MEDIA_FRAGMENT_LIGHT}
        }
      }
    }
  `;

  const response = await fetch(ANILIST_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: graphqlQuery,
      variables: { page, perPage },
    }),
  });

  if (!response.ok) throw new Error(`AniList API error: ${response.status}`);
  const data: any = await response.json();
  return {
    media: data.data.Page.media,
    hasNextPage: data.data.Page.pageInfo.hasNextPage,
  };
}

export async function getPopularAnime(page = 1, perPage = 20): Promise<{ media: any[]; hasNextPage: boolean }> {
  const graphqlQuery = `
    query ($page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        pageInfo { hasNextPage }
        media(type: ANIME, sort: POPULARITY_DESC) {
          ${MEDIA_FRAGMENT_LIGHT}
        }
      }
    }
  `;

  const response = await fetch(ANILIST_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: graphqlQuery,
      variables: { page, perPage },
    }),
  });

  if (!response.ok) throw new Error(`AniList API error: ${response.status}`);
  const data: any = await response.json();
  return {
    media: data.data.Page.media,
    hasNextPage: data.data.Page.pageInfo.hasNextPage,
  };
}

export function formatAniListDate(date: { year: number; month: number; day: number } | null): string | null {
  if (!date || !date.year) return null;
  return `${date.year}-${String(date.month || 1).padStart(2, '0')}-${String(date.day || 1).padStart(2, '0')}`;
}

export async function getSeasonalAnime(season: string, year: number, page = 1, perPage = 25): Promise<{ media: any[]; hasNextPage: boolean }> {
  const graphqlQuery = `
    query ($season: MediaSeason, $year: Int, $page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        pageInfo { hasNextPage }
        media(type: ANIME, season: $season, seasonYear: $year, sort: POPULARITY_DESC) {
          ${MEDIA_FRAGMENT_LIGHT}
        }
      }
    }
  `;

  const response = await fetch(ANILIST_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: graphqlQuery,
      variables: { season: season.toUpperCase(), year, page, perPage },
    }),
  });

  if (!response.ok) throw new Error(`AniList API error: ${response.status}`);
  const data: any = await response.json();
  return {
    media: data.data.Page.media,
    hasNextPage: data.data.Page.pageInfo.hasNextPage,
  };
}
