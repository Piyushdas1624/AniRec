import { addDebugLog } from './antigravity';

// In production, frontend is served from the backend, so use relative URL
const API_BASE = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '/api' : 'http://localhost:3001/api');

interface RequestOptions {
    method?: string;
    body?: any;
    headers?: Record<string, string>;
    skipAuth401?: boolean;
}

class ApiClient {
    private token: string | null = null;

    constructor() {
        this.token = localStorage.getItem('auth_token');
    }

    setToken(token: string) {
        this.token = token;
        localStorage.setItem('auth_token', token);
    }

    clearToken() {
        this.token = null;
        localStorage.removeItem('auth_token');
    }

    getToken(): string | null {
        return this.token;
    }

    isAuthenticated(): boolean {
        return !!this.token;
    }

    private async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            ...options.headers,
        };

        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        const response = await fetch(`${API_BASE}${endpoint}`, {
            method: options.method || 'GET',
            headers,
            body: options.body ? JSON.stringify(options.body) : undefined,
        });

        if (response.status === 401 && !options.skipAuth401) {
            this.clearToken();
            // Dispatch a custom event so AuthContext can handle this gracefully
            // instead of forcing a hard page reload
            window.dispatchEvent(new CustomEvent('auth:expired'));
            throw new Error('Authentication expired. Please log in again.');
        }

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || `Request failed: ${response.status}`);
        }

        return data;
    }

    // Auth
    async signup(email: string, username: string, displayName: string, password: string) {
        const data = await this.request<{ token: string; user: any }>('/auth/signup', {
            method: 'POST',
            body: { email, username, displayName, password },
            skipAuth401: true,
        });
        this.setToken(data.token);
        return data;
    }

    async login(emailOrUsername: string, password: string) {
        const data = await this.request<{ token: string; user: any }>('/auth/login', {
            method: 'POST',
            body: { emailOrUsername, password },
            skipAuth401: true,
        });
        this.setToken(data.token);
        return data;
    }

    async getMe() {
        return this.request<{ user: any }>('/auth/me', { skipAuth401: true });
    }

    async updateSettings(settings: { proModel?: string; flashModel?: string; theme?: string }) {
        return this.request('/auth/settings', {
            method: 'PUT',
            body: settings,
        });
    }

    // Anime
    async searchAnime(query: string, page = 1) {
        return this.request<{ anime: any[]; hasNextPage: boolean }>(`/anime/search?q=${encodeURIComponent(query)}&page=${page}`);
    }

    async getTrending() {
        return this.request<{ anime: any[] }>('/anime/trending');
    }

    async getPopular() {
        return this.request<{ anime: any[] }>('/anime/popular');
    }

    async getAnime(id: number) {
        return this.request<any>(`/anime/${id}`);
    }

    async addToList(animeId: number, status = 'planning') {
        return this.request<{ id: string; animeId: number; status: string; entry?: any }>('/anime/list/add', {
            method: 'POST',
            body: { animeId, status },
        });
    }

    async getMyList() {
        return this.request<{ list: any[] }>('/anime/list/my');
    }

    async updateListItem(id: string, data: {
        rating?: number;
        notes?: string;
        status?: string;
        favorite?: boolean;
        episodesWatched?: number;
        startDate?: string;
        endDate?: string;
        tags?: string[];
    }) {
        return this.request(`/anime/list/${id}`, {
            method: 'PUT',
            body: data,
        });
    }

    async removeFromList(id: string) {
        return this.request(`/anime/list/${id}`, {
            method: 'DELETE',
        });
    }

    // Gemini — accepts either API key string, Antigravity auth object, or null (for guests using shared session)
    private buildAuthBody(auth: string | { accessToken: string; projectId: string } | null): Record<string, any> {
        if (!auth) return {}; // Guest mode — backend injects shared tokens
        if (typeof auth === 'string') {
            return { apiKey: auth };
        }
        return { accessToken: auth.accessToken, projectId: auth.projectId };
    }

    async listModels(apiKey?: string, accessToken?: string, forceRefresh = false) {
        return this.request<{ models: { id: string; displayName: string; description: string }[] }>('/gemini/models', {
            method: 'POST',
            body: { apiKey, accessToken, forceRefresh },
        });
    }

    async extractTags(auth: string | { accessToken: string; projectId: string } | null, animeId: number, model?: string) {
        const startTime = Date.now();
        addDebugLog({ type: 'request', action: 'Extract Tags', details: `Anime ID: ${animeId}`, endpoint: '/gemini/flash/tags', model });
        try {
            const result = await this.request('/gemini/flash/tags', {
                method: 'POST',
                body: { ...this.buildAuthBody(auth), animeId, model },
            });
            addDebugLog({ type: 'response', action: 'Tags Extracted', details: `Anime ID: ${animeId} - Success`, duration: Date.now() - startTime });
            return result;
        } catch (err: any) {
            addDebugLog({ type: 'error', action: 'Tag Extraction Failed', details: err.message, duration: Date.now() - startTime });
            throw err;
        }
    }

    async getRecommendations(auth: string | { accessToken: string; projectId: string } | null, count = 10, model?: string) {
        const startTime = Date.now();
        addDebugLog({ type: 'request', action: 'Get Recommendations', details: `Count: ${count}`, endpoint: '/gemini/recommend', model });
        try {
            const result = await this.request<{ recommendations: any[]; id: string }>('/gemini/recommend', {
                method: 'POST',
                body: { ...this.buildAuthBody(auth), count, model },
            });
            addDebugLog({ type: 'response', action: 'Recommendations Received', details: `Got ${result.recommendations.length} results`, duration: Date.now() - startTime });
            return result;
        } catch (err: any) {
            addDebugLog({ type: 'error', action: 'Recommendations Failed', details: err.message, duration: Date.now() - startTime });
            throw err;
        }
    }

    async updateUserMd(auth: string | { accessToken: string; projectId: string } | null, model?: string, force = false) {
        const startTime = Date.now();
        addDebugLog({ type: 'request', action: 'Update user.md', details: force ? 'Force regeneration' : 'Smart update', endpoint: '/gemini/update-user-md', model });
        try {
            const result = await this.request<{ userMd: string; version: number; cached?: boolean }>('/gemini/update-user-md', {
                method: 'POST',
                body: { ...this.buildAuthBody(auth), model, force },
            });
            addDebugLog({
                type: 'response',
                action: result.cached ? 'user.md Cached (unchanged)' : 'user.md Updated',
                details: `Version: ${result.version}${result.cached ? ' (no regeneration needed)' : ''}`,
                duration: Date.now() - startTime,
            });
            return result;
        } catch (err: any) {
            addDebugLog({ type: 'error', action: 'user.md Update Failed', details: err.message, duration: Date.now() - startTime });
            throw err;
        }
    }

    async getUserMd() {
        return this.request<{ userMd: string; version: number; updatedAt: string }>('/gemini/user-md');
    }

    async backupEncrypted(encryptedUserMd: string, metadata?: any) {
        return this.request('/gemini/register-client-key', {
            method: 'POST',
            body: { encryptedUserMd, metadata },
        });
    }

    async getRecommendationHistory() {
        return this.request<{ history: any[] }>('/gemini/recommendations/history');
    }

    // Import / Export / Stats
    async importFile(file: File, onProgress?: (p: number) => void): Promise<any> {
        const formData = new FormData();
        formData.append('file', file);

        const headers: Record<string, string> = {};
        if (this.token) headers['Authorization'] = `Bearer ${this.token}`;

        // Use XMLHttpRequest for progress tracking
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', `${API_BASE}/import/file`);

            for (const [key, value] of Object.entries(headers)) {
                xhr.setRequestHeader(key, value);
            }

            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable && onProgress) {
                    onProgress(Math.round((e.loaded / e.total) * 100));
                }
            };

            xhr.onload = () => {
                try {
                    const data = JSON.parse(xhr.responseText);
                    if (xhr.status === 401) {
                        this.clearToken();
                        window.dispatchEvent(new CustomEvent('auth:expired'));
                        reject(new Error('Authentication expired'));
                        return;
                    }
                    if (xhr.status >= 400) {
                        reject(new Error(data.error || 'Import failed'));
                        return;
                    }
                    resolve(data);
                } catch {
                    reject(new Error('Import failed'));
                }
            };

            xhr.onerror = () => reject(new Error('Network error during import'));
            xhr.send(formData);
        });
    }

    async importTextList(names: string[]) {
        return this.request<{ imported: number; failed: number; skipped: number; total: number; results: any[] }>('/import/text', {
            method: 'POST',
            body: { names },
        });
    }

    async importAniListByUsername(username: string) {
        return this.request<any>('/import/anilist-username', {
            method: 'POST',
            body: { username },
        });
    }

    async getImportStatus(jobId: string) {
        return this.request<any>(`/import/status/${jobId}`, {
            method: 'GET',
        });
    }

    async cancelImport(jobId: string) {
        return this.request<any>(`/import/cancel/${jobId}`, {
            method: 'POST',
        });
    }

    async resolveImport(data: { anilistId?: number; malId?: number; title?: string; status?: string }) {
        return this.request<{ success: boolean; result: string; animeId?: number; entryId?: string }>('/import/resolve', {
            method: 'POST',
            body: data,
        });
    }

    async getStats() {
        return this.request<any>('/import/stats');
    }

    async exportList(format: 'json' | 'csv' | 'markdown' = 'json') {
        if (format === 'json') {
            return this.request<any>(`/import/export?format=json`);
        }
        // For CSV/MD, download directly
        const headers: Record<string, string> = {};
        if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
        const response = await fetch(`${API_BASE}/import/export?format=${format}`, { headers });
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = format === 'csv' ? 'anime-list.csv' : 'anime-list.md';
        a.click();
        URL.revokeObjectURL(url);
    }

    // Seasonal
    async getSeasonal(season: string, year: number) {
        return this.request<{ anime: any[] }>(`/anime/seasonal?season=${season}&year=${year}`);
    }

    // Delete entire anime list
    async deleteList() {
        return this.request<{ success: boolean; deleted: number }>('/anime/list', {
            method: 'DELETE',
        });
    }

    // Delete user account
    async deleteAccount() {
        return this.request<{ success: boolean }>('/auth/account', {
            method: 'DELETE',
        });
    }

    // ─── Session Sharing ─────────────────────────────────────────────────
    // Create a shared session (stores your Antigravity tokens, returns invite link)
    async shareSession(data: { accessToken: string; refreshToken?: string; projectId: string; email?: string; tokenExpiry?: number }) {
        return this.request<{ sessionId: string; inviteToken: string; inviteUrl: string }>('/session/share', {
            method: 'POST',
            body: data,
        });
    }

    // Get your active session info (as admin) — includes guest list
    async getSessionInfo() {
        return this.request<{
            hasSession: boolean;
            inviteToken?: string;
            inviteUrl?: string;
            email?: string;
            createdAt?: string;
            guests: Array<{ guestEntryId: string; userId: string; username: string; displayName: string; joinedAt: string }>;
        }>('/session/info');
    }

    // Join a session via invite token
    async joinSession(inviteToken: string) {
        return this.request<{ joined: boolean; adminName: string; adminEmail?: string }>('/session/join', {
            method: 'POST',
            body: { inviteToken },
        });
    }

    // Revoke a guest's access (admin action)
    async revokeGuest(guestUserId: string) {
        return this.request<{ revoked: boolean }>(`/session/revoke/${guestUserId}`, {
            method: 'POST',
        });
    }

    // Check if you are a guest on someone's session
    async getGuestStatus() {
        return this.request<{ isGuest: boolean; adminName?: string; adminEmail?: string }>('/session/guest-status');
    }

    // Stop your shared session (admin)
    async stopSession() {
        return this.request<{ stopped: boolean }>('/session/stop', {
            method: 'DELETE',
        });
    }

    // Leave a session you're a guest on
    async leaveSession() {
        return this.request<{ left: boolean }>('/session/leave', {
            method: 'POST',
        });
    }

    // Update stored tokens (token refresh)
    async updateSessionTokens(data: { accessToken: string; refreshToken?: string; projectId?: string; tokenExpiry?: number }) {
        return this.request<{ updated: boolean }>('/session/update-tokens', {
            method: 'POST',
            body: data,
        });
    }
}

export const api = new ApiClient();
export default api;
