import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import type { Call } from '@stream-io/video-client';
import { DeviceControls } from '../../../shared/components/device-controls/device-controls';

export interface SettingsDialogData {
  /** The call the pickers read from, and whose camera the background filter runs on. */
  call: Call;
  /** Other calls the same user holds, which must follow the mic and speaker choice. */
  mirrorTo: Call[];
}

/**
 * Device settings, mid-call.
 *
 * A `MatDialog` rather than a hand-rolled overlay like the whisper panel, and it needs no
 * theming of its own. `mat-select` renders its panel in a CDK overlay attached to the body,
 * outside this component's DOM, so a dropdown always takes the *application* theme rather
 * than the dialog's - which is only workable because the application theme is the call
 * palette. The dialog, its pickers and their panels all resolve from the same tokens.
 *
 * There is no camera preview here, unlike the lobby: in a call your own tile is already on
 * screen, so a second copy of your face would only take up room.
 */
@Component({
  selector: 'app-settings-dialog',
  imports: [MatButtonModule, MatDialogModule, DeviceControls],
  template: `
    <h2 mat-dialog-title>Settings</h2>
    <mat-dialog-content>
      <app-device-controls [call]="data.call" [mirrorTo]="data.mirrorTo" />
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton type="button" mat-dialog-close>Done</button>
    </mat-dialog-actions>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsDialog {
  protected readonly data = inject<SettingsDialogData>(MAT_DIALOG_DATA);
}
