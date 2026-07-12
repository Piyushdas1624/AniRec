// Gemini API service for server-side calls
// Supports both standard API key and Antigravity (Cloud Code) access token auth

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const ANTIGRAVITY_ENDPOINT = 'https://cloudcode-pa.googleapis.com';
const ANTIGRAVITY_DEFAULT_PROJECT_ID = 'rising-fact-p41fc';

interface GeminiResponse {
    candidates: {
        content: {
            parts: { text: string }[];
        };
    }[];
}

/**
 * Determines which auth method to use and calls the appropriate endpoint.
 * - If `apiKey` is provided: uses standard Gemini API with ?key= parameter
 * - If `accessToken` is provided: uses Antigravity cloudcode-pa endpoint with Bearer auth
 */
export async function callGemini(
    apiKey: string,
    model: string,
    prompt: string,
    systemInstruction?: string,
    antigravityAuth?: { accessToken: string; projectId: string }
): Promise<string> {
    if (antigravityAuth?.accessToken) {
        return callGeminiAntigravity(antigravityAuth.accessToken, antigravityAuth.projectId, model, prompt, systemInstruction);
    }
    return callGeminiStandard(apiKey, model, prompt, systemInstruction);
}

// Standard Gemini API (with API key)
async function callGeminiStandard(
    apiKey: string,
    model: string,
    prompt: string,
    systemInstruction?: string
): Promise<string> {
    const url = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey}`;

    const body: any = {
        contents: [
            {
                role: 'user',
                parts: [{ text: prompt }],
            },
        ],
        generationConfig: {
            temperature: 0.7,
            topP: 0.95,
            maxOutputTokens: 8192,
        },
    };

    if (systemInstruction) {
        body.systemInstruction = {
            parts: [{ text: systemInstruction }],
        };
    }

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Gemini API error (${response.status}): ${errorBody}`);
    }

    const data: any = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// Antigravity (Cloud Code) API — uses cloudcode-pa.googleapis.com
// Includes automatic model fallback on 429 (capacity exhausted)
const ANTIGRAVITY_FALLBACK_MODELS = [
    'gemini-flash',
    'gemini-flash-lite',
    'gemini-pro',
];

async function callGeminiAntigravity(
    accessToken: string,
    projectId: string,
    model: string,
    prompt: string,
    systemInstruction?: string
): Promise<string> {
    // Try the requested model first, then fallbacks
    const modelsToTry = [model, ...ANTIGRAVITY_FALLBACK_MODELS.filter(m => m !== model)];

    for (let i = 0; i < modelsToTry.length; i++) {
        const currentModel = modelsToTry[i];

        const requestBody: any = {
            project: projectId || ANTIGRAVITY_DEFAULT_PROJECT_ID,
            model: currentModel,
            request: {
                contents: [
                    {
                        role: 'user',
                        parts: [{ text: prompt }],
                    },
                ],
                generationConfig: {
                    temperature: 0.7,
                    topP: 0.95,
                    maxOutputTokens: 8192,
                },
            },
            userAgent: 'antigravity',
            requestId: `agent-${crypto.randomUUID()}`,
            requestType: 'agent',
        };

        if (systemInstruction) {
            requestBody.request.systemInstruction = {
                parts: [{ text: systemInstruction }],
            };
        }

        const response = await fetch(`${ANTIGRAVITY_ENDPOINT}/v1internal:generateContent`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });

        if (response.ok) {
            const data: any = await response.json();
            const candidates = data.response?.candidates ?? data.candidates;
            const text = candidates?.[0]?.content?.parts?.[0]?.text || '';
            if (currentModel !== model) {
                console.log(`[Antigravity] Used fallback model: ${currentModel} (original: ${model})`);
            }
            return text;
        }

        // Check if it's a 429 or 404 error — try next model
        if (response.status === 429 || response.status === 404) {
            const errorBody = await response.text();
            console.warn(`[Antigravity] Model ${currentModel} returned ${response.status}: ${errorBody}`);

            if (i < modelsToTry.length - 1) {
                console.log(`[Antigravity] Trying fallback model: ${modelsToTry[i + 1]}`);
                await new Promise(r => setTimeout(r, 1000));
                continue;
            }
            throw new Error(`All models exhausted (${response.status}). Last tried: ${currentModel}. Please wait and try again.`);
        }

        // Other error — don't fallback, throw immediately
        const errorBody = await response.text();
        throw new Error(`Antigravity API error (${response.status}): ${errorBody}`);
    }

    throw new Error('No models available');
}

