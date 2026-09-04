import { Directive, DestroyRef, ElementRef, effect, inject, input } from '@angular/core';
import type { AudioTrackType, Call } from '@stream-io/video-client';

/**
 * Binds an `<audio>` element to a participant's audio track.
 *
 * Audio is subscribed by the SFU whether or not an element is bound, and the SDK warns about
 * a participant publishing audio with nothing bound - so these elements should live in a
 * permanently mounted host rather than inside a conditional block, or the first moment of
 * speech is lost every time the block appears.
 */
@Directive({
  selector: 'audio[appAudioTrack]',
})
export class AudioTrack {
  readonly call = input.required<Call>();
  readonly sessionId = input.required<string>();
  readonly trackType = input<AudioTrackType>('audioTrack');

  private readonly element = inject<ElementRef<HTMLAudioElement>>(ElementRef);
  private teardown?: () => void;

  constructor() {
    const audio = this.element.nativeElement;
    audio.autoplay = true;

    effect((onCleanup) => {
      const call = this.call();
      const sessionId = this.sessionId();
      const trackType = this.trackType();

      // Returns undefined if the session isn't in call state yet, so drive this from an
      // @for over live participants rather than a hand-maintained list.
      this.teardown = call.bindAudioElement(audio, sessionId, trackType) ?? undefined;
      onCleanup(() => this.release());
    });

    inject(DestroyRef).onDestroy(() => this.release());
  }

  private release(): void {
    this.teardown?.();
    this.teardown = undefined;
  }
}
