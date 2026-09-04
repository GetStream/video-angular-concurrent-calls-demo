import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/**
 * "This call is being recorded", for everyone in it.
 *
 * Separate from the toggle on purpose: only a proctor may *start* a recording, but everybody
 * has to be able to see that one is running - in a proctored exam that is the participant's
 * side of an obligation, not a nicety, so it is not gated on any capability.
 */
@Component({
  selector: 'app-recording-badge',
  imports: [MatIconModule],
  template: `
    @if (recording()) {
      <span class="rec" role="status">
        <mat-icon>fiber_manual_record</mat-icon>
        REC
      </span>
    }
  `,
  styles: `
    :host {
      display: contents;
    }

    .rec {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      padding: 0.1rem 0.45rem 0.1rem 0.3rem;
      border: 1px solid #d05353;
      border-radius: 999px;
      background: rgb(208 83 83 / 18%);
      color: #f0b3b3;
      font: var(--mat-sys-label-small);
      font-weight: 700;
      letter-spacing: 0.06em;
    }

    mat-icon {
      width: 0.875rem;
      height: 0.875rem;
      font-size: 0.875rem;
      animation: pulse 2s ease-in-out infinite;
    }

    @keyframes pulse {
      50% {
        opacity: 0.35;
      }
    }

    /* A blinking dot is decoration; the label carries the meaning. */
    @media (prefers-reduced-motion: reduce) {
      mat-icon {
        animation: none;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecordingBadge {
  readonly recording = input.required<boolean>();
}
