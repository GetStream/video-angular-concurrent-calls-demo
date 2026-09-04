import { Injectable, inject } from '@angular/core';
import type { Call, CallRecording } from '@stream-io/video-client';
import { CurrentUser } from '../auth/current-user';
import { Notifier } from '../errors/notifier';
import { VideoClient } from './video-client';

/** How many recent calls to list. */
const CALL_LIMIT = 30;

/** One call in the list, with the `Call` instance its recordings have to be asked for. */
export interface CallSummary {
  /** Kept because `listRecordings` is a method on the call, not a client-level query. */
  readonly call: Call;
  readonly cid: string;
  readonly type: string;
  readonly id: string;
  /** 'Exam' or 'Whisper' - this demo's name for the call type. */
  readonly label: string;
  readonly createdAt?: Date;
  readonly endedAt?: Date;
  readonly memberCount: number;
}

export type RecordingsResult =
  | { status: 'ok'; recordings: CallRecording[] }
  /** The role holds no `list-recordings` grant on this call type. Permanent. */
  | { status: 'refused' }
  /** A rate limit, a 5xx, a dropped connection. Worth retrying. */
  | { status: 'failed' };

/**
 * The calls this user is on, and each call's recordings.
 *
 * **There is no "all recordings for this app" endpoint.** `listRecordings` is a method on a
 * call, so recordings are always reached in two steps - query the calls, then ask a call.
 * The UI mirrors that exactly: a list of calls, and recordings fetched for one call when you
 * ask for them. That is not only tidier, it is the only shape that behaves: an earlier
 * version fanned out `listRecordings` across all 30 calls at once to build a single flat
 * list, and the API rate-limited the burst with `429 Too Many Requests`, silently dropping
 * those calls' recordings - one run listed 7 of 23.
 *
 * Two more API details worth knowing:
 *
 * 1. **`queryCalls` must be scoped to your own membership.** An unscoped query from a client
 *    is refused with a 403 that spells out the fix: *"some calls match your query but cannot
 *    be returned because you don't have access to them. Did you forget to include
 *    {members: $in: [\"student-tom\"]}?"*. A proctor who happens to be on every call gets
 *    away without it, which makes this the kind of bug that ships.
 * 2. **`queryCalls` builds real `Call` objects** and runs `applyDeviceConfig` on each one.
 *    It is only harmless here because both call types set `camera_default_on: false` and
 *    `mic_default_on: false` - against a camera-on call type, *opening this screen would
 *    turn the camera on*. It also logs *"[video manager]: Setting direction is not supported
 *    on this device"* once per call on any desktop. Both happen inside `queryCalls`, so
 *    neither can be switched off from out here; `withDisabledDevices: false` would only make
 *    the camera case worse.
 */
@Injectable({ providedIn: 'root' })
export class CallRecordings {
  private readonly video = inject(VideoClient);
  private readonly currentUser = inject(CurrentUser);
  private readonly notifier = inject(Notifier);

  /** The calls this user is a member of, newest first. One request. */
  async listCalls(): Promise<CallSummary[] | null> {
    const userId = this.currentUser.user()?.id;
    if (!userId) return null;

    const queried = await this.notifier.attempt(
      () =>
        this.video.client.queryCalls({
          // See (1) above - this filter is not optional.
          filter_conditions: { members: { $in: [userId] } },
          sort: [{ field: 'created_at', direction: -1 }],
          limit: CALL_LIMIT,
        }),
      { what: 'Looking up your calls' },
    );
    if (!queried.ok) return null;

    return queried.value.calls.map((call) => ({
      call,
      cid: call.cid,
      type: call.type,
      id: call.id,
      label: call.type === 'audio_room' ? 'Whisper' : 'Exam',
      createdAt: call.state.createdAt,
      endedAt: call.state.endedAt,
      memberCount: call.state.members.length,
    }));
  }

  /**
   * One call's recordings.
   *
   * The failure is classified rather than thrown, because the two kinds need opposite
   * advice. A 403 means the role holds no `list-recordings` grant on this call type -
   * permanent, and a real answer to give someone. Anything else is transient, and a rate
   * limit is the one you will actually meet. Conflating them is how this went wrong first
   * time round: a 429 was reported as a missing grant, sending the reader off to fix a
   * setup script that was working.
   */
  async recordingsFor(summary: CallSummary): Promise<RecordingsResult> {
    try {
      const { recordings } = await summary.call.listRecordings();
      // Newest first; the API does not promise an order.
      return {
        status: 'ok',
        recordings: [...recordings].sort((a, b) => b.start_time.localeCompare(a.start_time)),
      };
    } catch (error) {
      const status = (error as { status?: number }).status;
      const result = status === 403 ? 'refused' : 'failed';
      console.warn(`[stream] listRecordings(${summary.cid}) ${result} (${status}):`, error);
      return { status: result };
    }
  }
}

/** True for the whisper channel's audio-only recordings, which are `.mp3` rather than `.mp4`. */
export function isAudioOnly(recording: CallRecording): boolean {
  // Not `recording_type`: that field is the *layout* and reads 'composite' for audio and
  // video alike. The media type only shows up in the extension.
  return recording.filename.endsWith('.mp3');
}

/** A recording's length, from its own timestamps. */
export function durationOf(recording: CallRecording): string {
  const seconds = Math.round(
    (Date.parse(recording.end_time) - Date.parse(recording.start_time)) / 1000,
  );
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  const minutes = Math.floor(seconds / 60);
  return minutes ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
}
