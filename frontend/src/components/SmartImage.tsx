import { useState, useEffect } from 'react';

/**
 * SmartImage — Universal anime image component with multi-source fallback.
 * Tries original URL → retry → Jikan API fetch → AniList CDN direct → gradient placeholder.
 * Use this EVERYWHERE an anime cover image is displayed.
 *
 * Uses a global request queue for Jikan to avoid 429 rate-limit errors.
 * Jikan allows ~3 requests/sec; we space them out at 400ms intervals.
 */

// ─── Global Jikan request queue ────────────────────────────────────────
const jikanQueue: Array<{
    malId: number;
    resolve: (url: string | null) => void;
}> = [];
let jikanProcessing = false;
const jikanCache = new Map<number, string | null>(); // malId → image URL

async function processJikanQueue() {
    if (jikanProcessing) return;
    jikanProcessing = true;

    while (jikanQueue.length > 0) {
        const item = jikanQueue.shift();
        if (!item) break;

        // Check cache first (another component may have resolved it while waiting)
        if (jikanCache.has(item.malId)) {
            item.resolve(jikanCache.get(item.malId)!);
            continue;
        }

        try {
            const res = await fetch(`https://api.jikan.moe/v4/anime/${item.malId}`);
            if (res.status === 429) {
                // Rate limited — re-queue with extra delay
                jikanQueue.unshift(item);
                await new Promise(r => setTimeout(r, 2000));
                continue;
            }
            if (res.ok) {
                const data = await res.json();
                const img = data.data?.images?.webp?.large_image_url || data.data?.images?.jpg?.large_image_url || null;
                jikanCache.set(item.malId, img);
                item.resolve(img);
            } else {
                jikanCache.set(item.malId, null);
                item.resolve(null);
            }
        } catch {
            jikanCache.set(item.malId, null);
            item.resolve(null);
        }

        // Respect rate limit: wait 400ms between requests
        await new Promise(r => setTimeout(r, 400));
    }

    jikanProcessing = false;
}

function queueJikanFetch(malId: number): Promise<string | null> {
    // Return cached result immediately
    if (jikanCache.has(malId)) {
        return Promise.resolve(jikanCache.get(malId)!);
    }
    return new Promise(resolve => {
        jikanQueue.push({ malId, resolve });
        processJikanQueue();
    });
}

// ─── Component ─────────────────────────────────────────────────────────
interface SmartImageProps {
    src?: string | null;
    alt?: string;
    malId?: number | null;
    anilistId?: number | null;
    className?: string;
    style?: React.CSSProperties;
    title?: string;
    onClick?: () => void;
}

export default function SmartImage({ src, alt, malId, anilistId, className, style, title, onClick }: SmartImageProps) {
    // Determine initial fallback stage based on whether src is available
    const getInitialStage = () => {
        if (src) return 0;
        // No src — skip stages 0 and 1 (which rely on src), jump to Jikan/AniList
        if (malId) return 2;
        if (anilistId) return 3;
        return 4; // No src, no IDs — placeholder
    };

    const [fallbackStage, setFallbackStage] = useState(getInitialStage);
    const [dynamicSrc, setDynamicSrc] = useState<string | null>(null);
    const [isLoadingFallback, setIsLoadingFallback] = useState(false);

    // 0 = original src
    // 1 = retry original with cache-bust
    // 2 = Jikan API fetch (if malId available) — uses global queue
    // 3 = AniList CDN direct (if anilistId available)
    // 4 = placeholder

    // Reset when props change (e.g. navigating between anime)
    useEffect(() => {
        setFallbackStage(getInitialStage());
        setDynamicSrc(null);
        setIsLoadingFallback(false);
    }, [src, malId, anilistId]);

    useEffect(() => {
        let mounted = true;
        if (fallbackStage === 2 && malId && !dynamicSrc) {
            setIsLoadingFallback(true);
            queueJikanFetch(malId)
                .then(img => {
                    if (!mounted) return;
                    if (img) setDynamicSrc(img);
                    else setFallbackStage(3);
                })
                .finally(() => {
                    if (mounted) setIsLoadingFallback(false);
                });
        }
        return () => { mounted = false; };
    }, [fallbackStage, malId, dynamicSrc]);

    const handleError = () => {
        setFallbackStage(prev => {
            const next = prev + 1;
            // Skip stages that aren't available
            if (next === 1 && !src) return malId ? 2 : (anilistId ? 3 : 4);
            if (next === 1) return 1; // retry
            if (next === 2 && !malId) return anilistId ? 3 : 4; // skip jikan if no malId
            if (next === 3 && !anilistId) return 4; // skip anilist if no anilistId
            return Math.min(next, 4);
        });
    };

    const getImageUrl = (): string | null => {
        switch (fallbackStage) {
            case 0:
                return src || null;
            case 1:
                return src ? `${src}${src.includes('?') ? '&' : '?'}r=1` : null;
            case 2:
                // Return dynamicSrc once fetched from Jikan
                return dynamicSrc || null;
            case 3:
                if (anilistId) return `https://img.anili.st/media/${anilistId}`;
                return null;
            default:
                return null;
        }
    };

    const imageUrl = getImageUrl();

    // Show placeholder if: no image URL available (and not in Jikan fetch stage), exceeded all fallbacks, or loading
    if ((!imageUrl && fallbackStage !== 2) || fallbackStage >= 4 || (isLoadingFallback && !imageUrl)) {
        return (
            <div
                className={className}
                style={{
                    ...style,
                    background: 'linear-gradient(135deg, #1a1a3e 0%, #2d1b69 50%, #1a1a3e 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'column',
                    color: 'rgba(255,255,255,0.4)',
                    gap: '4px',
                    overflow: 'hidden',
                    cursor: onClick ? 'pointer' : undefined,
                }}
                onClick={onClick}
                title={title || alt}
            >
                <span style={{ fontSize: '1.8rem' }}>📺</span>
                {(alt || title) && (
                    <span style={{
                        fontSize: '0.6rem',
                        textAlign: 'center',
                        padding: '0 4px',
                        lineHeight: 1.2,
                        maxWidth: '100%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                    }}>
                        {(alt || title || '').slice(0, 20)}
                    </span>
                )}
            </div>
        );
    }

    return (
        <img
            className={className}
            src={imageUrl || undefined}
            alt={alt || ''}
            loading="lazy"
            onError={handleError}
            style={style}
            onClick={onClick}
            title={title || alt}
        />
    );
}
