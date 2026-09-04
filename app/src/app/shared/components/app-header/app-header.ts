import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CurrentUser } from '../../../core/auth/current-user';
import { initials } from '../../../core/models/demo-user.model';

/**
 * The app chrome: who you are, and the way out.
 *
 * Signing out disconnects both Stream clients and returns to the picker, which is the only
 * place identity is chosen - so "switch user" and "sign out" are the same action here.
 */
@Component({
  selector: 'app-header',
  imports: [MatButtonModule, MatIconModule, MatTooltipModule],
  templateUrl: './app-header.html',
  styleUrl: './app-header.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppHeader {
  /** Where you are, shown next to the app name: "Who are you?", "Lobby", "Exam call". */
  readonly context = input<string>('');

  private readonly currentUser = inject(CurrentUser);
  private readonly router = inject(Router);

  protected readonly user = this.currentUser.user;
  protected readonly initials = initials;

  protected async signOut(): Promise<void> {
    await this.currentUser.signOut();
    await this.router.navigate(['/']);
  }
}
