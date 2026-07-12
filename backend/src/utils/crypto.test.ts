import test from 'node:test';
import assert from 'node:assert';
import { encrypt, decrypt } from './crypto';

test('Crypto Utility Tests', async (t) => {
    await t.test('should encrypt and decrypt a string successfully', () => {
        const originalText = 'ya29.a0AcW5O-test-access-token-string-12345';
        const encryptedText = encrypt(originalText);

        // Check format v1:iv:tag:data
        assert.ok(encryptedText.startsWith('v1:'));
        const parts = encryptedText.split(':');
        assert.strictEqual(parts.length, 4);

        // Decrypt and compare
        const decryptedText = decrypt(encryptedText);
        assert.strictEqual(decryptedText, originalText);
    });

    await t.test('should handle legacy unencrypted plaintext tokens gracefully', () => {
        const legacyPlainText = 'raw-unencrypted-legacy-token-data';
        
        // Decrypted legacy text should be returned as-is
        const decryptedText = decrypt(legacyPlainText);
        assert.strictEqual(decryptedText, legacyPlainText);
    });

    await t.test('should fail decryption when auth tag or ciphertext is corrupted', () => {
        const originalText = 'sensitive-data';
        const encryptedText = encrypt(originalText);
        
        const parts = encryptedText.split(':');
        // Corrupt the ciphertext
        parts[3] = 'deadbeef' + parts[3].substring(8);
        const corruptedText = parts.join(':');

        assert.throws(() => {
            decrypt(corruptedText);
        }, /Decryption failed/);
    });

    await t.test('should handle empty inputs gracefully', () => {
        assert.strictEqual(encrypt(''), '');
        assert.strictEqual(decrypt(''), '');
    });
});
