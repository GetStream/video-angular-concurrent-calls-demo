import { ChangeDetectionStrategy, Component, computed, effect, input } from '@angular/core';
import type { CallClosedCaption } from '@stream-io/video-client';
import type { CallFacade } from '../../../core/stream/call-facade';

/** Matches the SDK's own defaults; spelled out so the trade-off is visible. */
const CAPTION_SETTINGS = { visibilityDurationMs: 2700, maxVisibleCaptions: 2 };

/**
 * The live caption feed, for everyone in the call.
 *
 * `closedCaptions()` is a rolling window that the SDK trims for us - it drops captions once
 * they are older than `visibilityDurationMs` and keeps at most `maxVisibleCaptions`. So this
 * renders the array as it is and never accumulates: there is no scrollback to manage, and no
 * timer of our own to get wrong.
 */
@Component({
  selector: 'app-captions-overlay',
  imports: [],
  template: `
    @if (captions().length) {
      <div class="captions" role="status" aria-live="polite">
        @for (caption of captions(); track caption.start_time + caption.speaker_id) {
          <p class="captions__line">
            <span class="captions__who">{{ speaker(caption) }}</span>
            {{ caption.text }}
          </p>
        }
      </div>
    }
  `,
  styles: `
    :host {
      position: absolute;
      left: 50%;
      bottom: 0.75rem;
      transform: translateX(-50%);
      width: min(46rem, calc(100% - 2rem));
      pointer-events: none;
      z-index: 10;
    }

    .captions {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      padding: 0.5rem 0.75rem;
      border-radius: 0.5rem;
      background: rgb(8 10 12 / 82%);
    }

    .captions__line {
      margin: 0;
      color: var(--mat-sys-on-surface);
      font: var(--mat-sys-body-medium);
      text-wrap: balance;
    }

    .captions__who {
      color: var(--mat-sys-primary);
      font-weight: 700;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CaptionsOverlay {
  readonly call = input.required<CallFacade>();

  protected readonly captions = computed(() => this.call().closedCaptions());

  constructor() {
    // Configuring a non-signal API from signal state is what effects are for.
    effect(() => this.call().call.updateClosedCaptionSettings(CAPTION_SETTINGS));
  }

  /**
   * Captions carry a `speaker_id`, not a name, so it is resolved against the participant
   * list - falling back to the id for someone who has already left mid-sentence.
   */
  protected speaker(caption: CallClosedCaption): string {
    const participant = this.call()
      .participants()
      .find((p) => p.userId === caption.speaker_id);
    return participant?.name || caption.speaker_id;
  }
}
