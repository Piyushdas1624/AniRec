import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const SALT_LENGTH = 16;
const VERSION_PREFIX = 'v1';

// Strict validation of the key on file load
let encryptionKeyBuffer: Buffer;

const keyEnv = process.env.ENCRYPTION_KEY;
const isProduction = process.env.NODE_ENV === 'production';

if (!keyEnv) {
    if (isProduction) {
        console.error('❌ CRITICAL ERROR: ENCRYPTION_KEY environment variable is not defined in production mode.');
        throw new Error('ENCRYPTION_KEY is required in production.');
    } else {
        console.warn('⚠️ WARNING: ENCRYPTION_KEY is not defined. Using temporary fallback key for development.');
        // Fallback key derived from JWT_SECRET or a default dev secret
        const devSecret = process.env.JWT_SECRET || 'dev-secret-fallback-token-string';
        encryptionKeyBuffer = crypto.createHash('sha256').update(devSecret).digest();
    }
} else {
    // Generate a 32-byte key buffer using SHA-256 hash of the configured key
    encryptionKeyBuffer = crypto.createHash('sha256').update(keyEnv).digest();
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Output format: v1:iv_hex:auth_tag_hex:encrypted_hex
 */
export function encrypt(text: string): string {
    if (!text) return '';

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, encryptionKeyBuffer, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag().toString('hex');

    return `${VERSION_PREFIX}:${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts a versioned AES-256-GCM ciphertext.
 * If the payload does not start with the version prefix 'v1:', 
 * it is assumed to be legacy plain-text and returned as-is.
 */
export function decrypt(encryptedText: string): string {
    if (!encryptedText) return '';

    // Legacy support: if format is not versioned, return it as-is
    if (!encryptedText.startsWith(`${VERSION_PREFIX}:`)) {
        return encryptedText;
    }

    const parts = encryptedText.split(':');
    if (parts.length !== 4) {
        // Corrupted versioned format, return legacy fallback
        return encryptedText;
    }

    const [, ivHex, authTagHex, encryptedHex] = parts;

    try {
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        const decipher = crypto.createDecipheriv(ALGORITHM, encryptionKeyBuffer, iv);
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    } catch (err) {
        console.error('Decryption failed. Stored data may be corrupt or encrypted with a different key:', err);
        throw new Error('Decryption failed: invalid key or corrupted payload');
    }
}
