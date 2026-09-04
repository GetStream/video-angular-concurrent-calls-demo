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
 * Deliberately a `MatDialog` rather than a hand-rolled overlay like the whisper panel, and
 * deliberately on the app's normal (light) surface rather than restyled to match the dark
 * call UI. The reason is the pickers: `mat-select` renders its panel in a CDK overlay
 * attached to the body, outside this component's DOM, so it takes the *application* theme
 * whatever the dialog looks like. Darkening the dialog by hand would leave every dropdown
 * it opens light - a fight that can only be won with global CSS reaching into Material
 * internals. A settings sheet floating over the call reads as a system surface, which is
 * what it is, and every control inside it is themed correctly for free.
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
