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
 * Start and stop the call recording.
 *
 * Renders nothing without the capability, so this is safe to place in a shared control bar:
 * the server is the authority and the UI simply reflects it. Capabilities come from
 * `ownCapabilities$`, which merges the coordinator's list with the SFU's grants - never from
 * a cached join response.
 *
 * Note the vocabulary gap: the *permission id* granted in the setup script is
 * `start-recording`, but what a client reads back in `own_capabilities` is
 * `start-record-call`. Same thing, two names, and only the second one belongs here.
 */
@Component({
  selector: 'app-recording-toggle',
  imports: [MatButtonModule, MatIconModule, MatProgressSpinnerModule, MatTooltipModule],
  template: `
    @if (canRecord()) {
      <button
        matIconButton
        type="button"
        class="ctl"
        [class.ctl--live]="recording()"
        [disabled]="pending()"
        [matTooltip]="tooltip()"
        [attr.aria-label]="tooltip()"
        [attr.aria-pressed]="recording()"
        (click)="toggle()"
      >
        @if (pending()) {
          <mat-spinner diameter="18" />
        } @else {
          <mat-icon>{{ recording() ? 'stop_circle' : 'fiber_manual_record' }}</mat-icon>
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

    .ctl--live {
      --mat-icon-button-icon-color: var(--mat-sys-error);

      background: rgb(208 83 83 / 22%);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecordingToggle implements OnInit {
  readonly call = input.required<CallFacade>();

  private readonly notifier = inject(Notifier);

  /**
   * Local, because the backend takes a moment: `recording()` only flips when the
   * `call.recording_started` event lands, and without this the button looks dead in between.
   *
   * It is therefore cleared by that **event**, not by the request resolving. A resolved
   * request only means the server accepted the job - clearing on it puts the button back to
   * "start recording" while a recording is starting, which invites a second click and a
   * second job.
   */
  protected readonly pending = signal(false);

  /** Backstop, so a dropped event cannot wedge the button in its pending state forever. */
  private timeout?: ReturnType<typeof setTimeout>;

  protected readonly recording = computed(() => this.call().recording());
  protected readonly canRecord = computed(
    () =>
      this.call().can(OwnCapability.START_RECORD_CALL)() ||
      this.call().can(OwnCapability.STOP_RECORD_CALL)(),
  );

  protected readonly tooltip = computed(() =>
    this.pending()
      ? 'Waiting for the server…'
      : this.recording()
        ? 'Stop recording'
        : 'Start recording',
  );

  private readonly destroyRef = inject(DestroyRef);

  /**
   * In `ngOnInit`, not the constructor: `call` is a required input, and inputs are not bound
   * while the constructor runs - reading one there is a compile error (NG8118).
   */
  ngOnInit(): void {
    const destroyRef = this.destroyRef;

    // The asset is *not* ready when recording stops - encoding can take 30s or more, and
    // this is the event that says it has landed.
    destroyRef.onDestroy(
      this.call().call.on('call.recording_ready', () => {
        this.notifier.notify('The recording is ready.');
      }),
    );

    // These two are what actually settle the button, because they are what moves
    // `recording()`. They also fire when *another* proctor toggles it.
    for (const event of ['call.recording_started', 'call.recording_stopped'] as const) {
      destroyRef.onDestroy(this.call().call.on(event, () => this.settle()));
    }

    // Recording can fail server-side well after a successful start, so the failure has to
    // be surfaced from the event stream, not only from the request.
    destroyRef.onDestroy(
      this.call().call.on('call.recording_failed', () => {
        this.settle();
        this.notifier.notify('The recording failed and has stopped.');
      }),
    );

    destroyRef.onDestroy(() => clearTimeout(this.timeout));
  }

  protected async toggle(): Promise<void> {
    const call = this.call().call;
    const wasRecording = this.recording();
    this.pending.set(true);

    const result = await this.notifier.attempt(
      () => (wasRecording ? call.stopRecording() : call.startRecording()),
      { what: wasRecording ? 'Stopping the recording' : 'Starting the recording' },
    );

    if (!result.ok) {
      this.settle();
      return;
    }

    // Accepted, not running: stay pending until the state actually changes.
    clearTimeout(this.timeout);
    this.timeout = setTimeout(() => this.pending.set(false), SETTLE_TIMEOUT_MS);
  }

  private settle(): void {
    clearTimeout(this.timeout);
    this.timeout = undefined;
    this.pending.set(false);
  }
}
