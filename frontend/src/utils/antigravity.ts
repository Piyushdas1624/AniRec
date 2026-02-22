/**
 * Antigravity (Cloud Code) OAuth — Web-only implementation.
 * 
 * Uses Google OAuth PKCE flow with the Cloud Code (Antigravity) client ID 
 * to obtain access tokens for the internal cloudcode-pa.googleapis.com API.
 * 
 * ⚠️ WARNING: This accesses an internal, undocumented API meant for the 
 * Google Cloud Code IDE extension. Use a secondary Google account.
 */

// ─── Constants ─────────────────────────────────────────────────────────
const ANTIGRAVITY_CLIENT_ID = '1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com';
const ANTIGRAVITY_CLIENT_SECRET = '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';

const GOOGLE_OAUTH_SCOPES = [
    'https://www.googleapis.com/auth/cloud-platform',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/cclog',
    'https://www.googleapis.com/auth/experimentsandconfigs',
];

const GOOGLE_OAUTH_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v1/userinfo?alt=json';

export const ANTIGRAVITY_ENDPOINT = 'https://cloudcode-pa.googleapis.com';
const ANTIGRAVITY_API_VERSION = 'v1internal';
const ANTIGRAVITY_DEFAULT_PROJECT_ID = 'rising-fact-p41fc';

const TOKEN_EXPIRY_BUFFER_MS = 60_000; // Refresh 1 minute before expiry
const STORAGE_KEY = 'antigravity_auth';
const DEBUG_LOG_KEY = 'antigravity_debug_log';
const MAX_DEBUG_ENTRIES = 100;

// ─── Types ─────────────────────────────────────────────────────────────
export interface AntigravityAccount {
    email: string;
    accessToken: string;
    refreshToken: string;
    tokenExpiry: number;
    projectId: string;
    createdAt: number;
    updatedAt: number;
}

interface GoogleTokenResponse {
    access_token: string;
    expires_in: number;
    refresh_token: string;
    token_type: string;
}

interface LoadCodeAssistResponse {
    cloudaicompanionProject?: string | { id?: string };
    allowedTiers?: { id?: string; isDefault?: boolean }[];
}

interface OnboardResponse {
    done?: boolean;
    response?: {
        cloudaicompanionProject?: string | { id?: string };
    };
}

// ─── Debug Logger ──────────────────────────────────────────────────────
export interface DebugLogEntry {
    timestamp: number;
    type: 'request' | 'response' | 'token' | 'error' | 'info';
    action: string;
    details: string;
    endpoint?: string;
    status?: number;
    model?: string;
    tokens?: { prompt?: number; output?: number; total?: number };
    duration?: number;
}

export function addDebugLog(entry: Omit<DebugLogEntry, 'timestamp'>): void {
    try {
        const logs = getDebugLogs();
        logs.unshift({ ...entry, timestamp: Date.now() });
        // Keep only the most recent entries
        const trimmed = logs.slice(0, MAX_DEBUG_ENTRIES);
        localStorage.setItem(DEBUG_LOG_KEY, JSON.stringify(trimmed));
    } catch {
        // Storage full or unavailable
    }
}

export function getDebugLogs(): DebugLogEntry[] {
    try {
        const raw = localStorage.getItem(DEBUG_LOG_KEY);
        if (!raw) return [];
        return JSON.parse(raw) as DebugLogEntry[];
    } catch {
        return [];
    }
}

export function clearDebugLogs(): void {
    localStorage.removeItem(DEBUG_LOG_KEY);
}

