"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const crypto = __importStar(require("crypto"));
const freemius_service_1 = require("../services/freemius.service");
const rate_limit_middleware_1 = require("../middleware/rate-limit.middleware");
const account_recovery_email_service_1 = require("../services/account-recovery-email.service");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
const RESET_TOKEN_TTL_MINUTES = 30;
const GENERIC_RECOVERY_RESPONSE = 'If an account exists for that email, a password reset link has been sent.';
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is required for security');
}
async function hashPassword(password) {
    return bcrypt_1.default.hash(password, 10);
}
async function comparePassword(password, hash, userId) {
    let bcryptMatch = false;
    try {
        bcryptMatch = await bcrypt_1.default.compare(password, hash);
    }
    catch (error) {
        // bcrypt.compare throws for non-bcrypt hashes, so we fall back to legacy SHA256.
        bcryptMatch = false;
    }
    if (bcryptMatch) {
        return true;
    }
    // Legacy SHA256 fallback for seeded or older accounts
    const legacyHash = crypto.createHash('sha256').update(password).digest('hex');
    if (legacyHash === hash) {
        const updatedHash = await bcrypt_1.default.hash(password, 10);
        await prisma.user.update({
            where: { id: userId },
            data: { passwordHash: updatedHash },
        });
        return true;
    }
    return false;
}
// POST /api/v1/auth/register
router.post('/register', async (req, res) => {
    try {
        const { email, password, name } = req.body;
        // Input validation
        if (!email || !password) {
            res.status(400).json({ error: 'Email and password are required' });
            return;
        }
        if (password.length < 8) {
            res.status(400).json({ error: 'Password must be at least 8 characters' });
            return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            res.status(400).json({ error: 'Invalid email format' });
            return;
        }
        const normalizedEmail = email.toLowerCase();
        const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
        if (existingUser) {
            res.status(400).json({ error: 'Email already registered' });
            return;
        }
        const passwordHash = await hashPassword(password);
        const freePlan = (0, freemius_service_1.getPlan)('free');
        const user = await prisma.user.create({
            data: {
                email: normalizedEmail,
                passwordHash,
                name: name || null,
                plan: 'free',
                creditsLimit: freePlan.creditsLimit,
                storageLimitBytes: freePlan.storageLimitBytes,
            },
        });
        const token = jsonwebtoken_1.default.sign({ userId: user.id, authVersion: user.authVersion }, JWT_SECRET, { expiresIn: '7d' });
        res.status(201).json({ token, user: { id: user.id, email: user.email, name: user.name } });
    }
    catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Server error during registration' });
    }
});
// POST /api/v1/auth/login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            res.status(400).json({ error: 'Email and password are required' });
            return;
        }
        const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
        if (!user) {
            res.status(401).json({ error: 'Invalid credentials' });
            return;
        }
        const passwordMatch = await comparePassword(password, user.passwordHash, user.id);
        if (!passwordMatch) {
            res.status(401).json({ error: 'Invalid credentials' });
            return;
        }
        const token = jsonwebtoken_1.default.sign({ userId: user.id, authVersion: user.authVersion }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
    }
    catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Server error during login' });
    }
});
// POST /api/v1/auth/forgot-password
router.post('/forgot-password', (0, rate_limit_middleware_1.publicRateLimit)('forgot-password', 5, (req) => typeof req.body?.email === 'string' ? req.body.email : undefined), async (req, res) => {
    try {
        const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
        const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
        const user = validEmail
            ? await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, name: true } })
            : null;
        if (user) {
            const rawToken = crypto.randomBytes(32).toString('base64url');
            const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
            const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60_000);
            await prisma.$transaction([
                prisma.passwordResetToken.updateMany({
                    where: { userId: user.id, usedAt: null },
                    data: { usedAt: new Date() },
                }),
                prisma.passwordResetToken.create({
                    data: { userId: user.id, tokenHash, expiresAt },
                }),
                prisma.passwordResetToken.deleteMany({
                    where: { expiresAt: { lt: new Date(Date.now() - 24 * 60 * 60_000) } },
                }),
            ]);
            const appUrl = (process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '');
            const resetUrl = `${appUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;
            const emailResult = await (0, account_recovery_email_service_1.sendAccountRecoveryEmail)({
                email: user.email,
                name: user.name,
                resetUrl,
                expiresMinutes: RESET_TOKEN_TTL_MINUTES,
            });
            if (emailResult.status !== 'sent') {
                console.error(`Account recovery email ${emailResult.status}:`, emailResult.error);
            }
        }
        res.status(202).json({ message: GENERIC_RECOVERY_RESPONSE });
    }
    catch (error) {
        console.error('Forgot password error:', error);
        // Keep the public response non-enumerating even when delivery fails.
        res.status(202).json({ message: GENERIC_RECOVERY_RESPONSE });
    }
});
// POST /api/v1/auth/reset-password
router.post('/reset-password', (0, rate_limit_middleware_1.publicRateLimit)('reset-password', 10, (req) => typeof req.body?.token === 'string' ? req.body.token : undefined), async (req, res) => {
    try {
        const rawToken = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
        const password = typeof req.body?.password === 'string' ? req.body.password : '';
        if (!rawToken || rawToken.length > 256) {
            res.status(400).json({ error: 'This password reset link is invalid or has expired.' });
            return;
        }
        if (password.length < 8 || password.length > 128) {
            res.status(400).json({ error: 'Password must be between 8 and 128 characters.' });
            return;
        }
        const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
        const resetToken = await prisma.passwordResetToken.findUnique({
            where: { tokenHash },
            select: { id: true, userId: true, usedAt: true, expiresAt: true },
        });
        if (!resetToken || resetToken.usedAt || resetToken.expiresAt <= new Date()) {
            res.status(400).json({ error: 'This password reset link is invalid or has expired.' });
            return;
        }
        const passwordHash = await hashPassword(password);
        await prisma.$transaction(async (tx) => {
            const claimed = await tx.passwordResetToken.updateMany({
                where: { id: resetToken.id, usedAt: null, expiresAt: { gt: new Date() } },
                data: { usedAt: new Date() },
            });
            if (claimed.count !== 1)
                throw new Error('RESET_TOKEN_ALREADY_USED');
            await tx.user.update({
                where: { id: resetToken.userId },
                data: { passwordHash, authVersion: { increment: 1 } },
            });
            await tx.passwordResetToken.updateMany({
                where: { userId: resetToken.userId, usedAt: null },
                data: { usedAt: new Date() },
            });
            await tx.apiKey.updateMany({
                where: { userId: resetToken.userId, revokedAt: null },
                data: { revokedAt: new Date(), revokedReason: 'password_reset' },
            });
        });
        res.json({ message: 'Password reset successfully. Sign in with your new password.' });
    }
    catch (error) {
        if (error instanceof Error && error.message === 'RESET_TOKEN_ALREADY_USED') {
            res.status(400).json({ error: 'This password reset link is invalid or has expired.' });
            return;
        }
        console.error('Reset password error:', error);
        res.status(500).json({ error: 'Password reset failed. Please request a new link.' });
    }
});
exports.default = router;
