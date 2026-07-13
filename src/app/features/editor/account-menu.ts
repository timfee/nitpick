import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';

import { Auth } from '../../core/auth';

@Component({
  selector: 'nit-account-menu',
  imports: [MatButtonModule, MatDividerModule, MatIconModule, MatMenuModule],
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
      <mat-divider />
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
      // mat-icon-button is display:inline-block and centers its default 24px
      // icon via padding math + baseline vertical-align — fine for mat-icon,
      // but the 28px avatar image needs true centering, hence the flex box.
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .avatar {
      width: 28px;
      height: 28px;
      border-radius: 50%;
    }
    .menu-user {
      display: flex;
      flex-direction: column;
      padding: 0.5rem 1rem;
      small {
        color: var(--mat-sys-on-surface-variant);
      }
    }
    // On dark surfaces outline-variant drops to near-zero contrast and the
    // divider under the account name/email disappears; outline keeps it legible.
    @media (prefers-color-scheme: dark) {
      mat-divider {
        --mat-divider-color: var(--mat-sys-outline);
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
