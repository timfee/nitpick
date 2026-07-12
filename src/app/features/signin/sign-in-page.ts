import { Component, ElementRef, afterNextRender, inject, signal, viewChild } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';

import { Auth } from '../../core/auth';
import { LintApi } from '../../core/lint-api';

@Component({
  selector: 'nit-sign-in-page',
  imports: [MatCardModule, MatIconModule],
  template: `
    <main class="wrap">
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
          <div class="gsi" #gsi></div>
        </mat-card-content>
      </mat-card>
    </main>
  `,
  styles: `
    .wrap {
      min-height: 100dvh;
      display: grid;
      place-items: center;
      background: var(--mat-sys-surface-container);
    }
    mat-card {
      width: min(26rem, 90vw);
      padding: 0.5rem;
    }
    .gsi {
      margin-top: 1.5rem;
      min-height: 44px;
    }
    .error {
      color: var(--mat-sys-error);
    }
  `,
})
export class SignInPage {
  private readonly auth = inject(Auth);
  private readonly api = inject(LintApi);
  private readonly router = inject(Router);
  private readonly gsiHost = viewChild.required<ElementRef<HTMLElement>>('gsi');

  protected readonly error = signal('');

  constructor() {
    afterNextRender(() => void this.init());
  }

  private async init(): Promise<void> {
    if (this.auth.user()) {
      void this.router.navigateByUrl('/');
      return;
    }
    try {
      const { clientId } = await this.api.clientId();
      if (!clientId) throw new Error();
      await this.auth.renderButton(this.gsiHost().nativeElement, clientId);
    } catch {
      this.error.set('Sign-in is unavailable — is GOOGLE_CLIENT_ID configured on the server?');
    }
  }
}
