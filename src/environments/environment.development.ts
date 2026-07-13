/** Development resource set: same project as production, separate service. */
export const environment = {
  service: 'nitpick-dev',
  project: 'nitpick-6an5rp',
  region: 'us-central1',
  googleClientId: '204060019607-fl1ehebdji768hn3t7o2h0ngmalp4ha4.apps.googleusercontent.com',
  /**
   * Public, referrer-restricted browser key for the Google Picker (Drive file
   * chooser) only. Not a secret: the HTTP referrer restriction in Cloud
   * Console makes it safe to publish. Leave blank to hide the Drive menu
   * items.
   */
  googleApiKey: '',
  geminiModel: 'gemini-3-flash-preview',
  vertexLocation: 'global',
};
