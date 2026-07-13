import { Component, ElementRef, afterNextRender, inject, signal, viewChild } from '@angular/core';
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
          <img mat-card-avatar src="favicon.svg" alt="" />
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
          <!--
            Our button is the visual; Google's real button sits transparently
            on top and receives the click — the only reliable way to open the
            sign-in popup.
          -->
          <div class="signin" [class.ready]="ready()">
            <button matButton="filled" tabindex="-1" aria-hidden="true" [disabled]="!ready()">
              <mat-icon>login</mat-icon>
              Sign in with Google
            </button>
            <div class="gsi" #gsi></div>
          </div>
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
    .signin {
      position: relative;
      display: inline-block;

      button {
        white-space: nowrap;
        pointer-events: none;
      }

      .gsi {
        position: absolute;
        inset: 0;
        overflow: hidden;
        opacity: 0.001;
        cursor: pointer;
      }

      &:not(.ready) .gsi {
        pointer-events: none;
      }
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
      // The build bakes the client ID in for most deployments. The API call
      // is a fallback for setups configured purely through environment variables.
      const clientId = environment.googleClientId || (await this.api.config()).clientId;
      if (!clientId) throw new Error('missing client id');
      await this.auth.renderButton(this.gsiHost().nativeElement, clientId);
      this.ready.set(true);
    } catch (err) {
      console.error('Google sign-in unavailable: missing OAuth client ID', err);
      this.error.set(
        "Sign-in isn't available right now — this deployment is missing its Google sign-in configuration.",
      );
    }
  }
}
