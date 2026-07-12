import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID, REQUEST, Service, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

export interface SessionUser {
  email: string;
  name: string;
  picture?: string;
  exp: number;
}

declare const google: {
  accounts: {
    id: {
      initialize(config: object): void;
      renderButton(host: HTMLElement, options: object): void;
      disableAutoSelect(): void;
    };
  };
};

/**
 * The credential lives in a cookie (not sessionStorage) so the server sees
 * the session too: SSR renders the editor or the sign-in page directly,
 * with no client-side redirect flash.
 */
const COOKIE = 'nitpick.credential';

const readCookie = (cookies: string | null | undefined): string | null => {
  const match = cookies?.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
};

const decodeUser = (credential: string | null): SessionUser | null => {
  if (!credential) return null;
  try {
    const claims = JSON.parse(
      atob(credential.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')),
    ) as SessionUser;
    return claims.exp * 1000 > Date.now() ? claims : null;
  } catch {
    return null;
  }
};

let gisLoaded: Promise<void> | undefined;

const loadGis = () =>
  (gisLoaded ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load Google Sign-In'));
    document.head.append(script);
  }));

@Service()
export class Auth {
  private readonly router = inject(Router);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly request = inject(REQUEST, { optional: true });
  private readonly credential = signal<string | null>(
    readCookie(this.isBrowser ? document.cookie : this.request?.headers.get('cookie')),
  );

  /** Decoded Google identity, or null when signed out / token expired. */
  readonly user = computed(() => decodeUser(this.credential()));

  idToken(): string | null {
    return this.credential();
  }

  /** Renders the "Sign in with Google" button; resolves the session on tap. */
  async renderButton(host: HTMLElement, clientId: string): Promise<void> {
    await loadGis();
    google.accounts.id.initialize({
      client_id: clientId,
      callback: ({ credential }: { credential: string }) => {
        const secure = location.protocol === 'https:' ? '; secure' : '';
        document.cookie = `${COOKIE}=${encodeURIComponent(credential)}; path=/; max-age=3600; samesite=lax${secure}`;
        this.credential.set(credential);
        void this.router.navigateByUrl('/');
      },
    });
    google.accounts.id.renderButton(host, { theme: 'outline', size: 'large', shape: 'pill' });
  }

  signOut(): void {
    document.cookie = `${COOKIE}=; path=/; max-age=0`;
    this.credential.set(null);
    if (typeof google !== 'undefined') google.accounts.id.disableAutoSelect();
    void this.router.navigateByUrl('/signin');
  }
}
