import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { hasScreenShare } from '@stream-io/video-client';
import { Notifier } from '../../../core/errors/notifier';
import type { CallFacade } from '../../../core/stream/call-facade';
import { LatencyBadge } from '../../../shared/components/latency-badge/latency-badge';
import { NetworkQuality } from '../../../shared/components/network-quality/network-quality';
import { ParticipantTile } from '../../../shared/components/participant-tile/participant-tile';
import { RecordingBadge } from '../../../shared/components/recording-badge/recording-badge';

/**
 * What a student sees: their own two feeds and nothing else.
 *
 * No classmates, no proctor video, no roster - a student has no reason to see who else is
 * being watched. Both feeds run for the whole exam.
 */
@Component({
  selector: 'app-student-stage',
  imports: [
    MatButtonModule,
    MatIconModule,
    LatencyBadge,
    NetworkQuality,
    ParticipantTile,
    RecordingBadge,
  ],
  templateUrl: './student-stage.html',
  styleUrl: './student-stage.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudentStage {
  readonly exam = input.required<CallFacade>();
  readonly callId = input.required<string>();

  private readonly notifier = inject(Notifier);

  protected readonly me = computed(() => this.exam().localParticipant());
  protected readonly sharing = computed(() => {
    const me = this.me();
    return !!me && hasScreenShare(me);
  });
  protected readonly proctorCount = computed(
    () =>
      this.exam()
        .participants()
        .filter((p) => p.roles.includes('call_member_proctor')).length,
  );

  protected async share(): Promise<void> {
    const call = this.exam().call;
    // A proctored desktop is text, not motion: the content hint and a lower frame rate buy
    // legibility where it matters instead of spending bitrate on smoothness.
    call.screenShare.setSettings({ contentHint: 'text', maxFramerate: 15 });
    await this.notifier.attempt(() => call.screenShare.enable(), {
      what: 'Sharing your screen',
    });
  }

  protected async stopSharing(): Promise<void> {
    await this.notifier.attempt(() => this.exam().call.screenShare.disable(), {
      what: 'Stopping your screen share',
    });
  }
}
