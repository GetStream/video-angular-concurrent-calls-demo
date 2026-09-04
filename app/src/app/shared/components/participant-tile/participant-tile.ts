import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  hasAudio,
  hasScreenShare,
  hasVideo,
  type Call,
  type StreamVideoParticipant,
  type VideoTrackType,
} from '@stream-io/video-client';
import { VideoTrack } from '../../directives/video-track';
import { initials } from '../../../core/models/demo-user.model';

/**
 * One participant's video, camera or screen share.
 *
 * The `<video>` is always in the DOM even when the track is absent, so the binding
 * directive keeps its element and the SFU keeps its size hint; the placeholder is layered
 * over the top instead of replacing it.
 */
@Component({
  selector: 'app-participant-tile',
  imports: [MatIconModule, MatTooltipModule, VideoTrack],
  templateUrl: './participant-tile.html',
  styleUrl: './participant-tile.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ParticipantTile {
  readonly call = input.required<Call>();
  readonly participant = input.required<StreamVideoParticipant>();
  readonly trackType = input<VideoTrackType>('videoTrack');
  readonly label = input<string>('');
  /** Draw attention to a missing screen share - a proctor scans the row for these. */
  readonly alertWhenMissing = input(false);
  readonly mirror = input(false);

  protected readonly initials = initials;

  protected readonly hasTrack = computed(() =>
    this.trackType() === 'screenShareTrack'
      ? hasScreenShare(this.participant())
      : hasVideo(this.participant()),
  );

  protected readonly displayName = computed(
    () => this.participant().name || this.participant().userId,
  );

  /** A screen share has no microphone of its own, so the badge is camera-tiles only. */
  protected readonly showMic = computed(() => this.trackType() === 'videoTrack');

  /**
   * `hasAudio` is whether the participant is *publishing* an audio track - which is what
   * "mic on" means to everyone else in the call. It is not the same as `isSpeaking`, which
   * is the SFU's voice-activity detection and flickers with every pause.
   */
  protected readonly micOn = computed(() => hasAudio(this.participant()));

  /** Only meaningful while actually publishing; used for a subtle active state. */
  protected readonly speaking = computed(
    () => this.micOn() && !!this.participant().isSpeaking,
  );
}
