import { prisma } from '../db/prisma';
import { ensureEmailIndex, indexEmail } from './emailSearch';

const BATCH_SIZE = 100;
const POLL_INTERVAL_MS = 2_000;

export async function indexPendingEmails(): Promise<number> {
  const pending = await prisma.email.findMany({
    where: { searchIndexedAt: null },
    orderBy: { createdAt: 'asc' },
    take: BATCH_SIZE,
    include: { sender: { select: { address: true } } },
  });
  let indexed = 0;
  for (const email of pending) {
    try {
      await indexEmail({ ...email, sender: email.sender.address });
      await prisma.email.updateMany({
        where: { id: email.id, searchIndexedAt: null },
        data: { searchIndexedAt: new Date() },
      });
      indexed += 1;
    } catch (error) {
      console.error('Search index reconciliation failed', { emailId: email.id, error });
    }
  }
  return indexed;
}

export async function runSearchIndexer(): Promise<() => void> {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await ensureEmailIndex();
      await indexPendingEmails();
    } catch (error) {
      console.error('Search indexer failed; will retry on the next interval', error);
    } finally { running = false; }
  };
  await tick();
  const timer = setInterval(() => void tick(), POLL_INTERVAL_MS);
  return () => clearInterval(timer);
}
