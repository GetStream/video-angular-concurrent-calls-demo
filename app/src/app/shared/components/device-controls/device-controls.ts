import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import type { Call } from '@stream-io/video-client';
import { distinctUntilChanged, of, switchMap } from 'rxjs';
import { BackgroundFilter, type BackgroundChoice } from '../../../core/stream/background-filter';
import { DevicePreferences } from '../../../core/stream/device-preferences';
import { Notifier } from '../../../core/errors/notifier';

/**
 * Microphone, camera and speaker pickers, plus the virtual background choice.
 *
 * Shared by the lobby and the in-call settings dialog, so "the same selectors" is literally
 * the same component rather than a second copy that drifts. The lobby wraps it in a camera
 * preview; in a call your own tile is already on screen, so there is nothing to preview.
 *
 * **`mirrorTo` is the part that needs explaining.** `MicrophoneManager` and `SpeakerManager`
 * state is per-`Call`, and a proctor holds two calls at once - the exam call and the
 * proctors-only whisper channel. Selecting a microphone on only one of them means the other
 * keeps capturing from whatever it had, and selecting a speaker on only one means half the
 * audio still plays out of the old device. So device selection is applied to `call` *and*
 * everything in `mirrorTo`.
 *
 * The camera is deliberately **not** mirrored: the whisper call has `video.enabled: false`
 * and its camera is force-disabled, so it never publishes video and has no camera to pick.
 * The background filter registers on the camera that does publish, for the same reason.
 */
@Component({
  selector: 'app-device-controls',
  imports: [
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSelectModule,
  ],
  templateUrl: './device-controls.html',
  styleUrl: './device-controls.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeviceControls {
  /** The call whose device state the pickers read, and whose camera the filter runs on. */
  readonly call = input.required<Call>();
  /** Other calls held by the same user, which must follow the mic and speaker choice. */
  readonly mirrorTo = input<Call[]>([]);

  private readonly prefs = inject(DevicePreferences);
  private readonly background = inject(BackgroundFilter);
  private readonly notifier = inject(Notifier);

  /**
   * Inputs are signals, so the call is bridged to an observable and every piece of device
   * state re-derived through `switchMap` - the lobby swapping the previewed call id rewires
   * all of it with no manual unsubscribing.
   */
  private readonly call$ = toObservable(this.call);

  protected readonly cameras = toSignal(
    this.call$.pipe(switchMap((call) => (call ? call.camera.listDevices() : of([])))),
    { initialValue: [] as MediaDeviceInfo[] },
  );
  protected readonly mics = toSignal(
    this.call$.pipe(switchMap((call) => (call ? call.microphone.listDevices() : of([])))),
    { initialValue: [] as MediaDeviceInfo[] },
  );
  protected readonly speakers = toSignal(
    this.call$.pipe(switchMap((call) => (call ? call.speaker.listDevices() : of([])))),
    { initialValue: [] as MediaDeviceInfo[] },
  );

  /** Output device selection isn't supported in every browser; hide the picker if not. */
  protected readonly canPickSpeaker = computed(
    () => this.call().speaker.state.isDeviceSelectionSupported,
  );

  /**
   * Read the *SDK's* current selection, not just our stored preference: with nothing stored
   * the SDK still picks a system default when the device is enabled, and a picker showing
   * blank while the camera is visibly running is just wrong.
   */
  protected readonly selectedCamera = toSignal(
    this.call$.pipe(
      switchMap((call) => (call ? call.camera.state.selectedDevice$ : of(undefined))),
      distinctUntilChanged(),
    ),
    { initialValue: undefined },
  );
  protected readonly selectedMic = toSignal(
    this.call$.pipe(
      switchMap((call) => (call ? call.microphone.state.selectedDevice$ : of(undefined))),
      distinctUntilChanged(),
    ),
    { initialValue: undefined },
  );
  protected readonly selectedSpeaker = toSignal(
    this.call$.pipe(
      switchMap((call) => (call ? call.speaker.state.selectedDevice$ : of(undefined))),
      distinctUntilChanged(),
    ),
    { initialValue: undefined },
  );

  protected readonly blurSupported = this.background.supported;
  protected readonly blurChoice = this.background.choice;
  protected readonly blurLoading = this.background.loading;
  protected readonly blurDegraded = this.background.degraded;

  constructor() {
    void this.background.probeSupport();
  }

  protected async selectCamera(deviceId: string): Promise<void> {
    const result = await this.notifier.attempt(() => this.call().camera.select(deviceId), {
      what: 'Switching camera',
    });
    if (result.ok) this.prefs.selectCamera(deviceId);
  }

  /**
   * Applied to every call, including one that is currently muted: `select()` on a disabled
   * microphone stores the choice without acquiring anything, so the next unmute uses the
   * device the user picked rather than the system default. On a call that *is* unmuted the
   * manager re-acquires and re-publishes, which is what you want.
   */
  protected async selectMic(deviceId: string): Promise<void> {
    const result = await this.notifier.attempt(
      () => Promise.all(this.allCalls().map((call) => call.microphone.select(deviceId))),
      { what: 'Switching microphone' },
    );
    if (result.ok) this.prefs.selectMic(deviceId);
  }

  protected async selectSpeaker(deviceId: string): Promise<void> {
    // SpeakerManager.select is synchronous, unlike the camera and microphone managers -
    // there is no track to re-acquire, only a sinkId to set on the bound audio elements.
    const result = await this.notifier.attempt(
      async () => this.allCalls().forEach((call) => call.speaker.select(deviceId)),
      { what: 'Switching speaker' },
    );
    if (result.ok) this.prefs.selectSpeaker(deviceId);
  }

  protected async setBackground(choice: BackgroundChoice): Promise<void> {
    await this.background.apply(this.call(), choice);
  }

  protected deviceLabel(device: MediaDeviceInfo, fallback: string): string {
    return device.label || `${fallback} ${device.deviceId.slice(0, 6)}`;
  }

  private allCalls(): Call[] {
    return [this.call(), ...this.mirrorTo()];
  }
}
