import { RenderMode, type ServerRoute } from '@angular/ssr';

// Rendered per request, so the smoke run exercises the SSR runtime (not a build-time prerender).
export const serverRoutes: ServerRoute[] = [{ path: '**', renderMode: RenderMode.Server }];
