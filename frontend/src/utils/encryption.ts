// API key encryption utilities using Web Crypto API (AES-GCM)

const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const KEY_LENGTH = 256;
const ITERATIONS = 100000;

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(passphrase),
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
    );

    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: salt as any,
            iterations: ITERATIONS,
            hash: 'SHA-256',
        },
        keyMaterial,
        { name: 'AES-GCM', length: KEY_LENGTH },
        false,
        ['encrypt', 'decrypt']
    );
}

export async function encryptData(data: string, passphrase: string): Promise<string> {
    const encoder = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const key = await deriveKey(passphrase, salt);

    const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        encoder.encode(data)
    );

    // Combine salt + iv + encrypted data
    const combined = new Uint8Array(salt.length + iv.length + new Uint8Array(encrypted).length);
    combined.set(salt, 0);
    combined.set(iv, salt.length);
    combined.set(new Uint8Array(encrypted), salt.length + iv.length);

    return btoa(String.fromCharCode(...combined));
}

export async function decryptData(encryptedBase64: string, passphrase: string): Promise<string> {
    const decoder = new TextDecoder();
    const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));

    const salt = combined.slice(0, SALT_LENGTH);
    const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const data = combined.slice(SALT_LENGTH + IV_LENGTH);

    const key = await deriveKey(passphrase, salt);

    const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        data
    );

    return decoder.decode(decrypted);
}

// Storage helpers
const API_KEY_STORAGE_KEY = 'app_gemini_key';
const PIN_HASH_KEY = 'app_pin_hash';

export async function storeApiKey(apiKey: string, pin: string): Promise<void> {
    const encrypted = await encryptData(apiKey, pin);
    localStorage.setItem(API_KEY_STORAGE_KEY, encrypted);

    // Store PIN hash for validation
    const encoder = new TextEncoder();
    const pinHash = await crypto.subtle.digest('SHA-256', encoder.encode(pin));
    const hashBase64 = btoa(String.fromCharCode(...new Uint8Array(pinHash)));
    localStorage.setItem(PIN_HASH_KEY, hashBase64);
}

export async function retrieveApiKey(pin: string): Promise<string | null> {
    const encrypted = localStorage.getItem(API_KEY_STORAGE_KEY);
    if (!encrypted) return null;

    try {
        return await decryptData(encrypted, pin);
    } catch {
        throw new Error('Invalid PIN or corrupted data');
    }
}

export async function validatePin(pin: string): Promise<boolean> {
    const storedHash = localStorage.getItem(PIN_HASH_KEY);
    if (!storedHash) return false;

    const encoder = new TextEncoder();
    const pinHash = await crypto.subtle.digest('SHA-256', encoder.encode(pin));
    const hashBase64 = btoa(String.fromCharCode(...new Uint8Array(pinHash)));

    return hashBase64 === storedHash;
}

export function hasStoredApiKey(): boolean {
    return !!localStorage.getItem(API_KEY_STORAGE_KEY);
}

export function revokeApiKey(): void {
    localStorage.removeItem(API_KEY_STORAGE_KEY);
    localStorage.removeItem(PIN_HASH_KEY);
}

// User.md storage (IndexedDB for larger content)
const USER_MD_KEY = 'user_md_v1';
const USER_MD_TIMESTAMP_KEY = 'user_md_timestamp';

export function storeUserMd(userMd: string): void {
    localStorage.setItem(USER_MD_KEY, userMd);
    localStorage.setItem(USER_MD_TIMESTAMP_KEY, new Date().toISOString());
}

export function retrieveUserMd(): { content: string; timestamp: string } | null {
    const content = localStorage.getItem(USER_MD_KEY);
    const timestamp = localStorage.getItem(USER_MD_TIMESTAMP_KEY);
    if (!content) return null;
    return { content, timestamp: timestamp || '' };
}

export function clearUserMd(): void {
    localStorage.removeItem(USER_MD_KEY);
    localStorage.removeItem(USER_MD_TIMESTAMP_KEY);
}
