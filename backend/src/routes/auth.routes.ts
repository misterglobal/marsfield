import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { getPlan } from '../services/freemius.service';

const router = Router();
const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required for security');
}

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

async function comparePassword(password: string, hash: string, userId: string): Promise<boolean> {
  let bcryptMatch = false;
  try {
    bcryptMatch = await bcrypt.compare(password, hash);
  } catch (error) {
    // bcrypt.compare throws for non-bcrypt hashes, so we fall back to legacy SHA256.
    bcryptMatch = false;
  }

  if (bcryptMatch) {
    return true;
  }

  // Legacy SHA256 fallback for seeded or older accounts
  const legacyHash = crypto.createHash('sha256').update(password).digest('hex');
  if (legacyHash === hash) {
    const updatedHash = await bcrypt.hash(password, 10);
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
    const freePlan = getPlan('free');
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

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (error) {
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

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

export default router;
