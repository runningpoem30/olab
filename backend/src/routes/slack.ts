import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { env } from '../config/env';
import { prisma } from '../db/prisma';

export const slackRouter = Router();

function signedState(userId: string, nonce: string): string {
  const payload = Buffer.from(`${userId}:${nonce}`).toString('base64url');
  const signature = createHmac('sha256', env.SLACK_STATE_SECRET).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function verifyState(state: string, expected: string, userId: string): boolean {
  const [payload, signature] = state.split('.');
  if (!payload || !signature || state !== expected) return false;
  const expectedSignature = createHmac('sha256', env.SLACK_STATE_SECRET).update(payload).digest();
  let actualSignature: Buffer;
  try { actualSignature = Buffer.from(signature, 'base64url'); } catch { return false; }
  if (actualSignature.length !== expectedSignature.length || !timingSafeEqual(actualSignature, expectedSignature)) return false;
  try {
    const [stateUserId, nonce] = Buffer.from(payload, 'base64url').toString().split(':');
    return stateUserId === userId && typeof nonce === 'string' && nonce.length >= 20;
  } catch { return false; }
}

slackRouter.get('/connect', (req, res) => {
  const userId = req.session.userId;
  if (!userId) { res.status(401).json({ error: 'Authentication required' }); return; }
  if (!env.SLACK_CLIENT_ID) { res.status(503).json({ error: 'Slack OAuth is not configured' }); return; }
  const nonce = randomBytes(24).toString('base64url');
  const state = signedState(userId, nonce);
  req.session.slackOAuthState = state;
  const params = new URLSearchParams({
    client_id: env.SLACK_CLIENT_ID,
    scope: 'incoming-webhook',
    redirect_uri: env.SLACK_REDIRECT_URI,
    state,
  });
  res.redirect(`https://slack.com/oauth/v2/authorize?${params.toString()}`);
});

slackRouter.get('/callback', async (req, res, next) => {
  const userId = req.session.userId;
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  if (!userId || !state || !req.session.slackOAuthState || !verifyState(state, req.session.slackOAuthState, userId)) {
    res.status(400).json({ error: 'Invalid Slack OAuth state; reconnect and try again' });
    return;
  }
  delete req.session.slackOAuthState;
  if (!code || !env.SLACK_CLIENT_ID || !env.SLACK_CLIENT_SECRET) {
    res.status(400).json({ error: 'Slack OAuth configuration or authorization code is missing' });
    return;
  }
  try {
    const tokenResponse = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: env.SLACK_CLIENT_ID, client_secret: env.SLACK_CLIENT_SECRET, redirect_uri: env.SLACK_REDIRECT_URI }),
    });
    const tokenData = await tokenResponse.json() as {
      ok?: boolean; error?: string; team?: { id?: string; name?: string };
      incoming_webhook?: { url?: string; channel_id?: string; channel?: string };
    };
    if (!tokenResponse.ok || !tokenData.ok || !tokenData.incoming_webhook?.url) {
      res.status(502).json({ error: `Slack connection failed: ${tokenData.error ?? tokenResponse.statusText}` });
      return;
    }
    await prisma.user.update({
      where: { id: userId },
      data: {
        slackWebhookUrl: tokenData.incoming_webhook.url,
        slackTeamId: tokenData.team?.id ?? null,
        slackTeamName: tokenData.team?.name ?? null,
      },
    });
    res.redirect(`${env.FRONTEND_ORIGIN}/settings?slack=connected`);
  } catch (error) { next(error); }
});

slackRouter.get('/connection', async (req, res, next) => {
  if (!req.session.userId) { res.status(401).json({ error: 'Authentication required' }); return; }
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.session.userId },
      select: { slackWebhookUrl: true, slackTeamId: true, slackTeamName: true },
    });
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }
    res.json({ connected: Boolean(user.slackWebhookUrl), teamId: user.slackTeamId, teamName: user.slackTeamName });
  } catch (error) { next(error); }
});

slackRouter.delete('/connection', async (req, res, next) => {
  if (!req.session.userId) { res.status(401).json({ error: 'Authentication required' }); return; }
  try {
    await prisma.user.update({ where: { id: req.session.userId }, data: { slackWebhookUrl: null, slackTeamId: null, slackTeamName: null } });
    res.status(204).end();
  } catch (error) { next(error); }
});
