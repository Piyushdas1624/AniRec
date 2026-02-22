import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
    userId?: string;
    deviceId?: string;
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({ error: 'Authentication required' });
            return;
        }

        const token = authHeader.split(' ')[1];
        const secret = process.env.JWT_SECRET || 'dev-secret';
        const decoded = jwt.verify(token, secret) as { userId: string; deviceId?: string };

        req.userId = decoded.userId;
        req.deviceId = decoded.deviceId;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Invalid or expired token' });
    }
}
