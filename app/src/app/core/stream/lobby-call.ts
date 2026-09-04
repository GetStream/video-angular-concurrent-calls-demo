import { Injectable, inject, signal } from '@angular/core';
import type { Call } from '@stream-io/video-client';
import { BackgroundFilter } from './background-filter';
import { DevicePreferences } from './device-preferences';
import { VideoClient } from './video-client';

/** The exam call type. `audio_room` (whisper) is never chosen in the UI. */
export const EXAM_CALL_TYPE = 'default';

/**
 * The lobby's preview call.
 *
 * The lobby needs a `Call` object but must never join one. That works because the device
 * managers are built eagerly in the `Call` constructor and publishing is gated on
 * `callingState === JOINED` - so `camera.enable()` here just acquires a local stream, with
 * no server round-trip at all.
 *
 * The same instance is then handed to the call route via `reuseInstance: true`, which is
 * the whole lobby → call handoff: the camera is already running and the background filter
 * is already registered, so nothing is re-acquired and the user sees no flicker.
 */
@Injectable({ providedIn: 'root' })
export class LobbyCall {
  private readonly video = inject(VideoClient);
  private readonly devices = inject(DevicePreferences);
  private readonly background = inject(BackgroundFilter);

  private readonly current = signal<Call | null>(null);
  readonly call = this.current.asReadonly();

  /**
   * Point the preview at a call id, creating the instance if needed.
   *
   * Called with the generated id on the Create tab, and with the typed id on the Join tab.
   * Switching id releases the previous preview's devices first - two live camera handles on
   * the same device is a hard failure on most machines.
   */
  async previewFor(callId: string): Promise<Call> {
    const existing = this.current();
    if (existing && existing.id === callId) return existing;

    if (existing) await this.releaseDevices(existing);

    const call = this.video.callFor(EXAM_CALL_TYPE, callId, { reuse: true });
    this.current.set(call);

    // Replay the user's stored choices, then re-apply whatever background was selected.
    await this.devices.applyTo(call);
    if (this.background.choice() !== 'none') {
      await this.background.apply(call, this.background.choice());
    }
    return call;
  }

  /**
   * Stop the preview without ending anything: the call route takes the same instance and
   * keeps the camera running, so this is only for leaving the lobby *without* joining.
   */
  async stopPreview(): Promise<void> {
    const call = this.current();
    this.current.set(null);
    if (call) await this.releaseDevices(call);
  }

  /** Hand the instance to the call route and stop tracking it here. */
  handOff(): Call | null {
    const call = this.current();
    this.current.set(null);
    return call;
  }

  private async releaseDevices(call: Call): Promise<void> {
    await this.background.clear();
    await call.camera.disable();
    await call.microphone.disable();
  }
}