export function getTokenDebugInfo(): {
    hasToken: boolean;
    email: string;
    projectId: string;
    tokenExpiry: string;
    tokenExpiresIn: string;
    isExpired: boolean;
    createdAt: string;
    lastRefreshed: string;
    totalRequests: number;
    recentErrors: number;
} {
    const account = getStoredAntigravityAccount();
    const logs = getDebugLogs();
    const now = Date.now();

    if (!account) {
        return {
            hasToken: false,
            email: '',
            projectId: '',
            tokenExpiry: 'N/A',
            tokenExpiresIn: 'N/A',
            isExpired: true,
            createdAt: 'N/A',
            lastRefreshed: 'N/A',
            totalRequests: 0,
            recentErrors: 0,
        };
    }

    const expiresIn = account.tokenExpiry - now;
    const expiresInMin = Math.floor(expiresIn / 60000);
    const expiresInSec = Math.floor((expiresIn % 60000) / 1000);

    return {
        hasToken: true,
        email: account.email || 'Unknown',
        projectId: account.projectId || ANTIGRAVITY_DEFAULT_PROJECT_ID,
        tokenExpiry: new Date(account.tokenExpiry).toLocaleTimeString(),
        tokenExpiresIn: expiresIn > 0 ? `${expiresInMin}m ${expiresInSec}s` : 'EXPIRED',
        isExpired: expiresIn <= 0,
        createdAt: new Date(account.createdAt).toLocaleString(),
        lastRefreshed: new Date(account.updatedAt).toLocaleString(),
        totalRequests: logs.filter(l => l.type === 'request').length,
        recentErrors: logs.filter(l => l.type === 'error' && (now - l.timestamp) < 3600000).length,
    };
}

// ─── PKCE ──────────────────────────────────────────────────────────────
function base64UrlEncode(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function generatePKCE(): Promise<{ verifier: string; challenge: string }> {
    const randomBytes = crypto.getRandomValues(new Uint8Array(32));
    const verifier = base64UrlEncode(randomBytes.buffer);
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    const challenge = base64UrlEncode(digest);
    return { verifier, challenge };
}

// ─── Storage ───────────────────────────────────────────────────────────
export function getStoredAntigravityAccount(): AntigravityAccount | null {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        return JSON.parse(raw) as AntigravityAccount;
    } catch {
        return null;
    }
}

function storeAntigravityAccount(account: AntigravityAccount): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(account));
}

export function clearAntigravityAccount(): void {
    localStorage.removeItem(STORAGE_KEY);
}

export function hasAntigravityAuth(): boolean {
    return getStoredAntigravityAccount() !== null;
}

// ─── Token Management ──────────────────────────────────────────────────
function isTokenExpired(account: AntigravityAccount): boolean {
    if (!account.accessToken || typeof account.tokenExpiry !== 'number') return true;
    return account.tokenExpiry <= Date.now() + TOKEN_EXPIRY_BUFFER_MS;
}

async function refreshAccessToken(account: AntigravityAccount): Promise<AntigravityAccount | null> {
    if (!account.refreshToken) return null;

    const startTime = Date.now();
    addDebugLog({
        type: 'token',
        action: 'Token Refresh',
        details: 'Refreshing access token...',
        endpoint: GOOGLE_OAUTH_TOKEN_URL,
    });

    try {
        const resp = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: account.refreshToken,
                client_id: ANTIGRAVITY_CLIENT_ID,
                client_secret: ANTIGRAVITY_CLIENT_SECRET,
            }).toString(),
        });

        if (!resp.ok) {
            addDebugLog({
                type: 'error',
                action: 'Token Refresh Failed',
                details: `HTTP ${resp.status}`,
                status: resp.status,
                duration: Date.now() - startTime,
            });
            return null;
        }

        const payload = await resp.json() as {
            access_token: string;
            expires_in: number;
            refresh_token?: string;
        };

        const expiresIn = typeof payload.expires_in === 'number' ? payload.expires_in : 3600;
        const updated: AntigravityAccount = {
            ...account,
            accessToken: payload.access_token,
            tokenExpiry: startTime + expiresIn * 1000,
            refreshToken: payload.refresh_token ?? account.refreshToken,
            updatedAt: Date.now(),
        };

        storeAntigravityAccount(updated);
        addDebugLog({
            type: 'token',
            action: 'Token Refreshed',
            details: `New token expires in ${expiresIn}s`,
            duration: Date.now() - startTime,
        });
        return updated;
    } catch (err) {
        addDebugLog({
            type: 'error',
            action: 'Token Refresh Error',
            details: err instanceof Error ? err.message : String(err),
            duration: Date.now() - startTime,
        });
        return null;
    }
}

