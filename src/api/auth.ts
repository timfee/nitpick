import type { RequestHandler } from 'express';
import { OAuth2Client, type TokenPayload } from 'google-auth-library';

import { env } from './env';

const oauth = new OAuth2Client();

/** Sliding-window rate limit so a single user can't run up the Gemini bill. */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
const recent = new Map<string, number[]>();

const rateLimited = (who: string): boolean => {
  const now = Date.now();
  const hits = (recent.get(who) ?? []).filter((t) => now - t < WINDOW_MS);
  hits.push(now);
  recent.set(who, hits);
  return hits.length > MAX_PER_WINDOW;
};

/** Verifies the bearer Google ID token in the Authorization header. */
export const requireUser: RequestHandler = async (req, res, next) => {
  if (!env.clientId) {
    res.status(500).json({ error: 'Server is missing GOOGLE_CLIENT_ID' });
    return;
  }
  const idToken = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!idToken) {
    res.status(401).json({ error: 'Missing bearer token' });
    return;
  }
  let user: TokenPayload | undefined;
  try {
    const ticket = await oauth.verifyIdToken({ idToken, audience: env.clientId });
    user = ticket.getPayload();
  } catch {
    /* fall through to 401 */
  }
  if (!user?.email) {
    res.status(401).json({ error: 'Invalid or expired credential' });
    return;
  }
  if (env.allowedDomain && user.hd !== env.allowedDomain) {
    res.status(403).json({ error: `Only ${env.allowedDomain} accounts are allowed` });
    return;
  }
  if (rateLimited(user.email)) {
    res.status(429).json({ error: 'Too many requests. Try again in a minute.' });
    return;
  }
  res.locals['user'] = user;
  next();
};
