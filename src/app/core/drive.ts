import { Service, inject, signal } from '@angular/core';

import { environment } from '../../environments/environment';
import { loadGis } from './gis';
import { LintApi } from './lint-api';

/** Per-file grants only, never `drive.readonly` or the broad `drive` scope. */
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

/** Matches the export cap called out in the brief: refuse anything bigger. */
const EXPORT_LIMIT_BYTES = 10 * 1024 * 1024;

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface TokenErrorResponse {
  type: string;
  message?: string;
}

interface TokenClient {
  requestAccessToken(overrideConfig?: { prompt?: string }): void;
}

declare const google: {
  accounts: {
    oauth2: {
      initTokenClient(config: {
        client_id: string;
        scope: string;
        callback: (response: TokenResponse) => void;
        error_callback?: (error: TokenErrorResponse) => void;
      }): TokenClient;
    };
  };
};

/** Thrown internally to trigger the one-shot cached-token retry. */
class UnauthorizedError extends Error {}

interface CachedToken {
  value: string;
  /** Epoch ms. The cache refreshes a little early to dodge the real expiry. */
  expiresAt: number;
}

/**
 * Runs every Drive call in the browser with a user-granted OAuth access
 * token, never the ID token used for our own API, and never anything sent
 * to our server. All entry points are menu clicks, so `requestAccessToken`
 * always runs from a user gesture, which GIS requires for the consent popup.
 */
@Service()
export class Drive {
  private readonly api = inject(LintApi);

  private tokenClient: TokenClient | undefined;
  private cached: CachedToken | undefined;
  /** Swapped in per request, since GIS fixes the callback at `initTokenClient` time. */
  private pending: ((response: TokenResponse) => void) | undefined;

  private readonly openDoc = signal<{ fileId: string; name: string } | null>(null);
  /** The Doc last opened or saved, so "Save to Google Drive" updates it in place. */
  readonly remembered = this.openDoc.asReadonly();

  /** Called after a successful open or a first-time save. */
  remember(fileId: string, name: string): void {
    this.openDoc.set({ fileId, name });
  }

  private async clientId(): Promise<string> {
    return environment.googleClientId || (await this.api.config()).clientId;
  }

  private async ensureTokenClient(): Promise<TokenClient> {
    if (this.tokenClient) return this.tokenClient;
    await loadGis();
    const client_id = await this.clientId();
    if (!client_id) throw new Error('Google sign-in is not configured');
    this.tokenClient = google.accounts.oauth2.initTokenClient({
      client_id,
      scope: DRIVE_SCOPE,
      callback: (response) => this.pending?.(response),
      error_callback: (error) =>
        this.pending?.({ error: error.type, error_description: error.message }),
    });
    return this.tokenClient;
  }

  private requestAccessToken(): Promise<string> {
    return new Promise((resolve, reject) => {
      void this.ensureTokenClient().then((client) => {
        this.pending = (response) => {
          this.pending = undefined;
          if (response.error || !response.access_token) {
            reject(new Error(response.error_description ?? response.error ?? 'Sign-in did not complete'));
            return;
          }
          this.cached = {
            value: response.access_token,
            // Refresh 30s before the real expiry so a slow request never races it.
            expiresAt: Date.now() + (response.expires_in ?? 3600) * 1000 - 30_000,
          };
          resolve(response.access_token);
        };
        client.requestAccessToken();
      }, reject);
    });
  }

  /** A cached unexpired token, or a fresh one via the consent popup. */
  private async accessToken(): Promise<string> {
    if (this.cached && this.cached.expiresAt > Date.now()) return this.cached.value;
    return this.requestAccessToken();
  }

  /**
   * Public alias for {@link Drive.accessToken}. The Google Picker also needs
   * a bearer token to list the files it shows. Because the picker lives in
   * a separate service, the cached getter can't stay entirely private.
   */
  async requestToken(): Promise<string> {
    return this.accessToken();
  }

  /** GET …/export?mimeType=text/markdown, retrying once on a stale token. */
  async exportDocAsMarkdown(fileId: string): Promise<string> {
    return this.withAuthRetry((token) => this.doExport(fileId, token));
  }

  private async doExport(fileId: string, token: string): Promise<string> {
    const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=text/markdown`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401) throw new UnauthorizedError();
    if (!res.ok) throw new Error(`Drive export failed (${res.status})`);
    return readCapped(res, EXPORT_LIMIT_BYTES);
  }

  /**
   * Multipart create (`fileId` absent) or update. Hand-built body with an
   * explicit boundary, deliberately avoiding `FormData`, which Drive's
   * multipart/related upload doesn't accept.
   */
  async saveMarkdownAsDoc(name: string, markdown: string, fileId?: string): Promise<string> {
    return this.withAuthRetry((token) => this.doSave(name, markdown, fileId, token));
  }

  private async doSave(
    name: string,
    markdown: string,
    fileId: string | undefined,
    token: string,
  ): Promise<string> {
    const boundary = `nitpick-${Math.random().toString(36).slice(2)}`;
    const metadata = { name, mimeType: 'application/vnd.google-apps.document' };
    const body =
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: text/markdown\r\n\r\n` +
      `${markdown}\r\n` +
      `--${boundary}--`;

    const base = 'https://www.googleapis.com/upload/drive/v3/files';
    const url = fileId
      ? `${base}/${encodeURIComponent(fileId)}?uploadType=multipart`
      : `${base}?uploadType=multipart`;
    const res = await fetch(url, {
      method: fileId ? 'PATCH' : 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    });
    if (res.status === 401) throw new UnauthorizedError();
    if (!res.ok) throw new Error(`Drive save failed (${res.status})`);
    const json = (await res.json()) as { id: string };
    return json.id;
  }

  private async withAuthRetry<T>(fn: (token: string) => Promise<T>): Promise<T> {
    const token = await this.accessToken();
    try {
      return await fn(token);
    } catch (err) {
      if (!(err instanceof UnauthorizedError)) throw err;
      this.cached = undefined;
      const fresh = await this.accessToken();
      return fn(fresh);
    }
  }
}

/** Reads `res.body` in chunks, aborting once the payload crosses `limit` bytes. */
async function readCapped(res: Response, limit: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) {
    // No streaming body (some test and runtime environments), so fall back.
    const text = await res.text();
    if (new Blob([text]).size > limit) throw new Error('Document is too large to import (10MB limit)');
    return text;
  }
  const decoder = new TextDecoder();
  let text = '';
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new Error('Document is too large to import (10MB limit)');
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return text;
}
