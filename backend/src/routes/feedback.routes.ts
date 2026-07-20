import { Router, Response } from 'express';
import { Prisma, PrismaClient } from '@prisma/client';
import { authMiddleware, AuthenticatedRequest, requireScope } from '../middleware/auth.middleware';
import { rateLimit } from '../middleware/rate-limit.middleware';
import { sendFeedbackEmail } from '../services/feedback-email.service';

const router = Router();
const prisma = new PrismaClient();

const ALLOWED_TYPES = new Set([
  'bug',
  'billing',
  'generation_failed',
  'upload_issue',
  'feature_request',
  'other',
]);

function cleanString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim();
  if (!cleaned) return null;
  return cleaned.slice(0, maxLength);
}

function safeContext(value: unknown): Prisma.InputJsonObject | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  try {
    const serialized = JSON.stringify(value);
    if (serialized.length > 10_000) return { truncated: true, preview: serialized.slice(0, 10_000) };
    return JSON.parse(serialized) as Prisma.InputJsonObject;
  } catch {
    return undefined;
  }
}

// POST /api/v1/feedback
router.post('/', authMiddleware, requireScope('feedback:write'), rateLimit('feedback'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const type = cleanString(req.body.type, 64) || 'other';
    const message = cleanString(req.body.message, 5_000);
    const pageUrl = cleanString(req.body.page_url, 2_000);
    const userAgent = cleanString(req.body.user_agent || req.headers['user-agent'], 1_000);
    const context = safeContext(req.body.context);

    if (!ALLOWED_TYPES.has(type)) {
      res.status(400).json({ error: 'Unsupported feedback type' });
      return;
    }
    if (!message || message.length < 10) {
      res.status(400).json({ error: 'Feedback message must be at least 10 characters' });
      return;
    }

    const report = await prisma.feedbackReport.create({
      data: {
        userId: req.user.id,
        type,
        message,
        pageUrl,
        userAgent,
        context,
      },
    });

    const emailResult = await sendFeedbackEmail({
      reportId: report.id,
      type,
      message,
      pageUrl,
      userAgent,
      user: req.user,
      context,
    });

    const updated = await prisma.feedbackReport.update({
      where: { id: report.id },
      data: {
        emailStatus: emailResult.status,
        emailMessageId: emailResult.status === 'sent' ? emailResult.messageId : null,
        emailError: emailResult.status === 'sent' ? null : emailResult.error,
        sentAt: emailResult.status === 'sent' ? new Date() : null,
      },
      select: {
        id: true,
        type: true,
        emailStatus: true,
        createdAt: true,
      },
    });

    res.status(201).json(updated);
  } catch (error) {
    console.error('Failed to submit feedback:', error);
    res.status(500).json({ error: 'Failed to submit feedback' });
  }
});

export default router;
