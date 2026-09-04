import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Notifier } from './core/errors/notifier';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, MatButtonModule, MatIconModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly notifier = inject(Notifier);
  protected readonly fatal = this.notifier.fatal;

  protected retry(): void {
    const fatal = this.fatal();
    this.notifier.clearFatal();
    fatal?.retry?.();
  }

  protected dismiss(): void {
    this.notifier.clearFatal();
  }
}
