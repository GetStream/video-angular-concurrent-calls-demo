import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { CurrentUser } from './current-user';

/**
 * Proctors-only routes.
 *
 * This is the one place in the app that gates on a *role* rather than on a capability, and
 * it is worth saying why, because everywhere else the rule is the opposite: privileged
 * controls read `own_capabilities` and render themselves out of existence without the
 * capability, so the server's grants decide and the UI merely reflects them.
 *
 * That is impossible for recordings. The permission id is `list-recordings`, and it has
 * **no `OwnCapability` entry at all** - the same gap as `send-event` - so there is nothing
 * for a client to read back. A role check is therefore the only signal available on this
 * side, and it is treated as what it is: a convenience, not a control. The actual
 * enforcement is the grant, confirmed by trying it: a student's token gets
 * *"User 'student-tom' with roles ['student', 'call_member_student'] is not allowed to
 * perform action ListRecordings in scope 'video:default'"*, whether or not this guard is
 * in front of them.
 */
export const requireProctor: CanActivateFn = () => {
  const currentUser = inject(CurrentUser);
  const router = inject(Router);

  if (currentUser.restore()?.role === 'proctor') return true;
  return router.createUrlTree(['/lobby']);
};
