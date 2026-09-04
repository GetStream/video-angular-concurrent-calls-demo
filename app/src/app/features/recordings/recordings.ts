import { ChangeDetectionStrategy, Component, inject, resource } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { CallRecordings } from '../../core/stream/call-recordings';
import { AppHeader } from '../../shared/components/app-header/app-header';
import { CallRow } from './call-row/call-row';

/**
 * The calls you have been on, each able to produce its own recordings.
 *
 * A screen rather than an in-call control, because recordings outlive the call that made
 * them and the one you usually want belongs to an exam that has already ended. The two-level
 * shape - calls here, recordings inside a row - is not a layout choice: `listRecordings` is a
 * method on a call, so a flat list of recordings would mean one request per call on load.
 */
@Component({
  selector: 'app-recordings',
  imports: [MatButtonModule, MatIconModule, MatProgressSpinnerModule, AppHeader, CallRow],
  templateUrl: './recordings.html',
  styleUrl: './recordings.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Recordings {
  private readonly api = inject(CallRecordings);

  /** The call list only. Recordings are fetched by the row that asks for them. */
  protected readonly calls = resource({ loader: () => this.api.listCalls() });

  protected reload(): void {
    this.calls.reload();
  }
}
