import { isPlatformServer } from '@angular/common';
import { PLATFORM_ID, inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { Auth } from './auth';

/**
 * SSR renders the shell unconditionally (there is no session on the server);
 * the guard re-runs in the browser during hydration and redirects if needed.
 */
export const authGuard: CanActivateFn = () => {
  if (isPlatformServer(inject(PLATFORM_ID))) return true;
  return inject(Auth).user() ? true : inject(Router).parseUrl('/signin');
};
