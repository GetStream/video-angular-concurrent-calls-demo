import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  SfuModels,
  hasAudio,
  hasInterruptedTrack,
  hasPausedTrack,
  hasScreenShare,
  hasVideo,
  type Call,
  type StreamVideoParticipant,
  type VideoTrackType,
} from '@stream-io/video-client';
import { VideoTrack } from '../../directives/video-track';
import { NetworkQuality } from '../network-quality/network-quality';
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
  imports: [MatIconModule, MatTooltipModule, NetworkQuality, VideoTrack],
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
  /** Off by default: worth the pixels on a grid you are monitoring, noise on your own tile. */
  readonly showQuality = input(false);

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
  protected readonly speaking = computed(() => this.micOn() && !!this.participant().isSpeaking);

  /**
   * The *server* stopped sending this video to save bandwidth - the participant is still
   * publishing it. Without saying so the tile just looks frozen, and the natural conclusion
   * is that the student turned their camera off, which would be the wrong one.
   */
  protected readonly paused = computed(() => hasPausedTrack(this.participant(), this.trackType()));

  /**
   * Publishing audio, but no media is arriving: an OS-level mute, a headset unplugged
   * mid-call. Distinct from a muted mic, and the participant may well not realise.
   */
  protected readonly micInterrupted = computed(() =>
    hasInterruptedTrack(this.participant(), SfuModels.TrackType.AUDIO),
  );

  protected readonly quality = computed(() => this.participant().connectionQuality);

  protected readonly micLabel = computed(() => {
    if (this.micInterrupted()) return 'Microphone interrupted - no audio is arriving';
    return this.micOn() ? 'Microphone on' : 'Microphone muted';
  });
}
