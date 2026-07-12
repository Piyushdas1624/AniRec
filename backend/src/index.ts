import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import net from 'net';
import path from 'path';

dotenv.config();

import authRoutes from './routes/auth';
import animeRoutes from './routes/anime';
import geminiRoutes from './routes/gemini';
import importRoutes from './routes/import';
import adminRoutes from './routes/admin';

const app = express();
const trustProxy = process.env.TRUST_PROXY;
if (trustProxy === 'true') {
    app.set('trust proxy', true);
} else if (trustProxy === 'false') {
    app.set('trust proxy', false);
} else if (trustProxy && !isNaN(Number(trustProxy))) {
    app.set('trust proxy', Number(trustProxy));
} else {
    app.set('trust proxy', false); // Secure by default
}
const PORT = parseInt(process.env.PORT || '3001');

// Middleware
app.use(helmet({
    contentSecurityPolicy: process.env.NODE_ENV === 'production' ? {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "https:", "blob:"],
            connectSrc: ["'self'", "https://graphql.anilist.co", "https://api.jikan.moe", "https://kitsu.app",
                "https://accounts.google.com", "https://oauth2.googleapis.com",
                "https://cloudcode-pa.googleapis.com", "https://www.googleapis.com",
                "https://generativelanguage.googleapis.com"],
        },
    } : false,
    crossOriginOpenerPolicy: false, // Allow OAuth popups
}));
app.use(cors({
    origin: process.env.NODE_ENV === 'production'
        ? (process.env.CORS_ORIGIN || true) // true = same-origin (frontend served from backend)
        : (process.env.CORS_ORIGIN || 'http://localhost:5173'),
    credentials: true,
}));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '50mb' }));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200,
    message: { error: 'Too many requests, please try again later' },
    skip: (req) => {
        return req.originalUrl.includes('/import/status') || req.originalUrl.includes('/session/guest-status');
    }
});
app.use(limiter);

// Status rate limiter (bypass standard limits to allow persistent widgets polling)
const statusLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 3000,
    message: { error: 'Too many status queries, please try again later' },
});
app.use('/api/import/status', statusLimiter);
app.use('/api/session/guest-status', statusLimiter);

// Stricter rate limit for auth routes
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { error: 'Too many auth attempts, please try again later' },
});

// Routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/anime', animeRoutes);
app.use('/api/gemini', geminiRoutes);
app.use('/api/import', importRoutes);
app.use('/api/session', adminRoutes);

// Health check
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// ─── Serve Frontend (Production) ────────────────────────────────────────
// In production, serve the Vite-built frontend from ../frontend/dist
const frontendDistPath = path.join(__dirname, '..', '..', 'frontend', 'dist');
if (process.env.NODE_ENV === 'production') {
    // Serve static assets
    app.use(express.static(frontendDistPath));

    // SPA fallback: any non-API route serves index.html
    app.get('*', (_req, res) => {
        res.sendFile(path.join(frontendDistPath, 'index.html'));
    });
    console.log(`📦 Serving frontend from ${frontendDistPath}`);
}

// Check if port is available, try next port if not
function findAvailablePort(startPort: number): Promise<number> {
    return new Promise((resolve) => {
        const server = net.createServer();
        server.once('error', () => {
            console.log(`⚠️  Port ${startPort} is in use, trying ${startPort + 1}...`);
            resolve(findAvailablePort(startPort + 1));
        });
        server.once('listening', () => {
            server.close(() => resolve(startPort));
        });
        server.listen(startPort);
    });
}

import { getImportManager } from './services/import';
import db from './utils/db';

let serverInstance: any = null;
let isShuttingDown = false;

async function gracefulShutdown(signal: string) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    
    console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);

    if (serverInstance) {
        serverInstance.close(() => {
            console.log('HTTP server closed.');
        });
    }

    try {
        await getImportManager().shutdown();
    } catch (err) {
        console.error('Error during ImportManager shutdown:', err);
    }

    try {
        console.log('Closing database connection...');
        db.close();
        console.log('Database connection closed.');
    } catch (err) {
        console.error('Error closing database connection:', err);
    }

    console.log('Graceful shutdown completed. Exiting process.');
    process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

findAvailablePort(PORT).then((availablePort) => {
    serverInstance = app.listen(availablePort, () => {
        console.log(`
  🚀 Anime Recommender API server running!
  📡 http://localhost:${availablePort}
  📝 Environment: ${process.env.NODE_ENV || 'development'}
  `);
    });
});

export default app;
