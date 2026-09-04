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
import { DevicePreferences } from '../../../core/stream/device-preferences';
import type { CallFacade } from '../../../core/stream/call-facade';

/** The bar along the bottom of both call layouts. */
@Component({
  selector: 'app-control-bar',
  imports: [MatButtonModule, MatIconModule, MatTooltipModule],
  templateUrl: './control-bar.html',
  styleUrl: './control-bar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ControlBar {
  readonly exam = input.required<CallFacade>();
  readonly isProctor = input(false);
  readonly chatOpen = input(false);
  readonly toggleChat = output<void>();
  readonly leave = output<void>();

  private readonly notifier = inject(Notifier);
  private readonly prefs = inject(DevicePreferences);

  protected readonly micOn = computed(() => this.exam().micOn());
  protected readonly cameraOn = computed(() => this.exam().cameraOn());
  protected readonly sharing = computed(() => this.exam().sharingScreen());
  protected readonly canEnd = computed(() => this.exam().can(OwnCapability.END_CALL)());

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

  protected async toggleMic(): Promise<void> {
    const on = !this.micOn();
    const result = await this.notifier.attempt(
      () => (on ? this.exam().call.microphone.enable() : this.exam().call.microphone.disable()),
      { what: on ? 'Unmuting' : 'Muting' },
    );
    if (result.ok) this.prefs.setMicOn(on);
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

  protected async endForEveryone(): Promise<void> {
    await this.notifier.attempt(() => this.exam().call.endCall(), {
      what: 'Ending the exam',
    });
  }
}
