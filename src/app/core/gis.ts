/**
 * Loads the Google Identity Services script exactly once. Both sign-in
 * (`google.accounts.id`) and Drive's OAuth token client
 * (`google.accounts.oauth2`) arrive in the same `gsi/client` bundle, so
 * `Auth` and `Drive` share this loader rather than each racing to inject
 * their own `<script>` tag.
 */
let gisLoaded: Promise<void> | undefined;

export const loadGis = (): Promise<void> =>
  (gisLoaded ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Sign-In'));
    document.head.append(script);
  }));
