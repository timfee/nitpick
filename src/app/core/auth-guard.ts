import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { Auth } from './auth';

/**
 * The session cookie is visible on both server and browser, so these run
 * identically on both: SSR responds with the right page (or an HTTP
 * redirect) on the first byte — no client-side redirect flash.
 */
export const signedInGuard: CanActivateFn = () =>
  inject(Auth).user() ? true : inject(Router).parseUrl('/signin');

export const signedOutGuard: CanActivateFn = () =>
  inject(Auth).user() ? inject(Router).parseUrl('/') : true;
