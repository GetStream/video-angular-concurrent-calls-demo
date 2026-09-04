import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Same thresholds Stream's own reference app uses. */
const GOOD_MS = 100;
const OK_MS = 400;

/**
 * Publisher round-trip time, in milliseconds.
 *
 * Reads from the stats report, which the SDK only collects while something is subscribed to
 * `callStatsReport$` - `CallFacade` subscribes unconditionally for this reason. A lazily
 * subscribed badge would silently read zero forever.
 */
@Component({
  selector: 'app-latency-badge',
  imports: [],
  template: `
    @if (ms() > 0) {
      <span class="rtt" [class]="'rtt--' + level()" title="Round-trip time to the server">
        {{ ms() }} ms
      </span>
    }
  `,
  styles: `
    :host {
      display: contents;
    }

    .rtt {
      color: #8d949c;
      font: var(--mat-sys-label-small);
      font-variant-numeric: tabular-nums;
    }

    .rtt--ok {
      color: #e0c26f;
    }

    .rtt--bad {
      color: #f0b3b3;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LatencyBadge {
  readonly ms = input.required<number>();

  protected readonly level = computed(() => {
    const ms = this.ms();
    if (ms <= GOOD_MS) return 'good';
    if (ms <= OK_MS) return 'ok';
    return 'bad';
  });
}
