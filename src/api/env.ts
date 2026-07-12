/** Runtime configuration, entirely environment-driven — no key files, ADC only. */
export const env = {
  /** OAuth 2.0 Web client ID used for Sign in with Google. Required. */
  clientId: process.env['GOOGLE_CLIENT_ID'] ?? '',
  /** Vertex AI model to lint with. */
  model: process.env['GEMINI_MODEL'] ?? 'gemini-2.5-flash',
  /** Vertex AI location; `global` routes to the nearest capacity. */
  location: process.env['VERTEX_LOCATION'] ?? 'global',
  /** Resolved lazily from ADC metadata when unset. */
  project: process.env['GOOGLE_CLOUD_PROJECT'],
  /** Optional Workspace domain (`hd` claim) allow-list, e.g. `example.com`. */
  allowedDomain: process.env['ALLOWED_DOMAIN'],
};