/**
 * Returns a valid access token and project ID, refreshing if needed.
 * Throws if not authenticated or refresh fails.
 */
export async function getValidAntigravityToken(): Promise<{ token: string; projectId: string }> {
    let account = getStoredAntigravityAccount();
    if (!account) throw new Error('Not authenticated with Antigravity. Please sign in.');

    if (isTokenExpired(account)) {
        const refreshed = await refreshAccessToken(account);
        if (!refreshed) {
            clearAntigravityAccount();
            throw new Error('Antigravity session expired. Please sign in again.');
        }
        account = refreshed;
    }

    return { token: account.accessToken, projectId: account.projectId || ANTIGRAVITY_DEFAULT_PROJECT_ID };
}

// ─── Project Discovery ─────────────────────────────────────────────────
function extractProjectId(data: { cloudaicompanionProject?: string | { id?: string } }): string {
    const proj = data.cloudaicompanionProject;
    if (!proj) return '';
    if (typeof proj === 'string') return proj.trim();
    if (typeof proj === 'object' && typeof proj.id === 'string') return proj.id.trim();
    return '';
}

async function onboardUser(accessToken: string, tierID: string): Promise<string> {
    const endpointBase = `${ANTIGRAVITY_ENDPOINT}/${ANTIGRAVITY_API_VERSION}`;
    const maxAttempts = 5;
    const pollDelayMs = 2_000;

    const body = JSON.stringify({
        tierId: tierID,
        metadata: {
            ideType: 'ANTIGRAVITY',
            platform: 'PLATFORM_UNSPECIFIED',
            pluginType: 'GEMINI',
        },
    });

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const resp = await fetch(`${endpointBase}:onboardUser`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
                body,
            });

            if (!resp.ok) return '';
            const data = await resp.json() as OnboardResponse;

            if (data.done) {
                return data.response ? extractProjectId(data.response) : '';
            }

            if (attempt < maxAttempts) {
                await new Promise(r => setTimeout(r, pollDelayMs));
            }
        } catch {
            return '';
        }
    }
    return '';
}

async function discoverProjectId(accessToken: string): Promise<string> {
    const endpointBase = `${ANTIGRAVITY_ENDPOINT}/${ANTIGRAVITY_API_VERSION}`;

    let data: LoadCodeAssistResponse;
    try {
        const resp = await fetch(`${endpointBase}:loadCodeAssist`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                metadata: {
                    ideType: 'ANTIGRAVITY',
                    platform: 'PLATFORM_UNSPECIFIED',
                    pluginType: 'GEMINI',
                },
            }),
        });

        if (!resp.ok) return '';
        data = await resp.json() as LoadCodeAssistResponse;
    } catch {
        return '';
    }

    const projectId = extractProjectId(data);
    if (projectId) return projectId;

    // Not onboarded — determine tier and onboard
    let tierID = 'legacy-tier';
    if (Array.isArray(data.allowedTiers)) {
        const defaultTier = data.allowedTiers.find(t => t.isDefault);
        if (defaultTier?.id?.trim()) tierID = defaultTier.id.trim();
    }

    return onboardUser(accessToken, tierID);
}

