import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'anime-recommender.db');
const db = new Database(dbPath);

console.log('Starting DB repair...');

const MEDIA_FRAGMENT = `
  id
  idMal
  title { romaji english native }
  description
  coverImage { extraLarge large }
  bannerImage
  genres
  tags { name }
  episodes
  status
  season
  seasonYear
  averageScore
  popularity
  source
  format
  isAdult
  studios { nodes { name } }
`;

function wait(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function repair() {
    const animeList = db.prepare('SELECT id, mal_id, anilist_id, title_romaji FROM anime WHERE mal_id IS NOT NULL').all() as any[];
    let fixed = 0;

    for (const anime of animeList) {
        if (!anime.anilist_id || anime.anilist_id < 0) continue;

        try {
            await wait(300); // Respect limit
            const graphqlQuery = `
        query ($id: Int) {
          Media(idMal: $id, type: ANIME) {
            ${MEDIA_FRAGMENT}
          }
        }
      `;

            const res = await fetch('https://graphql.anilist.co', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: graphqlQuery, variables: { id: anime.mal_id } }),
            });

            if (!res.ok) {
                // If not found natively by ID, it means the AniList ID currently attached is FAKE.
                if (res.status === 404) {
                    console.log(`[Wiping Corrupt] ${anime.title_romaji} (MAL: ${anime.mal_id}) has a fake anilist_id ${anime.anilist_id}. Removing anilist binding so Jikan works.`);
                    db.prepare('UPDATE anime SET anilist_id = NULL, cover_image = NULL WHERE id = ?').run(anime.id);
                    fixed++;
                }
                continue;
            }

            const data: any = await res.json();
            const media = data.data?.Media;
            if (media && media.id !== anime.anilist_id) {
                console.log(`[Fixing] ${anime.title_romaji} - Expected AniList ID ${media.id}, got ${anime.anilist_id}. Updating DB!`);

                try {
                    db.prepare('DELETE FROM anime WHERE anilist_id = ? AND id != ?').run(media.id, anime.id);
                    db.prepare(`
          UPDATE anime SET 
            anilist_id = ?, 
            cover_image = ?,
            synopsis = ?
          WHERE id = ?
        `).run(media.id, media.coverImage?.extraLarge || media.coverImage?.large, media.description, anime.id);
                    fixed++;
                } catch (e: any) {
                    console.log('Update Error for', anime.title_romaji, e.message);
                }
            }
        } catch (e: any) {
            console.log('Error verifying', anime.mal_id, e.message);
        }
    }
    console.log('Finished repairing', fixed, 'corrupt entries.');
}

repair().then(() => process.exit(0));
