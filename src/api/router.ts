import { Router, json, type ErrorRequestHandler } from 'express';
import { z } from 'zod';

import { LintRequestSchema } from '../shared/lint';
import { requireUser } from './auth';
import { env } from './env';
import { lintText } from './lint';

export const apiRouter: Router = Router();

apiRouter.get('/config', (_req, res) => {
  res.json({ clientId: env.clientId });
});

apiRouter.post('/lint', json({ limit: '256kb' }), requireUser, async (req, res) => {
  const parsed = LintRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: z.prettifyError(parsed.error) });
    return;
  }
  res.json(await lintText(parsed.data.text));
});

// Express 5 forwards rejected promises here automatically. The four-argument
// signature is what marks this as an error handler.
const onError: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  console.error('[api]', err);
  res.status(502).json({ error: 'Lint request failed — check server logs' });
};
apiRouter.use(onError);
