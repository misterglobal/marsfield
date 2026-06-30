"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authMiddleware = authMiddleware;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const client_1 = require("@prisma/client");
const crypto_1 = require("crypto");
const prisma = new client_1.PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is required for security');
}
async function authMiddleware(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({ error: 'Authorization header missing or malformed' });
            return;
        }
        const token = authHeader.slice('Bearer '.length).trim();
        if (token.startsWith('mf_live_')) {
            const hashedKey = (0, crypto_1.createHash)('sha256').update(token).digest('hex');
            const apiKey = await prisma.apiKey.findUnique({
                where: { key: hashedKey },
                select: {
                    id: true,
                    user: {
                        select: {
                            id: true,
                            email: true,
                            plan: true,
                            creditsUsed: true,
                            creditsLimit: true,
                        },
                    },
                },
            });
            if (!apiKey?.user) {
                res.status(401).json({ error: 'Invalid or expired authorization token' });
                return;
            }
            req.user = apiKey.user;
            req.authType = 'api_key';
            void prisma.apiKey.update({
                where: { id: apiKey.id },
                data: { lastUsedAt: new Date() },
            }).catch(() => undefined);
            next();
            return;
        }
        // jwt.verify can return a string or a JwtPayload; narrow safely to avoid
        // TypeScript type errors and handle malformed tokens.
        const verified = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        if (typeof verified === 'string' || !verified) {
            res.status(401).json({ error: 'Invalid or expired authorization token' });
            return;
        }
        const payload = verified;
        const userId = payload.userId;
        if (!userId) {
            res.status(401).json({ error: 'Invalid token payload' });
            return;
        }
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                email: true,
                plan: true,
                creditsUsed: true,
                creditsLimit: true,
            },
        });
        if (!user) {
            res.status(401).json({ error: 'User associated with token not found' });
            return;
        }
        req.user = user;
        req.authType = 'jwt';
        next();
    }
    catch (error) {
        res.status(401).json({ error: 'Invalid or expired authorization token' });
    }
}
