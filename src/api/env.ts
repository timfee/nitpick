import { environment } from '../environments/environment';

const first = (...values: (string | undefined)[]) => values.find((value) => !!value);

/**
 * Runtime configuration — no key files, ADC only. Environment variables win;
 * the environment.ts resource set provides the defaults, so a plain
 * `npm start` or `docker run` works with nothing but GOOGLE_CLIENT_ID set
 * (or not even that, once it's filled in environment.ts).
 */
export const env = {
  /** OAuth 2.0 web client ID used for Sign in with Google. */
  clientId: first(process.env['GOOGLE_CLIENT_ID'], environment.googleClientId) ?? '',
  /** Public, referrer-restricted browser key for the Google Picker. Optional. */
  apiKey: first(process.env['GOOGLE_API_KEY'], environment.googleApiKey) ?? '',
  /** Vertex AI (Agent Platform) model to lint with. */
  model: first(process.env['GEMINI_MODEL'], environment.geminiModel) ?? 'gemini-2.5-flash',
  /** Vertex AI location; `global` routes to the nearest capacity. */
  location: first(process.env['VERTEX_LOCATION'], environment.vertexLocation) ?? 'global',
  /** Falls back to ADC metadata when unset everywhere. */
  project: first(process.env['GOOGLE_CLOUD_PROJECT'], environment.project),
  /** Optional Workspace domain (`hd` claim) allow-list, for example `example.com`. */
  allowedDomain: process.env['ALLOWED_DOMAIN'],
};
