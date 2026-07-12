/**
 * Calculates the Sørensen-Dice coefficient similarity between two strings.
 * Normalized for Unicode (international titles) and Unicode properties.
 */
export function compareTwoStrings(str1: string, str2: string): number {
    if (str1 === str2) return 1.0;

    // 1. Normalize compatibility forms (e.g. full-width letters, Japanese kana combinations) and lowercase
    const norm1 = str1.normalize('NFKC').toLowerCase();
    const norm2 = str2.normalize('NFKC').toLowerCase();

    // 2. Remove punctuation and special symbols using Unicode-aware property regex (matches letters and numbers)
    // Keep only letters (\p{L}), numbers (\p{N}), and spaces.
    const clean1 = norm1.replace(/[^\p{L}\p{N}\s]/gu, '');
    const clean2 = norm2.replace(/[^\p{L}\p{N}\s]/gu, '');

    // 3. Remove all whitespace to align with standard string-similarity behavior (e.g. "SwordArt" matches "Sword Art")
    const s1 = clean1.replace(/\s+/gu, '');
    const s2 = clean2.replace(/\s+/gu, '');

    if (s1 === s2) return 1.0;
    if (s1.length < 2 || s2.length < 2) return 0.0;

    // Helper: generate Map of character bigrams and their frequencies
    const getBigrams = (str: string): Map<string, number> => {
        const bigrams = new Map<string, number>();
        for (let i = 0; i < str.length - 1; i++) {
            const bigram = str.substring(i, i + 2);
            const count = bigrams.get(bigram) || 0;
            bigrams.set(bigram, count + 1);
        }
        return bigrams;
    };

    const b1 = getBigrams(s1);
    const b2 = getBigrams(s2);

    let intersection = 0;
    for (const [bigram, count1] of b1.entries()) {
        const count2 = b2.get(bigram);
        if (count2) {
            intersection += Math.min(count1, count2);
        }
    }

    const totalBigrams = (s1.length - 1) + (s2.length - 1);
    return (2.0 * intersection) / totalBigrams;
}
