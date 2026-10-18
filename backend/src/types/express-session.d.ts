import 'express-session';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    slackOAuthState?: string;
    csrfToken?: string;
  }
}
