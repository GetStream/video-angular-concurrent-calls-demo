import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  hasAudio,
  hasScreenShareAudio,
  type Call,
  type StreamVideoParticipant,
} from '@stream-io/video-client';
import { AudioTrack } from '../../directives/audio-track';

/**
 * Plays the audio of every remote participant who is publishing any.
 *
 * The SFU subscribes a participant's audio whether or not an element is bound, so without
 * this the call looks fine and is completely silent - and the SDK says so, with
 * "Dangling audio bindings detected. Did you forget to bind the audio element?".
 *
 * The host is mounted for the whole call, never inside a tile or a conditional block: audio
 * keeps playing for people with no tile on screen, and the whisper sink sits outside
 * `panelOpen()` for the same reason. Visually hidden, never `display: none` - a detached
 * element plays nothing.
 *
 * The elements inside it follow `hasAudio` / `hasScreenShareAudio`, as `ParticipantsAudio`
 * does in the React SDK. Each binding opens three subscriptions over `participants$`, which
 * re-emits every audio-level patch, so an element per muted participant is per-frame work
 * for nothing. `hasAudio` reads `publishedTracks`, signalled before media flows, so the
 * element is in place ahead of the first sample.
 */
@Component({
  selector: 'app-audio-sink',
  imports: [AudioTrack],
  template: `
    @for (participant of remotes(); track participant.sessionId) {
      <!-- Only for someone actually publishing - see the class comment for the cost. -->
      @if (hasAudio(participant)) {
        <audio
          appAudioTrack
          [call]="call()"
          [sessionId]="participant.sessionId"
          trackType="audioTrack"
        ></audio>
      }

      <!-- A student sharing a browser tab can share its audio too. -->
      @if (hasScreenAudio(participant)) {
        <audio
          appAudioTrack
          [call]="call()"
          [sessionId]="participant.sessionId"
          trackType="screenShareAudioTrack"
        ></audio>
      }
    }
  `,
  styles: `
    :host {
      position: absolute;
      width: 0;
      height: 0;
      overflow: hidden;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AudioSink {
  readonly call = input.required<Call>();
  readonly participants = input.required<StreamVideoParticipant[]>();

  /** Never bind your own audio: it would be a feedback loop straight into your speakers. */
  protected readonly remotes = computed(() =>
    this.participants().filter((p) => !p.isLocalParticipant),
  );

  protected hasAudio(participant: StreamVideoParticipant): boolean {
    return hasAudio(participant);
  }

  protected hasScreenAudio(participant: StreamVideoParticipant): boolean {
    return hasScreenShareAudio(participant);
  }
}
