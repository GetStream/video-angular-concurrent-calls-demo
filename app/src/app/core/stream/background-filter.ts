import { Injectable, inject, signal } from '@angular/core';
import { disposeOfMediaStream, type Call } from '@stream-io/video-client';
import {
  VirtualBackground,
  isMediaPipePlatformSupported,
  loadMediaPipe,
} from '@stream-io/video-filters-web';
import { Notifier } from '../errors/notifier';

export type BackgroundChoice = 'none' | 'blur';

/** Where the self-hosted MediaPipe model and wasm live - copied by the app's postinstall. */
const BASE_PATH = '/mediapipe';

/**
 * Virtual background, wired straight onto the camera's filter chain.
 *
 * There is no Angular equivalent of React's `BackgroundFiltersProvider`, but there doesn't
 * need to be: the provider reduces to `camera.registerFilter(...)` returning a processed
 * `MediaStream`, which is what this does. The filter registers on the camera *manager*, so
 * it survives the lobby → call transition as long as both use the same `Call` instance -
 * nothing is re-registered and the camera is never re-acquired.
 *
 * Note the published `@stream-io/video-filters-web` (0.8.7) has no `updateOptions` on
 * `VirtualBackground`, so an effect cannot be swapped in place - changing it means
 * unregistering and registering again. Only `none` and `blur` are offered here, so that
 * never happens mid-filter; adding background *images* later would need the newer SDK or
 * would pay a camera re-acquire per switch.
 */
@Injectable({ providedIn: 'root' })
export class BackgroundFilter {
  private readonly notifier = inject(Notifier);

  private readonly supportedState = signal<boolean | null>(null);
  private readonly choiceState = signal<BackgroundChoice>('none');
  private readonly loadingState = signal(false);
  private readonly degradedState = signal(false);

  /** `null` until probed; `false` means the control should not be offered at all. */
  readonly supported = this.supportedState.asReadonly();
  readonly choice = this.choiceState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  /** True when the filter can't keep up - a hint to turn it off, not an error. */
  readonly degraded = this.degradedState.asReadonly();

  private processor?: VirtualBackground;
  private unregister?: () => Promise<void>;

  /** Cheap enough to call on every lobby entry; the result is cached. */
  async probeSupport(): Promise<boolean> {
    const known = this.supportedState();
    if (known !== null) return known;
    const supported = await isMediaPipePlatformSupported();
    this.supportedState.set(supported);
    return supported;
  }

  async apply(call: Call, choice: BackgroundChoice): Promise<void> {
    if (!(await this.probeSupport())) return;

    await this.clear();
    if (choice === 'none') return;

    this.loadingState.set(true);
    const result = await this.notifier.attempt(
      async () => {
        // Warms the model cache so the first frame isn't stalled on a download.
        await loadMediaPipe({ basePath: BASE_PATH });

        const registration = call.camera.registerFilter((input) => {
          const [track] = input.getVideoTracks();
          let output: MediaStream | undefined;

          this.processor = new VirtualBackground(
            // The published typings name a `MediaStreamVideoTrack` global that TS's DOM lib
            // doesn't declare, so borrow the type from the constructor itself.
            track as ConstructorParameters<typeof VirtualBackground>[0],
            { backgroundFilter: 'blur', backgroundBlurLevel: 'high', basePath: BASE_PATH },
            {
              onError: (error) => {
                // The SDK disables a malfunctioning filter itself; say so and reset.
                this.notifier.notify('Background blur stopped working, so it was turned off.');
                console.error('[stream] background filter error:', error);
                void this.clear();
              },
              onStats: ({ fps }) => this.degradedState.set(fps > 0 && fps < 12),
            },
          );

          return {
            output: this.processor.start().then((processed) => {
              output = new MediaStream([processed]);
              return output;
            }),
            stop: () => {
              this.processor?.stop();
              this.processor = undefined;
              if (output) disposeOfMediaStream(output);
            },
          };
        });

        this.unregister = registration.unregister;
        // Resolves once the filtered stream is actually the one being published.
        await registration.registered;
      },
      { what: 'Turning on background blur' },
    );
    this.loadingState.set(false);

    if (result.ok) {
      this.choiceState.set(choice);
    } else {
      await this.clear();
    }
  }

  /** Remove the filter, restoring the raw camera stream. */
  async clear(): Promise<void> {
    const unregister = this.unregister;
    this.unregister = undefined;
    this.processor = undefined;
    this.degradedState.set(false);
    this.choiceState.set('none');
    if (!unregister) return;
    await this.notifier.attempt(() => unregister(), { what: 'Removing background blur' });
  }
}
