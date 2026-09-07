import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
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
import { LatencyBadge } from '../../../shared/components/latency-badge/latency-badge';
import { NetworkQuality } from '../../../shared/components/network-quality/network-quality';
import { ParticipantTile } from '../../../shared/components/participant-tile/participant-tile';
import { RecordingBadge } from '../../../shared/components/recording-badge/recording-badge';

/**
 * What a proctor sees: the students are the content.
 *
 * One column per student - camera above, screen below - scrolling sideways for the rest of
 * the cohort. A student who hasn't shared shows red, so the row is scannable rather than
 * something you have to read.
 */
@Component({
  selector: 'app-proctor-grid',
  imports: [
    MatButtonModule,
    MatIconModule,
    CallViewport,
    LatencyBadge,
    NetworkQuality,
    ParticipantTile,
    RecordingBadge,
  ],
  templateUrl: './proctor-grid.html',
  styleUrl: './proctor-grid.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProctorGrid {
  readonly exam = input.required<CallFacade>();
  readonly callId = input.required<string>();
  /** The proctors-only channel is open, so nothing this proctor says reaches a student. */
  readonly whisperOpen = input(false);

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
    // Students first, then alphabetical. Without a stable comparator the columns reshuffle
    // under the proctor's cursor every time someone starts speaking. Restored on teardown:
    // the sort belongs to the `Call`, which outlives this component.
    effect((onCleanup) => {
      const call = this.exam().call;
      const previous = call.getSortParticipantsBy();
      call.setSortParticipantsBy(combineComparators(byRole('call_member_student'), byName));
      onCleanup(() => call.setSortParticipantsBy(previous));
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
