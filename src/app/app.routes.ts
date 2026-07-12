import { Routes } from '@angular/router';

import { signedInGuard, signedOutGuard } from './core/auth-guard';

export const routes: Routes = [
  {
    path: '',
    canActivate: [signedInGuard],
    loadComponent: () => import('./features/editor/editor-page').then((m) => m.EditorPage),
  },
  {
    path: 'signin',
    canActivate: [signedOutGuard],
    loadComponent: () => import('./features/signin/sign-in-page').then((m) => m.SignInPage),
  },
  { path: '**', redirectTo: '' },
];
