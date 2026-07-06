import { Request, Response, NextFunction } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';

const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required for security');
}

export interface AuthenticatedRequest extends Request {
  authType?: 'jwt' | 'api_key';
  credentialId?: string;
  apiKeyScopes?: string[];
  user?: {
    id: string;
    email: string;
    plan: string;
    creditsUsed: number;
    creditsLimit: number;
  };
}

export async function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Authorization header missing or malformed' });
      return;
    }

    const token = authHeader.slice('Bearer '.length).trim();

    if (token.startsWith('mf_live_')) {
      const hashedKey = createHash('sha256').update(token).digest('hex');
      const apiKey = await prisma.apiKey.findUnique({
        where: { key: hashedKey },
        select: {
          id: true,
          scopes: true,
          expiresAt: true,
          revokedAt: true,
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

      if (!apiKey?.user || apiKey.revokedAt || (apiKey.expiresAt && apiKey.expiresAt <= new Date())) {
        res.status(401).json({ error: 'Invalid or expired authorization token' });
        return;
      }

      req.user = apiKey.user;
      req.authType = 'api_key';
      req.credentialId = apiKey.id;
      req.apiKeyScopes = apiKey.scopes;
      void prisma.apiKey.update({
        where: { id: apiKey.id },
        data: { lastUsedAt: new Date() },
      }).catch(() => undefined);
      next();
      return;
    }

    // jwt.verify can return a string or a JwtPayload; narrow safely to avoid
    // TypeScript type errors and handle malformed tokens.
    const verified = jwt.verify(token, JWT_SECRET as string);

    if (typeof verified === 'string' || !verified) {
      res.status(401).json({ error: 'Invalid or expired authorization token' });
      return;
    }

    const payload = verified as JwtPayload & { userId?: string };
    const userId = (payload as any).userId as string | undefined;
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
    req.credentialId = user.id;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired authorization token' });
  }
}

export function requireScope(scope: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (req.authType !== 'api_key') {
      next();
      return;
    }
    if (!req.apiKeyScopes?.includes(scope)) {
      res.status(403).json({ error: `API key requires the ${scope} scope` });
      return;
    }
    next();
  };
}
