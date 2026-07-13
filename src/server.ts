import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { join } from 'node:path';

import { apiRouter } from './api/router';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine({
  // Cloud Run's default domains work out of the box; add custom domains via
  // a comma-separated NG_ALLOWED_HOSTS env var.
  allowedHosts: [
    'localhost',
    '127.0.0.1',
    '*.run.app',
    ...(process.env['NG_ALLOWED_HOSTS']?.split(',').map((h) => h.trim()) ?? []),
  ],
  // Cloud Run's front end sets X-Forwarded-*, so the server trusts it.
  trustProxyHeaders: true,
});

app.set('trust proxy', true); // Cloud Run sits behind a proxy
app.use('/api', apiRouter);

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
    setHeaders: (res, path) => {
      // fonts.css keeps a stable name but its content changes whenever the
      // icon subset regenerates, so it must revalidate rather than sit in caches
      // for a year. The woff2 files it points at are content-hashed.
      if (path.endsWith('fonts.css')) res.setHeader('Cache-Control', 'no-cache');
    },
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) => (response ? writeResponseToNodeResponse(response, res) : next()))
    .catch(next);
});

/**
 * Starts the server when this module is the main entry point or runs under
 * PM2. The port comes from the `PORT` environment variable and defaults
 * to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] ?? 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
