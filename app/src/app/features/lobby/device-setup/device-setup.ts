import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
  type ElementRef,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { createSoundDetector, type Call } from '@stream-io/video-client';
import { distinctUntilChanged, of, switchMap } from 'rxjs';
import { BackgroundFilter } from '../../../core/stream/background-filter';
import { DevicePreferences } from '../../../core/stream/device-preferences';
import { Notifier } from '../../../core/errors/notifier';
import { DeviceControls } from '../../../shared/components/device-controls/device-controls';

/**
 * Camera preview and mute toggles - the left column of the lobby, identical on both tabs so
 * switching between them never disturbs your setup.
 *
 * The pickers themselves live in `DeviceControls`, shared with the in-call settings dialog,
 * so there is exactly one implementation of "choose a microphone" in the app.
 *
 * The preview deliberately assigns `camera.state.mediaStream` to the element rather than
 * using `bindVideoElement`: that binding is for *joined* participants and drives track
 * subscription. Here nothing is joined and nothing is published; enabling the camera just
 * acquires a local stream.
 */
@Component({
  selector: 'app-device-setup',
  imports: [MatButtonModule, MatIconModule, MatTooltipModule, DeviceControls],
  templateUrl: './device-setup.html',
  styleUrl: './device-setup.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeviceSetup {
  readonly call = input.required<Call>();
  readonly userLabel = input<string>('');

  private readonly prefs = inject(DevicePreferences);
  private readonly background = inject(BackgroundFilter);
  private readonly notifier = inject(Notifier);
  private readonly destroyRef = inject(DestroyRef);

  private readonly videoEl = viewChild<ElementRef<HTMLVideoElement>>('preview');

  /**
   * Inputs are signals, so the call can be bridged straight to an observable and every
   * piece of device state below re-derived through `switchMap` - switching the previewed
   * call id rewires all of it without any manual unsubscribing.
   */
  private readonly call$ = toObservable(this.call);

  protected readonly cameraStatus = toSignal(
    this.call$.pipe(
      switchMap((call) => (call ? call.camera.state.optimisticStatus$ : of(undefined))),
      distinctUntilChanged(),
    ),
    { initialValue: undefined },
  );
  protected readonly micStatus = toSignal(
    this.call$.pipe(
      switchMap((call) => (call ? call.microphone.state.optimisticStatus$ : of(undefined))),
      distinctUntilChanged(),
    ),
    { initialValue: undefined },
  );
  protected readonly cameraPermission = toSignal(
    this.call$.pipe(
      switchMap((call) =>
        call ? call.camera.state.browserPermissionState$ : of('prompt' as const),
      ),
      distinctUntilChanged(),
    ),
    { initialValue: 'prompt' as const },
  );
  protected readonly micPermission = toSignal(
    this.call$.pipe(
      switchMap((call) =>
        call ? call.microphone.state.browserPermissionState$ : of('prompt' as const),
      ),
      distinctUntilChanged(),
    ),
    { initialValue: 'prompt' as const },
  );

  protected readonly cameraOn = computed(() => this.cameraStatus() === 'enabled');
  protected readonly micOn = computed(() => this.micStatus() === 'enabled');
  protected readonly blocked = computed(
    () => this.cameraPermission() === 'denied' || this.micPermission() === 'denied',
  );

  /** Only the stage badge needs this; the picker itself is in `DeviceControls`. */
  protected readonly blurChoice = this.background.choice;

  /** 0-100, driven by the mic's own stream so the meter works before joining. */
  protected readonly micLevel = signal(0);

  constructor() {
    void this.background.probeSupport();

    // Third-party element that isn't a participant track: assigning srcObject is the
    // documented lobby-preview path.
    effect(() => {
      const stream = this.previewStream();
      const el = this.videoEl()?.nativeElement;
      if (!el) return;
      if (el.srcObject !== stream) {
        el.srcObject = stream ?? null;
        if (stream) void el.play().catch(() => undefined);
      }
    });

    // Speaking-level meter. Rebuilt whenever the mic stream changes (device switch,
    // mute/unmute), and torn down with the component.
    effect((onCleanup) => {
      const stream = this.micStream();
      if (!stream) {
        this.micLevel.set(0);
        return;
      }
      const stop = createSoundDetector(stream, ({ audioLevel }) => this.micLevel.set(audioLevel), {
        detectionFrequencyInMs: 100,
      });
      onCleanup(() => void stop());
    });

    this.destroyRef.onDestroy(() => this.micLevel.set(0));
  }

  private readonly previewStream = toSignal(
    this.call$.pipe(switchMap((call) => (call ? call.camera.state.mediaStream$ : of(undefined)))),
    { initialValue: undefined },
  );

  private readonly micStream = toSignal(
    this.call$.pipe(
      switchMap((call) => (call ? call.microphone.state.mediaStream$ : of(undefined))),
    ),
    { initialValue: undefined },
  );

  protected async toggleCamera(): Promise<void> {
    const on = !this.cameraOn();
    const result = await this.notifier.attempt(
      () => (on ? this.call().camera.enable() : this.call().camera.disable()),
      { what: on ? 'Turning on your camera' : 'Turning off your camera' },
    );
    if (result.ok) this.prefs.setCameraOn(on);
  }

  protected async toggleMic(): Promise<void> {
    const on = !this.micOn();
    const result = await this.notifier.attempt(
      () => (on ? this.call().microphone.enable() : this.call().microphone.disable()),
      { what: on ? 'Turning on your microphone' : 'Turning off your microphone' },
    );
    if (result.ok) this.prefs.setMicOn(on);
  }
}