// ─── Finalize Login ────────────────────────────────────────────────────
async function finalizeLogin(
    accessToken: string,
    refreshToken: string,
    tokenExpiry: number,
): Promise<AntigravityAccount> {
    // Fetch user info
    let email = '';
    try {
        const userResp = await fetch(GOOGLE_USERINFO_URL, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (userResp.ok) {
            const userInfo = await userResp.json() as { email?: string };
            email = userInfo.email ?? '';
        }
    } catch {
        // Non-fatal
    }

    // Discover project ID
    const projectId = await discoverProjectId(accessToken);

    const now = Date.now();
    const account: AntigravityAccount = {
        email,
        accessToken,
        refreshToken,
        tokenExpiry,
        projectId,
        createdAt: now,
        updatedAt: now,
    };

    storeAntigravityAccount(account);
    addDebugLog({
        type: 'info',
        action: 'Login Complete',
        details: `Signed in as ${email || 'Unknown'}, project: ${projectId || 'default'}`,
    });
    return account;
}

// ─── OAuth Login (PKCE + Popup) ────────────────────────────────────────
/**
 * Opens a Google OAuth popup and completes the PKCE flow.
 * Returns the authenticated account on success.
 */
export async function loginWithAntigravity(): Promise<AntigravityAccount> {
    const pkce = await generatePKCE();

    const state = base64UrlEncode(
        new TextEncoder().encode(JSON.stringify({ verifier: pkce.verifier })).buffer
    );

    const redirectUri = `${window.location.origin}/oauth-callback.html`;

    const authUrl = new URL(GOOGLE_OAUTH_AUTH_URL);
    authUrl.searchParams.set('client_id', ANTIGRAVITY_CLIENT_ID);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', GOOGLE_OAUTH_SCOPES.join(' '));
    authUrl.searchParams.set('code_challenge', pkce.challenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');

    addDebugLog({
        type: 'info',
        action: 'OAuth Started',
        details: 'Opening Google OAuth popup...',
        endpoint: GOOGLE_OAUTH_AUTH_URL,
    });

    // Open popup
    const callbackUrlStr = await openOAuthPopup(authUrl.toString());
    const callbackUrl = new URL(callbackUrlStr);
    const code = callbackUrl.searchParams.get('code');

    if (!code) {
        const error = callbackUrl.searchParams.get('error') || 'No authorization code received';
        throw new Error(`OAuth failed: ${error}`);
    }

    // Exchange code for tokens
    const startTime = Date.now();
    addDebugLog({
        type: 'request',
        action: 'Token Exchange',
        details: 'Exchanging authorization code for tokens...',
        endpoint: GOOGLE_OAUTH_TOKEN_URL,
    });

    const tokenResp = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: ANTIGRAVITY_CLIENT_ID,
            client_secret: ANTIGRAVITY_CLIENT_SECRET,
            code,
            grant_type: 'authorization_code',
            redirect_uri: redirectUri,
            code_verifier: pkce.verifier,
        }).toString(),
    });

    if (!tokenResp.ok) {
        const errorText = await tokenResp.text();
        addDebugLog({
            type: 'error',
            action: 'Token Exchange Failed',
            details: errorText,
            status: tokenResp.status,
        });
        throw new Error(`Token exchange failed (${tokenResp.status}): ${errorText}`);
    }

    const tokenData = await tokenResp.json() as GoogleTokenResponse;
    const expiresIn = typeof tokenData.expires_in === 'number' ? tokenData.expires_in : 3600;

    addDebugLog({
        type: 'token',
        action: 'Token Acquired',
        details: `Token expires in ${expiresIn}s`,
        duration: Date.now() - startTime,
    });

    return finalizeLogin(
        tokenData.access_token,
        tokenData.refresh_token,
        startTime + expiresIn * 1000,
    );
}

