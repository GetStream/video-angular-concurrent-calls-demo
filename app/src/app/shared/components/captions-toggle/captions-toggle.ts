import type { OnInit } from '@angular/core';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { OwnCapability } from '@stream-io/video-client';
import { Notifier } from '../../../core/errors/notifier';
import type { CallFacade } from '../../../core/stream/call-facade';

/** How long to keep the button pending if the state-change event never arrives. */
const SETTLE_TIMEOUT_MS = 20_000;

/**
 * Turn closed captions on and off for the whole call.
 *
 * This is call-wide, not per-viewer: `startClosedCaptions()` asks the server to begin
 * transcribing, so one person's toggle changes what everyone receives. The overlay that
 * renders them is separate, and every participant gets one.
 */
@Component({
  selector: 'app-captions-toggle',
  imports: [MatButtonModule, MatIconModule, MatProgressSpinnerModule, MatTooltipModule],
  template: `
    @if (canCaption()) {
      <button
        matIconButton
        type="button"
        class="ctl"
        [class.ctl--active]="captioning()"
        [disabled]="pending()"
        [matTooltip]="tooltip()"
        [attr.aria-label]="tooltip()"
        [attr.aria-pressed]="captioning()"
        (click)="toggle()"
      >
        @if (pending()) {
          <mat-spinner diameter="18" />
        } @else {
          <mat-icon>{{ captioning() ? 'closed_caption' : 'closed_caption_disabled' }}</mat-icon>
        }
      </button>
    }
  `,
  styles: `
    @use 'call-controls' as *;

    /* Shared with the control bar's own buttons - see the mixin for why it is a mixin. */
    @include icon-control;

    :host {
      display: contents;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CaptionsToggle implements OnInit {
  readonly call = input.required<CallFacade>();

  private readonly notifier = inject(Notifier);

  /**
   * Cleared by the state-change event rather than by the request resolving: the request only
   * says the server accepted the job, and putting the button back before captions are
   * actually running invites a second click.
   */
  protected readonly pending = signal(false);
  private timeout?: ReturnType<typeof setTimeout>;

  protected readonly captioning = computed(() => this.call().captioning());
  protected readonly canCaption = computed(
    () =>
      this.call().can(OwnCapability.START_CLOSED_CAPTIONS_CALL)() ||
      this.call().can(OwnCapability.STOP_CLOSED_CAPTIONS_CALL)(),
  );

  protected readonly tooltip = computed(() =>
    this.pending()
      ? 'Waiting for the server…'
      : this.captioning()
        ? 'Turn off captions'
        : 'Turn on captions',
  );

  private readonly destroyRef = inject(DestroyRef);

  /** `ngOnInit` rather than the constructor: `call` is a required input (NG8118). */
  ngOnInit(): void {
    // These are what move `captioning()`, including when another proctor toggles it.
    for (const event of ['call.closed_captions_started', 'call.closed_captions_stopped'] as const) {
      this.destroyRef.onDestroy(this.call().call.on(event, () => this.settle()));
    }

    // Transcription can fail after a successful start - a language the service cannot handle,
    // or the service itself dropping - and the request has long since resolved by then.
    this.destroyRef.onDestroy(
      this.call().call.on('call.closed_captions_failed', () => {
        this.settle();
        this.notifier.notify('Captions failed and have stopped.');
      }),
    );

    this.destroyRef.onDestroy(() => clearTimeout(this.timeout));
  }

  protected async toggle(): Promise<void> {
    const call = this.call().call;
    const wasCaptioning = this.captioning();
    this.pending.set(true);

    const result = await this.notifier.attempt(
      () => (wasCaptioning ? call.stopClosedCaptions() : call.startClosedCaptions()),
      { what: wasCaptioning ? 'Turning off captions' : 'Turning on captions' },
    );

    if (!result.ok) {
      this.settle();
      return;
    }

    clearTimeout(this.timeout);
    this.timeout = setTimeout(() => this.pending.set(false), SETTLE_TIMEOUT_MS);
  }

  private settle(): void {
    clearTimeout(this.timeout);
    this.timeout = undefined;
    this.pending.set(false);
  }
}
