/**
 * Production resource set. Values here are safe to ship to the browser;
 * secrets stay out. Server-side, environment variables always win — see
 * src/api/env.ts.
 */
export const environment = {
  /** Cloud Run service name for this resource set. */
  service: 'nitpick',
  /** Google Cloud project shared by all resource sets. */
  project: 'nitpick-6an5rp',
  region: 'us-central1',
  /** OAuth web client ID for Sign in with Google. */
  googleClientId: '204060019607-fl1ehebdji768hn3t7o2h0ngmalp4ha4.apps.googleusercontent.com',
  /**
   * Public, referrer-restricted browser key for the Google Picker (Drive file
   * chooser) only. Not a secret — restricted by HTTP referrer in Cloud
   * Console, safe to ship. Leave blank to hide the Drive menu items.
   */
  googleApiKey: '',
  geminiModel: 'gemini-3-flash-preview',
  vertexLocation: 'global',
};
