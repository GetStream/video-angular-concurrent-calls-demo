import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { OwnCapability } from '@stream-io/video-client';
import { Notifier } from '../../../core/errors/notifier';
import { CaptionsToggle } from '../../../shared/components/captions-toggle/captions-toggle';
import { RecordingToggle } from '../../../shared/components/recording-toggle/recording-toggle';
import { DevicePreferences } from '../../../core/stream/device-preferences';
import type { CallFacade } from '../../../core/stream/call-facade';
import type { WhisperSession } from '../whisper/whisper-session';

/** The bar along the bottom of both call layouts. */
@Component({
  selector: 'app-control-bar',
  imports: [MatButtonModule, MatIconModule, MatTooltipModule, CaptionsToggle, RecordingToggle],
  templateUrl: './control-bar.html',
  styleUrl: './control-bar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ControlBar {
  readonly exam = input.required<CallFacade>();
  readonly isProctor = input(false);
  readonly chatOpen = input(false);
  /** Present only for a proctor whose whisper call is joined. */
  readonly whisper = input<WhisperSession | null>(null);
  /** The exam mic belongs to the whisper reconciler while the channel is open. */
  readonly micLocked = input(false);
  readonly toggleChat = output<void>();
  readonly leave = output<void>();

  private readonly notifier = inject(Notifier);
  private readonly prefs = inject(DevicePreferences);

  protected readonly micOn = computed(() => this.exam().micOn());
  protected readonly cameraOn = computed(() => this.exam().cameraOn());
  protected readonly sharing = computed(() => this.exam().sharingScreen());
  protected readonly canEnd = computed(() => this.exam().can(OwnCapability.END_CALL)());
  protected readonly whispering = computed(() => this.whisper()?.panelOpen() ?? false);

  /** Ticks once a second so the elapsed time actually moves. */
  private readonly now = signal(Date.now());

  protected readonly elapsed = computed(() => {
    const startedAt = this.exam().session()?.started_at;
    if (!startedAt) return '00:00';
    const seconds = Math.max(0, Math.floor((this.now() - new Date(startedAt).getTime()) / 1000));
    const hh = Math.floor(seconds / 3600);
    const mm = Math.floor((seconds % 3600) / 60);
    const ss = seconds % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return hh > 0 ? `${pad(hh)}:${pad(mm)}:${pad(ss)}` : `${pad(mm)}:${pad(ss)}`;
  });

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  /**
   * A proctor's exam microphone is not toggled directly: the whisper reconciler owns both
   * microphones and force-mutes this one whenever the proctors-only channel is open, so the
   * button records an *intent* it applies when the channel closes. Everyone else - and a
   * proctor before the whisper call is joined - toggles the device itself.
   */
  protected async toggleMic(): Promise<void> {
    if (this.micLocked()) return;
    const on = !this.micOn();
    const whisper = this.whisper();

    if (whisper) {
      whisper.setExamMicIntent(on);
      this.prefs.setMicOn(on);
      return;
    }

    const result = await this.notifier.attempt(
      () => (on ? this.exam().call.microphone.enable() : this.exam().call.microphone.disable()),
      { what: on ? 'Unmuting' : 'Muting' },
    );
    if (result.ok) this.prefs.setMicOn(on);
  }

  /**
   * Puts *every* proctor into the channel - see `WhisperSession` for why it is shared.
   *
   * Not `[disabled]` while whispering: a disabled Material button greys its own label out,
   * and this is precisely the state that has to stay legible. It reads as an active pill and
   * the handler is a no-op instead.
   */
  protected async startWhisper(): Promise<void> {
    if (this.whispering()) return;
    await this.whisper()?.start();
  }

  /** Proctors only: a student's camera stays on for the length of the exam. */
  protected async toggleCamera(): Promise<void> {
    const on = !this.cameraOn();
    const result = await this.notifier.attempt(
      () => (on ? this.exam().call.camera.enable() : this.exam().call.camera.disable()),
      { what: on ? 'Turning on your camera' : 'Turning off your camera' },
    );
    if (result.ok) this.prefs.setCameraOn(on);
  }

  protected async toggleShare(): Promise<void> {
    const call = this.exam().call;
    if (this.sharing()) {
      await this.notifier.attempt(() => call.screenShare.disable(), {
        what: 'Stopping your screen share',
      });
      return;
    }
    call.screenShare.setSettings({ contentHint: 'text', maxFramerate: 15 });
    await this.notifier.attempt(() => call.screenShare.enable(), {
      what: 'Sharing your screen',
    });
  }

  /**
   * Ends both calls when there are two. Nothing cascades between them server-side, so
   * ending only the exam would leave every proctor in a live whisper call - microphone
   * open, automatic recording still running.
   */
  protected async endForEveryone(): Promise<void> {
    const whisper = this.whisper();
    if (whisper) {
      await whisper.endBothCalls();
      return;
    }
    await this.notifier.attempt(() => this.exam().call.endCall(), {
      what: 'Ending the exam',
    });
  }
}
