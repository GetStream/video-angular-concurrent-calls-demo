import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { SfuModels } from '@stream-io/video-client';

const LABELS: Record<SfuModels.ConnectionQuality, string> = {
  [SfuModels.ConnectionQuality.UNSPECIFIED]: 'Connection quality unknown',
  [SfuModels.ConnectionQuality.POOR]: 'Poor connection',
  [SfuModels.ConnectionQuality.GOOD]: 'Good connection',
  [SfuModels.ConnectionQuality.EXCELLENT]: 'Excellent connection',
};

/**
 * Three bars for the SFU's verdict on a participant's connection.
 *
 * `connectionQuality` is reported by the SFU per participant, so this works for anyone in
 * the call - but a *notice* about it is only ever shown for the local participant. Ten
 * students on screen means ten chances to cry wolf about somebody else's wifi, which the
 * viewer can do nothing about; their own is the one they can act on.
 */
@Component({
  selector: 'app-network-quality',
  imports: [],
  template: `
    <span
      class="bars"
      [class]="'bars--' + level()"
      [attr.title]="label()"
      role="img"
      [attr.aria-label]="label()"
    >
      <i></i>
      <i></i>
      <i></i>
    </span>
    @if (showLabel() && level() === 'poor') {
      <span class="warn">Poor connection</span>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
    }

    .bars {
      display: inline-flex;
      align-items: flex-end;
      gap: 1.5px;
      height: 0.75rem;

      i {
        width: 3px;
        border-radius: 1px;
        background: #4a5058;

        &:nth-child(1) {
          height: 40%;
        }

        &:nth-child(2) {
          height: 70%;
        }

        &:nth-child(3) {
          height: 100%;
        }
      }
    }

    .bars--poor i:nth-child(1) {
      background: #e08a8a;
    }

    .bars--good i:nth-child(-n + 2) {
      background: #e0c26f;
    }

    .bars--excellent i {
      background: #7fc98a;
    }

    .warn {
      color: #f0b3b3;
      font: var(--mat-sys-label-small);
      font-weight: 700;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NetworkQuality {
  readonly quality = input.required<SfuModels.ConnectionQuality>();
  /** Only ever set for the local participant - see the class comment. */
  readonly showLabel = input(false);

  protected readonly level = computed(() => {
    switch (this.quality()) {
      case SfuModels.ConnectionQuality.POOR:
        return 'poor';
      case SfuModels.ConnectionQuality.GOOD:
        return 'good';
      case SfuModels.ConnectionQuality.EXCELLENT:
        return 'excellent';
      default:
        return 'unknown';
    }
  });

  protected readonly label = computed(() => LABELS[this.quality()] ?? LABELS[0]);
}
