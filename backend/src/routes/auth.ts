import { Router } from 'express';
import passport from 'passport';
import { Strategy as GoogleStrategy, Profile } from 'passport-google-oauth20';
import { env } from '../config/env';
import { prisma } from '../db/prisma';

export const authRouter = Router();

if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    callbackURL: env.GOOGLE_CALLBACK_URL,
    state: true,
  }, async (_accessToken, _refreshToken, profile: Profile, done) => {
    try {
      const email = profile.emails?.[0]?.value?.toLowerCase();
      if (!email) return done(new Error('Google profile did not include an email address'));
      const avatarUrl = profile.photos?.[0]?.value ?? null;
      const user = await prisma.user.upsert({
        where: { googleId: profile.id },
        create: {
          googleId: profile.id,
          email,
          name: profile.displayName || email,
          avatarUrl,
        },
        update: { email, name: profile.displayName || email, avatarUrl },
      });
      done(null, user);
    } catch (error) { done(error as Error); }
  }));
}

authRouter.get('/google', (req, res, next) => {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    res.status(503).json({ error: 'Google OAuth is not configured' });
    return;
  }
  passport.authenticate('google', { scope: ['profile', 'email'], session: true })(req, res, next);
});

authRouter.get('/google/callback', (req, res, next) => {
  passport.authenticate('google', (error: unknown, user: Express.User | false) => {
    if (error || !user) {
      res.status(401).json({ error: error instanceof Error ? error.message : 'Google authentication failed' });
      return;
    }
    req.logIn(user, (loginError) => {
      if (loginError) { next(loginError); return; }
      req.session.userId = (user as { id: string }).id;
      res.redirect(`${env.FRONTEND_ORIGIN}/dashboard`);
    });
  })(req, res, next);
});