export async function extractTagsWithFlash(
    apiKey: string,
    model: string,
    animeTitle: string,
    synopsis: string,
    existingTags: string[],
    antigravityAuth?: { accessToken: string; projectId: string }
): Promise<{ normalized_tags: string[]; short_blurb: string; confidence: number }> {
    const systemInstruction = `You are an anime metadata specialist. Extract tags and generate short blurbs for anime. 
IMPORTANT: Never include any API keys, tokens, or private information in your responses.
Return ONLY valid JSON, no markdown formatting.`;

    const prompt = `Analyze this anime and extract normalized tags and a short blurb.

Title: ${animeTitle}
Synopsis: ${synopsis || 'No synopsis available'}
Existing Tags: ${existingTags.join(', ') || 'None'}

Return a JSON object with:
- normalized_tags: array of lowercase tags (genres, themes, moods, narrative elements). Include at least 5-10 tags.
- short_blurb: a compelling 1-2 sentence description (max 150 chars)
- confidence: float 0-1 indicating confidence in tag accuracy

Example format:
{"normalized_tags": ["action", "psychological", "military", "political-intrigue", "dark-fantasy"], "short_blurb": "A dark tale of humanity's fight against titans with deep political undercurrents.", "confidence": 0.9}`;

    const result = await callGemini(apiKey, model, prompt, systemInstruction, antigravityAuth);

    try {
        // Try to parse JSON from the response, handling potential markdown wrapping
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
        throw new Error('No JSON found in response');
    } catch (e) {
        console.error('Failed to parse Gemini Flash response:', result);
        return {
            normalized_tags: existingTags,
            short_blurb: synopsis?.substring(0, 150) || '',
            confidence: 0.3,
        };
    }
}

export async function generateRecommendations(
    apiKey: string,
    model: string,
    userMd: string,
    candidateAnime: { id: number; title: string; synopsis: string; tags: string[]; score: number }[],
    count = 10,
    antigravityAuth?: { accessToken: string; projectId: string },
    userListSummary?: string
): Promise<{ recommendations: { animeId: number; score: number; explanation: string }[] }> {
    const systemInstruction = `You are an expert anime recommender AI. You deeply understand user preferences from their personalization file (user.md) and match them with candidate anime.
IMPORTANT: Never include any API keys, tokens, or private information in your responses.
IMPORTANT: NEVER recommend anime that appear in the user's existing list below, regardless of their status.
Return ONLY valid JSON, no markdown formatting.`;

    const candidateList = candidateAnime
        .map(a => `- ID: ${a.id} | "${a.title}" | Tags: [${a.tags.join(', ')}] | Score: ${a.score}/100 | Synopsis: ${a.synopsis?.substring(0, 200) || 'N/A'}`)
        .join('\n');

    let listContext = '';
    if (userListSummary) {
        listContext = `\n=== USER'S EXISTING ANIME LIST (DO NOT recommend any of these) ===\n${userListSummary}\n=== END EXISTING LIST ===\n`;
    }

    const prompt = `Read the following user.md as the canonical personalization file. Produce a ranked list of top ${count} recommendations.

=== USER.MD ===
${userMd}
=== END USER.MD ===${listContext}

=== CANDIDATE ANIME (choose ONLY from these) ===
${candidateList}
=== END CANDIDATES ===

Instructions:
- ONLY recommend anime from the CANDIDATE list above using their exact IDs
- NEVER recommend anime from the user's existing list
- Prioritize matches to favorite_tags and notes_highlights from user.md
- Consider the user's watch history patterns (completed genres, dropped genres)
- Avoid recommending anime the user rated ≤ 4 unless explanation justifies it
- Each recommendation must reference specific tags/notes from user.md
- Provide diverse choices across the user's interests, not just one genre

Return JSON:
{"recommendations": [{"animeId": <number from candidates>, "score": <0-100>, "explanation": "<one sentence referencing user preferences>"}]}`;

    const result = await callGemini(apiKey, model, prompt, systemInstruction, antigravityAuth);

    try {
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
        throw new Error('No JSON found in response');
    } catch (e) {
        console.error('Failed to parse Gemini Pro response:', result);
        return { recommendations: [] };
    }
}