// ─── Popup Handler (COOP-safe, triple-channel) ─────────────────────────
// Google's OAuth pages set Cross-Origin-Opener-Policy which SEVERS
// window.opener in the popup. This means window.opener.postMessage()
// fails silently. We use 3 communication channels to ensure reliability:
//   1. postMessage (works if COOP didn't break it)
//   2. BroadcastChannel (works even when COOP breaks window.opener)
//   3. localStorage polling (ultimate fallback for old browsers)
function openOAuthPopup(authUrl: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        const width = 500;
        const height = 700;
        const left = window.screenX + (window.outerWidth - width) / 2;
        const top = window.screenY + (window.outerHeight - height) / 2;
        const features = `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no`;

        // Clear any stale localStorage result from previous attempts
        try { localStorage.removeItem('anirec_oauth_result'); } catch { /* ok */ }

        const popup = window.open(authUrl, 'anirec-oauth', features);
        if (!popup) {
            reject(new Error('Popup blocked. Please allow popups for this site.'));
            return;
        }

        let resolved = false;

        function finish(url: string | null, error: string | null) {
            if (resolved) return;
            resolved = true;
            clearTimeout(timeout);
            clearInterval(lsPoll);
            window.removeEventListener('message', msgHandler);
            try { bc.close(); } catch { /* ok */ }
            try { localStorage.removeItem('anirec_oauth_result'); } catch { /* ok */ }

            if (error) {
                reject(new Error(error));
            } else if (url) {
                resolve(url);
            } else {
                reject(new Error('OAuth failed: no callback URL received'));
            }
        }

        // Channel 1: postMessage (works if window.opener survived COOP)
        function msgHandler(event: MessageEvent) {
            if (event.origin !== window.location.origin) return;
            if (event.data?.type !== 'oauth-callback') return;
            finish(event.data.url || null, event.data.error || null);
        }
        window.addEventListener('message', msgHandler);

        // Channel 2: BroadcastChannel (works when COOP severs window.opener)
        let bc: BroadcastChannel;
        try {
            bc = new BroadcastChannel('anirec-oauth');
            bc.onmessage = (event) => {
                if (event.data?.type !== 'oauth-callback') return;
                finish(event.data.url || null, event.data.error || null);
            };
        } catch {
            // BroadcastChannel not supported — fall through to localStorage
            bc = { close: () => { } } as any;
        }

        // Channel 3: localStorage polling (fallback for browsers without BroadcastChannel)
        const lsPoll = setInterval(() => {
            if (resolved) return;
            try {
                const raw = localStorage.getItem('anirec_oauth_result');
                if (raw) {
                    const data = JSON.parse(raw);
                    if (data?.type === 'oauth-callback') {
                        finish(data.url || null, data.error || null);
                    }
                }
            } catch { /* ignore parse errors */ }
        }, 500);

        // 5-minute absolute timeout
        const timeout = setTimeout(() => {
            if (resolved) return;
            finish(null, 'OAuth timed out after 5 minutes. Please try again.');
            try { popup.close(); } catch { /* COOP */ }
        }, 300_000);
    });
}

// ─── Available Models ──────────────────────────────────────────────────
// Updated list based on actual Antigravity/Cloud Code available models
export const ANTIGRAVITY_MODELS = [
    // Gemini 3.1 (latest)
    { id: 'gemini-3.1-pro-high', displayName: 'Gemini 3.1 Pro (High)', description: 'Latest & most capable, high compute' },
    { id: 'gemini-3.1-pro-low', displayName: 'Gemini 3.1 Pro (Low)', description: 'Latest pro model, lower compute' },
    // Gemini 3
    { id: 'gemini-3-pro-preview', displayName: 'Gemini 3 Pro', description: 'Advanced reasoning and coding' },
    { id: 'gemini-3-flash-preview', displayName: 'Gemini 3 Flash', description: 'Fast and efficient' },
    // Gemini 2.5
    { id: 'gemini-2.5-pro', displayName: 'Gemini 2.5 Pro', description: 'Strong reasoning' },
    { id: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', description: 'Fast and cost-effective' },
    { id: 'gemini-2.5-flash-lite', displayName: 'Gemini 2.5 Lite', description: 'Lightweight' },
    // Third-party models on Antigravity
    { id: 'claude-sonnet-4-6', displayName: 'Claude Sonnet 4.6 (Thinking)', description: 'Anthropic Sonnet with extended thinking' },
    { id: 'claude-4.6-thinking', displayName: 'Claude 4.6 TK', description: 'Anthropic Claude 4.6 Thinking' },
    { id: 'gpt-oss-120b-medium', displayName: 'GPT-OSS 120B (Medium)', description: 'OpenAI open-source 120B' },
];
