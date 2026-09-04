import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AppHeader } from '../../shared/components/app-header/app-header';
import { DemoConfig } from '../../core/config/demo-config';
import { CurrentUser } from '../../core/auth/current-user';
import { initials, type DemoUser } from '../../core/models/demo-user.model';

/**
 * The first screen: pick who you are.
 *
 * There is no sign-in. The cast is seeded server-side by `npm run setup`, and picking a
 * user here *is* the whole identity step - it replaces the `?user_id` you would otherwise
 * pass around. The role rides along with the user and settles everything downstream: a
 * proctor can create calls, a student can only join one they are a member of.
 */
@Component({
  selector: 'app-user-select',
  imports: [MatButtonModule, MatIconModule, MatProgressSpinnerModule, AppHeader],
  templateUrl: './user-select.html',
  styleUrl: './user-select.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserSelect {
  /**
   * Bound from the query string by `withComponentInputBinding()`. A student arriving on a
   * call link lands here first, so the id has to survive the detour to the lobby.
   */
  readonly callId = input<string | undefined>(undefined, { alias: 'call_id' });

  private readonly config = inject(DemoConfig);
  private readonly currentUser = inject(CurrentUser);
  private readonly router = inject(Router);

  protected readonly proctors = this.config.proctors;
  protected readonly students = this.config.students;
  protected readonly initials = initials;

  /** Pre-selected so the common path is a single click, as drawn in the wireframe. */
  private readonly picked = signal<DemoUser | null>(
    this.currentUser.restore() ?? this.config.proctors()[0] ?? null,
  );
  protected readonly selected = this.picked.asReadonly();
  protected readonly connecting = signal(false);

  protected readonly ctaLabel = computed(() => {
    const user = this.picked();
    return user ? `Continue as ${user.id}` : 'Pick a user to continue';
  });

  protected isSelected(user: DemoUser): boolean {
    return this.picked()?.id === user.id;
  }

  protected pick(user: DemoUser): void {
    this.picked.set(user);
  }

  protected async continueAs(): Promise<void> {
    const user = this.picked();
    if (!user || this.connecting()) return;

    this.connecting.set(true);
    // Connects both the video and chat clients. On failure it reports through Notifier,
    // which the app shell renders in place of this screen, so there is nothing to do here
    // but stop the spinner and let the user try again.
    const ok = await this.currentUser.signIn(user);
    this.connecting.set(false);
    if (!ok) return;

    const callId = this.callId();
    await this.router.navigate(['/lobby'], {
      queryParams: callId ? { call_id: callId } : {},
    });
  }
}
