import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { CurrentUser } from './current-user';
import { VideoClient } from '../stream/video-client';

/**
 * Routes past the picker need a connected user.
 *
 * On a refresh the user is restored from sessionStorage but the clients are gone, so
 * reconnect before allowing the route. Any deep-link query params (`?call_id=`) are carried
 * through the redirect so the picker can hand you back to where you were going.
 */
export const requireUser: CanActivateFn = async (_route, state) => {
  const currentUser = inject(CurrentUser);
  const video = inject(VideoClient);
  const router = inject(Router);

  const user = currentUser.restore();
  if (!user) {
    return router.createUrlTree(['/'], { queryParams: queryParamsOf(state.url) });
  }

  if (!video.connected() && !(await currentUser.signIn(user))) {
    return router.createUrlTree(['/'], { queryParams: queryParamsOf(state.url) });
  }

  return true;
};

function queryParamsOf(url: string): Record<string, string> {
  const query = url.split('?')[1];
  return query ? Object.fromEntries(new URLSearchParams(query)) : {};
}
