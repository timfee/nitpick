import { Routes } from '@angular/router';

import { authGuard } from './core/auth-guard';

export const routes: Routes = [
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./features/editor/editor-page').then((m) => m.EditorPage),
  },
  {
    path: 'signin',
    loadComponent: () => import('./features/signin/sign-in-page').then((m) => m.SignInPage),
  },
  { path: '**', redirectTo: '' },
];
