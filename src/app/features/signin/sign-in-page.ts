import { Component, afterNextRender, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';

import { environment } from '../../../environments/environment';
import { Auth } from '../../core/auth';
import { LintApi } from '../../core/lint-api';

@Component({
  selector: 'nit-sign-in-page',
  imports: [MatButtonModule, MatCardModule, MatIconModule],
  template: `
    <main>
      <mat-card appearance="outlined">
        <mat-card-header>
          <mat-icon mat-card-avatar>spellcheck</mat-icon>
          <mat-card-title>Nitpicker</mat-card-title>
          <mat-card-subtitle>Prose linting with Gemini</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          <p>Sign in with your Google account to continue.</p>
          @if (error()) {
            <p class="error">{{ error() }}</p>
          }
        </mat-card-content>
        <mat-card-actions>
          <button matButton="filled" [disabled]="!ready()" (click)="signIn()">
            <mat-icon>login</mat-icon>
            Sign in with Google
          </button>
        </mat-card-actions>
      </mat-card>
    </main>
  `,
  styles: `
    main {
      min-height: 100dvh;
      display: grid;
      place-items: center;
      background: var(--mat-sys-surface-container);
    }
    mat-card {
      width: min(26rem, 90vw);
      padding: 0.5rem;
    }
    .error {
      color: var(--mat-sys-error);
    }
  `,
})
export class SignInPage {
  private readonly auth = inject(Auth);
  private readonly api = inject(LintApi);

  protected readonly error = signal('');
  protected readonly ready = signal(false);

  constructor() {
    afterNextRender(() => void this.init());
  }

  protected signIn(): void {
    this.auth.promptSignIn();
  }

  private async init(): Promise<void> {
    try {
      // The build bakes the client ID in; the API call is only a fallback
      // for deployments configured purely through environment variables.
      const clientId = environment.googleClientId || (await this.api.clientId()).clientId;
      if (!clientId) throw new Error('missing client id');
      await this.auth.initSignIn(clientId);
      this.ready.set(true);
    } catch {
      this.error.set('Sign-in is unavailable — no OAuth client ID is configured.');
    }
  }
}
