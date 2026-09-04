import { Directive, DestroyRef, ElementRef, effect, inject, input } from '@angular/core';
import type { Call } from '@stream-io/video-client';

/**
 * Marks a scrolling container as the call's viewport.
 *
 * Needed for two things at once: tracks scrolled out of view get unsubscribed, and the
 * SDK's sort presets treat visible tiles as pinned so a grid doesn't reshuffle under the
 * proctor's cursor while they are watching it.
 */
@Directive({
  selector: '[appCallViewport]',
})
export class CallViewport {
  readonly call = input.required<Call>();

  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private teardown?: () => void;

  constructor() {
    effect((onCleanup) => {
      this.teardown = this.call().setViewport(this.element.nativeElement) ?? undefined;
      onCleanup(() => this.release());
    });

    inject(DestroyRef).onDestroy(() => this.release());
  }

  private release(): void {
    this.teardown?.();
    this.teardown = undefined;
  }
}
