import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import {
  CallRecordings,
  durationOf,
  isAudioOnly,
  type CallSummary,
  type RecordingsResult,
} from '../../../core/stream/call-recordings';

/**
 * One call in the list, with its recordings fetched on demand.
 *
 * Nothing is loaded until the button is pressed, which is the point: `listRecordings` is one
 * request per call, so a screen that fetched all of them up front would fire thirty requests
 * to show a list of thirty calls - and be rate-limited for it. It also means the pre-signed
 * URLs in a row are always minutes old rather than however long the tab has been open, so
 * re-opening a row re-fetches rather than showing links that may have expired.
 */
@Component({
  selector: 'app-call-row',
  imports: [DatePipe, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './call-row.html',
  styleUrl: './call-row.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CallRow {
  readonly summary = input.required<CallSummary>();

  private readonly api = inject(CallRecordings);

  protected readonly open = signal(false);
  protected readonly loading = signal(false);
  protected readonly result = signal<RecordingsResult | null>(null);

  protected readonly recordings = computed(() => {
    const result = this.result();
    return result?.status === 'ok' ? result.recordings : [];
  });

  protected readonly durationOf = durationOf;
  protected readonly isAudioOnly = isAudioOnly;

  protected async toggle(): Promise<void> {
    if (this.open()) {
      this.open.set(false);
      return;
    }
    this.open.set(true);
    this.loading.set(true);
    this.result.set(await this.api.recordingsFor(this.summary()));
    this.loading.set(false);
  }

  protected async retry(): Promise<void> {
    this.loading.set(true);
    this.result.set(await this.api.recordingsFor(this.summary()));
    this.loading.set(false);
  }
}
