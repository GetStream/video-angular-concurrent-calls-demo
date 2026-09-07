import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { CallingState } from '@stream-io/video-client';

/**
 * What the call is doing when it is not simply connected.
 *
 * All four of these are states the SDK drives on its own - it retries, and it migrates
 * between SFUs without dropping the call - so this is a report, not a control. The one
 * exception is `RECONNECTING_FAILED`, which is terminal: the SDK has given up, and rejoining
 * is the only way forward.
 */
@Component({
  selector: 'app-connection-banner',
  imports: [MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  template: `
    @if (message(); as message) {
      <div class="banner" [class.banner--fatal]="failed()" role="status" aria-live="polite">
        @if (failed()) {
          <mat-icon>cloud_off</mat-icon>
        } @else {
          <mat-spinner diameter="16" />
        }
        <span>{{ message }}</span>

        @if (failed()) {
          <button matButton type="button" class="banner__action" (click)="recover.emit()">
            Rejoin
          </button>
        }
      </div>
    }
  `,
  styles: `
    :host {
      display: contents;
    }

    .banner {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex: none;
      padding: 0.4rem 1rem;
      background: var(--mat-sys-surface-container-high);
      color: var(--mat-sys-on-surface);
      font: var(--mat-sys-label-large);
    }

    .banner--fatal {
      background: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
    }

    .banner__action {
      margin-left: auto;
      --mat-button-text-label-text-color: var(--mat-sys-on-error-container);
    }

    mat-icon {
      width: 1.125rem;
      height: 1.125rem;
      font-size: 1.125rem;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConnectionBanner {
  readonly state = input.required<CallingState>();
  readonly recover = output<void>();

  protected readonly failed = computed(() => this.state() === CallingState.RECONNECTING_FAILED);

  protected readonly message = computed(() => {
    switch (this.state()) {
      case CallingState.OFFLINE:
        return "You're offline. The call will pick up when the network comes back.";
      case CallingState.RECONNECTING:
        return 'Reconnecting…';
      // A migration is the SFU handing the call to a better-placed server. Worth showing,
      // because video freezes for a moment and otherwise it looks like a fault.
      case CallingState.MIGRATING:
        return 'Moving to a closer server…';
      case CallingState.RECONNECTING_FAILED:
        return "Couldn't reconnect to the call.";
      default:
        return null;
    }
  });
}
