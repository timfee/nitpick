/**
 * Production resource set. Values here are safe to ship to the browser;
 * secrets stay out. Server-side, environment variables always win — see
 * src/api/env.ts.
 */
export const environment = {
  production: true,
  /** Cloud Run service name for this resource set. */
  service: 'nitpick',
  /** Google Cloud project shared by all resource sets. */
  project: 'nitpick-6an5rp',
  region: 'us-central1',
  /** OAuth web client ID for Sign in with Google. */
  googleClientId: '',
  geminiModel: 'gemini-2.5-flash',
  vertexLocation: 'global',
};
