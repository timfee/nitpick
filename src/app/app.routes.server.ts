import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // Static shell, rendered once at build time.
  { path: 'signin', renderMode: RenderMode.Prerender },
  // Everything else is server-rendered per request.
  { path: '**', renderMode: RenderMode.Server },
];
