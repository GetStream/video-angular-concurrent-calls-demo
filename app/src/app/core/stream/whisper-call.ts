import { Injectable, inject } from '@angular/core';
import { CallingState, type Call, type MemberRequest } from '@stream-io/video-client';
import { Notifier } from '../errors/notifier';
import { DevicePreferences } from './device-preferences';
import { VideoClient } from './video-client';

/**
 * The proctors-only "whisper" channel is a second call of the built-in `audio_room` type,
 * sharing the exam call's id. It is never offered in the UI - joining it is always implicit.
 */
export const WHISPER_CALL_TYPE = 'audio_room';

/**
 * The whisper call: a second call, joined at the same time as the exam call.
 *
 * One `StreamVideoClient` holds both. The SDK supports that directly - it tracks a *list*
 * of calls with no "active call" concept, and the join-once guard is per-`Call`-instance.
 *
 * **Membership is the access control, server-side.** `join-call` on `audio_room` is granted
 * only to `call_member_proctor`, and no app-level role carries it, so a student handed
 * `audio_room:<callId>` by hand is refused by the API. Nothing here depends on the UI
 * hiding a button.
 */
@Injectable({ providedIn: 'root' })
export class WhisperCall {
  private readonly video = inject(VideoClient);
  private readonly devices = inject(DevicePreferences);
  private readonly notifier = inject(Notifier);

  /**
   * Create it beside the exam call, with that call's proctors as its only members.
   *
   * Created in the lobby for the same reason the chat room is: the roster is known exactly
   * once, at creation, so there is a single writer and nothing to reconcile later. A proctor
   * arriving on a link only ever *joins* - `enter()` below never creates.
   */
  async createFor(callId: string, proctorIds: string[]): Promise<boolean> {
    const call = this.video.callFor(WHISPER_CALL_TYPE, callId, { reuse: true });
    await this.prepare(call);

    const members: MemberRequest[] = proctorIds.map((id) => ({
      user_id: id,
      role: 'call_member_proctor',
    }));

    const result = await this.notifier.attempt(() => call.getOrCreate({ data: { members } }), {
      what: 'Creating the proctors-only channel',
    });
    return result.ok;
  }

  /**
   * Join it from the exam route. `null` means the proctor must not be left with a live
   * exam microphone - see the caller for why that is a safety rule and not a nicety.
   */
  async enter(callId: string): Promise<Call | null> {
    const call = this.video.callFor(WHISPER_CALL_TYPE, callId, { reuse: true });
    await this.prepare(call);

    // The proctor who created the call in the lobby already holds this instance; only the
    // join is new. Everyone else gets a fresh instance and joins a call that exists.
    if (call.state.callingState === CallingState.JOINED) return call;

    const result = await this.notifier.attempt(() => call.join(), {
      what: 'Joining the proctors-only channel',
    });
    return result.ok ? call : null;
  }

  /**
   * Everything that has to be true *before* the call talks to the server.
   *
   * `applyDeviceConfig` runs on `get()`, `getOrCreate()` **and** the first `join()`, so this
   * cannot wait until afterwards. Pre-disabling both devices sets their status, which makes
   * the SDK's `shouldApplyDefaults` false - so no backend default can hand the whisper call
   * a live microphone, and it can never grab the camera the exam call is already publishing.
   *
   * The speaking-while-muted detector is off for the same reason it is off on the exam call:
   * this demo never surfaces the hint, and the detector opens a *second* `getUserMedia` for
   * every muted participant. With two calls that would mean two idle captures at all times
   * and a "you appear to be speaking while muted" warning on the exam call for the whole
   * duration of every whisper.
   */
  private async prepare(call: Call): Promise<void> {
    await this.devices.applyTo(call, { camera: false, mic: false });
    await call.microphone.disableSpeakingWhileMutedNotification();
    // Also switches off the "no audio detected" check, which would fire constantly on a
    // call whose microphone is muted by design.
    call.microphone.setSilenceThreshold(0);
  }
}
