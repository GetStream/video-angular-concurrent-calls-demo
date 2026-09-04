import { Injectable, computed, effect, signal } from '@angular/core';
import type { Call } from '@stream-io/video-client';

interface StoredPreferences {
  cameraId?: string;
  micId?: string;
  speakerId?: string;
  cameraOn: boolean;
  micOn: boolean;
}

const STORAGE_KEY = 'exam-demo/device-preferences';

const DEFAULTS: StoredPreferences = { cameraOn: true, micOn: false };

/**
 * Our own device preferences, replacing the SDK's built-in persistence.
 *
 * The SDK can persist the selected device *and* the mute state for you, but it keys that on
 * one `localStorage` entry per **client**, shared by every `Call` the client holds. A proctor
 * is in two calls at once, so the whisper call disabling its microphone would write
 * `muted: true` into the same entry the exam call reads back - the exam mic would then start
 * muted on the next join for no reason the user can see. So the client is constructed with
 * `devicePersistence: { enabled: false }` and this service owns the state instead, which is
 * also more explainable in a demo: the lobby writes, the call applies.
 */
@Injectable({ providedIn: 'root' })
export class DevicePreferences {
  private readonly prefs = signal<StoredPreferences>(read());

  readonly cameraId = computed(() => this.prefs().cameraId);
  readonly micId = computed(() => this.prefs().micId);
  readonly speakerId = computed(() => this.prefs().speakerId);
  readonly cameraOn = computed(() => this.prefs().cameraOn);
  readonly micOn = computed(() => this.prefs().micOn);

  constructor() {
    // Syncing signal state to a non-signal API is what effects are actually for.
    effect(() => write(this.prefs()));
  }

  selectCamera(deviceId: string | undefined): void {
    this.prefs.update((p) => ({ ...p, cameraId: deviceId }));
  }

  selectMic(deviceId: string | undefined): void {
    this.prefs.update((p) => ({ ...p, micId: deviceId }));
  }

  selectSpeaker(deviceId: string | undefined): void {
    this.prefs.update((p) => ({ ...p, speakerId: deviceId }));
  }

  setCameraOn(on: boolean): void {
    this.prefs.update((p) => ({ ...p, cameraOn: on }));
  }

  setMicOn(on: boolean): void {
    this.prefs.update((p) => ({ ...p, micOn: on }));
  }

  /**
   * Push the stored choices onto a call before it joins.
   *
   * Explicitly setting the status is what keeps the backend defaults out of the picture:
   * once `status` is set, the SDK's `shouldApplyDefaults` is false, so the call type's
   * `camera_default_on` / `mic_default_on` can never surprise the user.
   *
   * `camera: false` / `mic: false` force a device off whatever the stored preference says.
   * Both are what the whisper call is prepared with: it must never acquire a camera the
   * exam call is already publishing, and it must never join with a live microphone.
   *
   * The speaker is selected here for *every* call, not just the first, because
   * `SpeakerManager` state is per-`Call` - a proctor in two calls has two of them, and the
   * one that never had `select()` called on it plays out of the system default instead.
   */
  async applyTo(call: Call, opts: { camera?: boolean; mic?: boolean } = {}): Promise<void> {
    const { cameraId, micId, speakerId, cameraOn, micOn } = this.prefs();
    const wantCamera = (opts.camera ?? true) && cameraOn;
    const wantMic = (opts.mic ?? true) && micOn;

    // Selecting the device even when we are about to disable it means a later unmute uses
    // the mic the user picked in the lobby rather than the system default.
    if (micId) await call.microphone.select(micId);
    if (speakerId) await call.speaker.select(speakerId);
    await (wantMic ? call.microphone.enable() : call.microphone.disable());

    if (cameraId && (opts.camera ?? true)) await call.camera.select(cameraId);
    await (wantCamera ? call.camera.enable() : call.camera.disable());
  }
}

function read(): StoredPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as StoredPreferences) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

function write(prefs: StoredPreferences): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Private browsing or blocked storage: preferences just don't persist.
  }
}
