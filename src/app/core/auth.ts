import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
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

const STORAGE_KEY = 'nitpick.credential';
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

const decodeUser = (credential: string | null): SessionUser | null => {
  try {
    const claims = JSON.parse(
      atob(credential!.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')),
    );
    return claims.exp * 1000 > Date.now() ? claims : null;
  } catch {
    return null;
  }
};

@Injectable({ providedIn: 'root' })
export class Auth {
  private readonly router = inject(Router);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly credential = signal<string | null>(
    this.isBrowser ? sessionStorage.getItem(STORAGE_KEY) : null,
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
        sessionStorage.setItem(STORAGE_KEY, credential);
        this.credential.set(credential);
        this.router.navigateByUrl('/');
      },
    });
    google.accounts.id.renderButton(host, { theme: 'outline', size: 'large', shape: 'pill' });
  }

  signOut(): void {
    sessionStorage.removeItem(STORAGE_KEY);
    this.credential.set(null);
    if (typeof google !== 'undefined') google.accounts.id.disableAutoSelect();
    this.router.navigateByUrl('/signin');
  }
}
