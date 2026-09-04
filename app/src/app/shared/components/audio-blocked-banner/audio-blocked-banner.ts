import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

/**
 * The browser refused to play the call's audio until someone clicks something.
 *
 * Autoplay policy is per-document, but the SDK tracks the blocked state per `Call` and
 * `resumeAudio()` is a per-`Call` method - so a proctor, who holds two calls, needs the
 * banner if *either* is blocked and both resumed from the one click. Resuming has to happen
 * inside the gesture handler, which is why this is a button and not something automatic.
 */
@Component({
  selector: 'app-audio-blocked-banner',
  imports: [MatButtonModule, MatIconModule],
  template: `
    @if (blocked()) {
      <div class="banner" role="alert">
        <mat-icon>volume_off</mat-icon>
        <span>Your browser blocked the call's audio.</span>
        <button matButton="filled" type="button" class="banner__action" (click)="resume.emit()">
          Enable sound
        </button>
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
      background: #3d3320;
      color: #f7e5bf;
      font: var(--mat-sys-label-large);
    }

    .banner__action {
      margin-left: auto;
    }

    mat-icon {
      width: 1.125rem;
      height: 1.125rem;
      font-size: 1.125rem;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AudioBlockedBanner {
  readonly blocked = input.required<boolean>();
  readonly resume = output<void>();
}