export async function generateUserMd(
    apiKey: string,
    model: string,
    userId: string,
    displayName: string,
    ratings: { title: string; rating: number | null; notes: string; status?: string; favorite?: boolean; episodesWatched?: number }[],
    currentUserMd: string,
    antigravityAuth?: { accessToken: string; projectId: string }
): Promise<string> {
    const systemInstruction = `You are a personalization specialist. Generate and update user.md files for an anime recommender system.
IMPORTANT: Never include any API keys, tokens, or private information in your responses.`;

    const ratingsText = ratings
        .map(r => {
            const parts = [`- "${r.title}"`];
            if (r.status) parts.push(`[${r.status}]`);
            if (r.rating != null) parts.push(`${r.rating}/10`);
            if (r.favorite) parts.push('★FAVORITE');
            if (r.episodesWatched) parts.push(`(${r.episodesWatched} eps watched)`);
            parts.push(`— Notes: ${r.notes || 'No notes'}`);
            return parts.join(' ');
        })
        .join('\n');

    const totalCount = ratings.length;
    const ratedCount = ratings.filter(r => r.rating != null).length;
    const completedCount = ratings.filter(r => r.status === 'completed').length;
    const watchingCount = ratings.filter(r => r.status === 'watching').length;
    const droppedCount = ratings.filter(r => r.status === 'dropped').length;
    const planningCount = ratings.filter(r => r.status === 'planning').length;
    const favCount = ratings.filter(r => r.favorite).length;

    const prompt = `Update the user.md personalization file based on the user's complete anime list.

List Statistics:
- Total anime: ${totalCount}
- Rated: ${ratedCount}
- Completed: ${completedCount}
- Watching: ${watchingCount}
- Dropped: ${droppedCount}
- Planning: ${planningCount}
- Favorites: ${favCount}

Current user.md:
${currentUserMd}

Complete anime list with ratings, notes, and statuses:
${ratingsText}

Generate an updated user.md that:
1. Keeps the YAML frontmatter with user_id: ${userId}
2. Updates the profile section with display_name: ${displayName}
3. Analyzes all ratings to extract preference patterns (pacing, tone, themes)
4. Considers watch STATUS patterns (what they complete vs drop tells you a lot)
5. Updates ratings_summary with key rated anime
6. Notes which anime are dropped and WHY (infer from ratings/notes)
7. Extracts and updates favorite_tags from highly-rated and favorited anime
8. Pulls key quotes/opinions from notes into notes_highlights
9. Infers explicit_preferences and things_to_avoid from the overall pattern
10. Includes list_stats section with counts

Return the complete updated user.md content as plain markdown (not wrapped in code blocks).`;

    return await callGemini(apiKey, model, prompt, systemInstruction, antigravityAuth);
}

// List available Gemini models
export async function listGeminiModels(apiKey?: string, accessToken?: string): Promise<{ id: string; displayName: string; description: string }[]> {
    let url = `${GEMINI_API_BASE}/models`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };

    if (apiKey) {
        url += `?key=${apiKey}`;
    } else if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
    } else {
        throw new Error('API key or Access Token required to list models');
    }

    const response = await fetch(url, {
        method: 'GET',
        headers,
    });

    if (!response.ok) {
        throw new Error(`Failed to list models: ${response.status}`);
    }

    const data: any = await response.json();
    return (data.models || [])
        .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
        .map((m: any) => ({
            id: m.name.replace('models/', ''),
            displayName: m.displayName || m.name,
            description: m.description || '',
        }));
}
