import { Component, ElementRef, afterNextRender, inject, signal, viewChild } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { environment } from '../../../environments/environment';
import { Auth } from '../../core/auth';
import { LintApi } from '../../core/lint-api';

@Component({
  selector: 'nit-sign-in-page',
  imports: [MatCardModule, MatIconModule, MatProgressSpinnerModule],
  template: `
    <main>
      <mat-card appearance="outlined">
        <mat-card-header>
          <mat-icon mat-card-avatar>spellcheck</mat-icon>
          <mat-card-title>Nitpick</mat-card-title>
          <mat-card-subtitle>Prose linting with Gemini</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          <p>Sign in with Google to continue.</p>
          @if (error()) {
            <p class="error">{{ error() }}</p>
          }
          <div class="slot">
            <div #gsi></div>
            @if (!ready() && !error()) {
              <mat-spinner diameter="24" />
            }
          </div>
        </mat-card-content>
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
    .slot {
      margin-top: 1.5rem;
      min-height: 44px;
      display: grid;
      align-items: center;
      justify-items: start;
    }
    .error {
      color: var(--mat-sys-error);
    }
  `,
})
export class SignInPage {
  private readonly auth = inject(Auth);
  private readonly api = inject(LintApi);
  private readonly gsiHost = viewChild.required<ElementRef<HTMLElement>>('gsi');

  protected readonly error = signal('');
  protected readonly ready = signal(false);

  constructor() {
    afterNextRender(() => void this.init());
  }

  private async init(): Promise<void> {
    try {
      // The build bakes the client ID in; the API call is only a fallback
      // for deployments configured purely through environment variables.
      const clientId = environment.googleClientId || (await this.api.clientId()).clientId;
      if (!clientId) throw new Error('missing client id');
      await this.auth.renderButton(this.gsiHost().nativeElement, clientId);
      this.ready.set(true);
    } catch {
      this.error.set('Sign-in is unavailable — no OAuth client ID is configured.');
    }
  }
}
