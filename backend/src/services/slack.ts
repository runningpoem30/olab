import { prisma } from '../db/prisma';

export async function notifyRateLimitReached(senderId: string, windowStart: number): Promise<void> {
  const sender = await prisma.sender.findUnique({
    where: { id: senderId },
    include: { user: { select: { slackWebhookUrl: true } } },
  });
  const webhookUrl = sender?.user.slackWebhookUrl;
  if (!sender || !webhookUrl) return;

  const windowEnd = new Date(windowStart + 60 * 60 * 1000).toISOString();
  const parsedUrl = new URL(webhookUrl);
  if (parsedUrl.protocol !== 'https:' || parsedUrl.hostname !== 'hooks.slack.com') {
    throw new Error('Stored Slack webhook URL is invalid');
  }
  const result = await fetch(parsedUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: `Email sender ${sender.address} reached its hourly send limit. Remaining messages are queued for after ${windowEnd}.` }),
  });
  if (!result.ok) throw new Error(`Slack notification failed: ${result.status} ${result.statusText}`);
}
