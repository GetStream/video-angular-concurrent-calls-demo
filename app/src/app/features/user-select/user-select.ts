import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { DemoConfig } from '../../core/config/demo-config';
import { initials } from '../../core/models/demo-user.model';

/** Placeholder: step 3 builds the real picker. */
@Component({
  selector: 'app-user-select',
  imports: [MatCardModule],
  templateUrl: './user-select.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserSelect {
  private readonly config = inject(DemoConfig);
  protected readonly proctors = this.config.proctors;
  protected readonly students = this.config.students;
  protected readonly generatedAt = this.config.generatedAt;
  protected readonly initials = initials;
}
