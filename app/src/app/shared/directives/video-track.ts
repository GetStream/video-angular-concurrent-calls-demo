import { Directive, DestroyRef, ElementRef, effect, inject, input } from '@angular/core';
import type { Call, VideoTrackType } from '@stream-io/video-client';

/**
 * Binds a `<video>` element to a participant's track.
 *
 * The SDK's binding API is imperative and hands back teardown functions, so a directive -
 * not a template binding - is the right seam. Binding does more than attach a stream: it
 * measures the element with a `ResizeObserver` and asks the SFU for a layer that matches,
 * which is what makes a proctor grid of ~20 incoming videos affordable. Tracking visibility
 * on top of that unsubscribes tracks scrolled out of view.
 */
@Directive({
  selector: 'video[appVideoTrack]',
})
export class VideoTrack {
  readonly call = input.required<Call>();
  readonly sessionId = input.required<string>();
  readonly trackType = input<VideoTrackType>('videoTrack');
  /**
   * Report visibility to the SFU. Off where tracking cannot work - outside a viewport root,
   * or for the local participant, whose result `bindVideoElement` discards - so those cases
   * are stated rather than left looking tracked.
   */
  readonly trackVisibility = input(true);

  private readonly element = inject<ElementRef<HTMLVideoElement>>(ElementRef);
  private teardown: (() => void)[] = [];

  constructor() {
    const video = this.element.nativeElement;
    video.autoplay = true;
    video.playsInline = true;
    // Participant audio is played by a separate <audio> element; a muted video element
    // avoids double-playing it and dodges autoplay restrictions on the video itself.
    video.muted = true;

    effect((onCleanup) => {
      const call = this.call();
      const sessionId = this.sessionId();
      const trackType = this.trackType();

      // Both return undefined under SSR, and `bindVideoElement` also does for a session not
      // yet in call state - drive this from an @for over live participants and it cannot.
      this.teardown = [
        call.bindVideoElement(video, sessionId, trackType),
        this.trackVisibility()
          ? call.trackElementVisibility(video, sessionId, trackType)
          : undefined,
      ].filter((fn): fn is () => void => typeof fn === 'function');

      onCleanup(() => this.release());
    });

    inject(DestroyRef).onDestroy(() => this.release());
  }

  private release(): void {
    for (const fn of this.teardown) fn();
    this.teardown = [];
  }
}
