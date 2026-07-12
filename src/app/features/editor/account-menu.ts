import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';

import { Auth } from '../../core/auth';

@Component({
  selector: 'nit-account-menu',
  imports: [MatButtonModule, MatIconModule, MatMenuModule],
  template: `
    <button matIconButton class="account" aria-label="Account" [matMenuTriggerFor]="menu">
      @if (user()?.picture; as picture) {
        <img class="avatar" [src]="picture" alt="" referrerpolicy="no-referrer" />
      } @else {
        <mat-icon>account_circle</mat-icon>
      }
    </button>
    <mat-menu #menu>
      <div class="menu-user">
        <strong>{{ user()?.name }}</strong>
        <small>{{ user()?.email }}</small>
      </div>
      <button mat-menu-item (click)="signOut()">
        <mat-icon>logout</mat-icon>
        Sign out
      </button>
    </mat-menu>
  `,
  styles: `
    :host {
      display: contents;
    }
    .account {
      position: relative;
    }
    .avatar {
      position: absolute;
      inset: 0;
      margin: auto;
      width: 28px;
      height: 28px;
      border-radius: 50%;
    }
    .menu-user {
      display: flex;
      flex-direction: column;
      padding: 0.5rem 1rem;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
      small {
        color: var(--mat-sys-on-surface-variant);
      }
    }
  `,
})
export class AccountMenu {
  private readonly auth = inject(Auth);

  protected readonly user = this.auth.user;

  protected signOut(): void {
    this.auth.signOut();
  }
}
