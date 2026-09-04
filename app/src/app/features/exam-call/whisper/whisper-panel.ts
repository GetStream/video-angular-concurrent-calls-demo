import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { hasAudio, type StreamVideoParticipant } from '@stream-io/video-client';
import { initials } from '../../../core/models/demo-user.model';
import type { WhisperSession } from './whisper-session';

/**
 * The proctors-only channel, over the call.
 *
 * Shown whenever the mode is on *or* somebody is audibly whispering, so it appears for a
 * proctor who is only listening and for one who joined late and never received the event.
 * *Go back to students* is the only way out, and it ends the mode for **every** proctor.
 */
@Component({
  selector: 'app-whisper-panel',
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './whisper-panel.html',
  styleUrl: './whisper-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WhisperPanel {
  readonly session = input.required<WhisperSession>();

  protected readonly initials = initials;

  protected readonly micLive = computed(() => this.session().micLive());
  protected readonly others = computed(() => this.session().others());

  protected label(participant: StreamVideoParticipant): string {
    return participant.name || participant.userId;
  }

  /** Publishing audio, which is what "unmuted" means to everyone else in the channel. */
  protected isAudible(participant: StreamVideoParticipant): boolean {
    return hasAudio(participant);
  }

  protected isSpeaking(participant: StreamVideoParticipant): boolean {
    return !!participant.isSpeaking;
  }
}
