import { EmailStatus, Prisma } from '@prisma/client';
import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma';

export const emailsRouter = Router();

const scheduleSchema = z.object({
  sender: z.string().email(),
  subject: z.string().trim().min(1).max(998),
  body: z.string().min(1).max(100_000),
  recipients: z.array(z.string().email()).min(1).max(10_000),
  startAt: z.string().datetime({ offset: true }),
  delayBetweenEmailsMs: z.number().int().min(0).max(86_400_000).default(2_000),
  hourlyLimit: z.number().int().positive().max(100_000).optional(),
  idempotencyKey: z.string().min(8).max(200),
});

function requireUser(req: Request, res: Response): string | undefined {
  if (!req.session.userId) {
    res.status(401).json({ error: 'Authentication required' });
    return undefined;
  }
  return req.session.userId;
}

emailsRouter.post('/', async (req, res, next) => {
  const userId = requireUser(req, res);
  if (!userId) return;

  const parsed = scheduleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid schedule request', details: parsed.error.flatten() });
    return;
  }

  const data = parsed.data;
  const recipients = [...new Set(data.recipients.map((address) => address.trim().toLowerCase()))];

  try {
    const result = await prisma.$transaction(async (tx) => {
      const sender = await tx.sender.upsert({
        where: { userId_address: { userId, address: data.sender.toLowerCase() } },
        create: { userId, address: data.sender.toLowerCase() },
        update: {},
      });
      const existing = await tx.scheduleRequest.findUnique({
        where: { userId_idempotencyKey: { userId, idempotencyKey: data.idempotencyKey } },
        include: { emails: { select: { id: true }, orderBy: { createdAt: 'asc' } } },
      });
      if (existing) return { duplicate: true, ids: existing.emails.map(({ id }) => id) };
      const request = await tx.scheduleRequest.create({
        data: { userId, idempotencyKey: data.idempotencyKey },
      });

      const startAt = new Date(data.startAt);
      if (startAt.getTime() < Date.now() - 60_000) {
        throw new Error('startAt must not be more than one minute in the past');
      }
      const emails = await tx.email.createManyAndReturn({
        data: recipients.map((recipient, index) => ({
          userId,
          senderId: sender.id,
          scheduleRequestId: request.id,
          recipient,
          subject: data.subject,
          body: data.body,
          scheduledAt: new Date(startAt.getTime() + index * data.delayBetweenEmailsMs),
          delayBetweenEmailsMs: data.delayBetweenEmailsMs,
          ...(data.hourlyLimit !== undefined ? { hourlyLimit: data.hourlyLimit } : {}),
          idempotencyKey: `${data.idempotencyKey}:${index}`,
          status: EmailStatus.SCHEDULED,
        })),
        select: { id: true },
      });
      await tx.queueOutbox.createMany({ data: emails.map(({ id }) => ({ emailId: id })) });
      return { duplicate: false, ids: emails.map(({ id }) => id) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    res.status(result.duplicate ? 200 : 202).json({
      accepted: result.ids.length,
      duplicate: result.duplicate,
      emailIds: result.ids,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'startAt must not be more than one minute in the past') {
      res.status(400).json({ error: error.message });
      return;
    }
    next(error);
  }
});

emailsRouter.get('/search', async (req, res, next) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (query.length < 2) {
    res.status(400).json({ error: 'q must contain at least 2 characters' });
    return;
  }
  try {
    const { searchEmails } = await import('../services/emailSearch');
    res.json(await searchEmails(userId, query));
  } catch (error) {
    next(error);
  }
});

emailsRouter.get('/', async (req, res, next) => {
  const userId = requireUser(req, res);
  if (!userId) return;

  const status = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : undefined;
  if (status && !Object.values(EmailStatus).includes(status as EmailStatus)) {
    res.status(400).json({ error: 'status must be scheduled, sending, sent, or failed' });
    return;
  }
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
  try {
    const emails = await prisma.email.findMany({
      where: { userId, ...(status ? { status: status as EmailStatus } : {}) },
      orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      include: { sender: { select: { address: true } } },
    });
    const hasMore = emails.length > limit;
    const page = hasMore ? emails.slice(0, limit) : emails;
    res.json({
      data: page.map(({ sender, ...email }) => ({ ...email, sender: sender.address })),
      nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
    });
  } catch (error) {
    next(error);
  }
});
