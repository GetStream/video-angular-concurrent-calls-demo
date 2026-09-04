import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { hasScreenShareAudio, type Call, type StreamVideoParticipant } from '@stream-io/video-client';
import { AudioTrack } from '../../directives/audio-track';

/**
 * Plays every remote participant's audio.
 *
 * The SFU subscribes a participant's audio whether or not an element is bound, so without
 * this the call looks fine and is completely silent - and the SDK says so, with
 * "Dangling audio bindings detected. Did you forget to bind the audio element?".
 *
 * Deliberately a standalone, always-mounted host rather than an element inside each video
 * tile: audio must keep playing for people who have no tile on screen (a proctor scrolled
 * out of view, or anyone at all in the student layout, which shows no remote video), and a
 * conditionally-rendered element would drop the first moment of speech every time it
 * appeared. Visually hidden, never `display: none` - a detached element plays nothing.
 */
@Component({
  selector: 'app-audio-sink',
  imports: [AudioTrack],
  template: `
    @for (participant of remotes(); track participant.sessionId) {
      <audio
        appAudioTrack
        [call]="call()"
        [sessionId]="participant.sessionId"
        trackType="audioTrack"
      ></audio>

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

  protected hasScreenAudio(participant: StreamVideoParticipant): boolean {
    return hasScreenShareAudio(participant);
  }
}
