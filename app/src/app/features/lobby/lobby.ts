import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AppHeader } from '../../shared/components/app-header/app-header';

/** Placeholder: built in a later step. */
@Component({
  selector: 'app-lobby',
  imports: [AppHeader],
  template: `
    <div class="placeholder">
      <app-header context="Lobby" />
      <main><h1>Lobby</h1><p>Not built yet.</p></main>
    </div>
  `,
  styles: `
    .placeholder {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      min-height: 100vh;
      padding: 1.5rem;
      box-sizing: border-box;
    }
    h1 {
      font: var(--mat-sys-headline-medium);
      margin: 0 0 0.5rem;
    }
    p {
      font: var(--mat-sys-body-medium);
      color: var(--mat-sys-on-surface-variant);
      margin: 0;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Lobby {}
