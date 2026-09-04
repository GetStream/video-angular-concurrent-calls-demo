import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import {
  combineComparators,
  hasScreenShare,
  name as byName,
  role as byRole,
  type StreamVideoParticipant,
} from '@stream-io/video-client';
import { Notifier } from '../../../core/errors/notifier';
import type { CallFacade } from '../../../core/stream/call-facade';
import { CallViewport } from '../../../shared/directives/call-viewport';
import { ParticipantTile } from '../../../shared/components/participant-tile/participant-tile';

/** Small camera tiles never need more than this; the screen shares are left uncapped. */
const CAMERA_RESOLUTION = { width: 320, height: 240 };

/**
 * What a proctor sees: the students are the content.
 *
 * One column per student - camera above, screen below - scrolling sideways for the rest of
 * the cohort. A student who hasn't shared shows red, so the row is scannable rather than
 * something you have to read.
 */
@Component({
  selector: 'app-proctor-grid',
  imports: [MatButtonModule, MatIconModule, CallViewport, ParticipantTile],
  templateUrl: './proctor-grid.html',
  styleUrl: './proctor-grid.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProctorGrid {
  readonly exam = input.required<CallFacade>();
  readonly callId = input.required<string>();

  private readonly notifier = inject(Notifier);

  protected readonly students = computed(() =>
    this.exam()
      .participants()
      .filter((p) => p.roles.includes('call_member_student')),
  );
  protected readonly proctors = computed(() =>
    this.exam()
      .participants()
      .filter((p) => p.roles.includes('call_member_proctor')),
  );
  protected readonly notSharing = computed(
    () => this.students().filter((p) => !hasScreenShare(p)).length,
  );

  constructor() {
    effect(() => {
      const exam = this.exam();

      // Students first, then alphabetical. Without a stable comparator the columns
      // reshuffle under the proctor's cursor every time someone starts speaking.
      exam.call.setSortParticipantsBy(combineComparators(byRole('call_member_student'), byName));
    });

    // Ask the SFU for small layers on the camera tiles only. The screen shares are where
    // detail actually matters, so they keep whatever the element size implies.
    effect(() => {
      const exam = this.exam();
      const cameraSessions = this.students().map((p) => p.sessionId);
      if (!cameraSessions.length) return;
      exam.call.setPreferredIncomingVideoResolution(CAMERA_RESOLUTION, cameraSessions);
    });
  }

  protected label(participant: StreamVideoParticipant): string {
    return participant.name || participant.userId;
  }

  protected async copyLink(): Promise<void> {
    const link = `${location.origin}/?call_id=${this.callId()}`;
    const result = await this.notifier.attempt(() => navigator.clipboard.writeText(link), {
      what: 'Copying the call link',
    });
    if (result.ok) this.notifier.notify('Call link copied.');
  }
}
