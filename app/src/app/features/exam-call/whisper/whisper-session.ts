import { DestroyRef, computed, signal, untracked, type Injector, type Signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { concatMap, distinctUntilChanged, filter, map } from 'rxjs';
import { hasAudio, type StreamVideoParticipant } from '@stream-io/video-client';
import type { Notifier } from '../../../core/errors/notifier';
import type { CallFacade } from '../../../core/stream/call-facade';

/**
 * The payload of the custom WS event that carries whisper mode between proctors.
 *
 * The discriminator lives *inside* the payload rather than in the event name because
 * `sendCustomEvent(payload)` arrives on every watching client as the SDK event named
 * `'custom'`, with whatever you sent under `event.custom`.
 */
interface WhisperSignal {
  type: 'whisper.start' | 'whisper.end';
  by: string;
  at: number;
}

/** The exam call is ducked rather than silenced while whispering, so nothing is missed. */
const DUCKED_VOLUME = 0.2;

/** What the two microphones and the exam volume should be, given the current state. */
interface MicIntent {
  whisperMic: boolean;
  examMic: boolean;
  examVolume: number;
}

/**
 * Whisper mode: the proctors-only audio channel that runs alongside the exam call.
 *
 * Two rules shape everything here:
 *
 * 1. **Mode is global to the call, not per-user.** One proctor pressing *Whisper* puts every
 *    proctor into it; one proctor pressing *Go back to students* takes every proctor out and
 *    mutes every whisper microphone. That symmetry is what removes the leak - there is never
 *    a moment where one proctor is unmuted to the students while colleagues are still
 *    whispering, so no whisper audio can reach a student through an open exam microphone.
 * 2. **Every proctor in the mode is muted in the exam call**, including one who is only
 *    listening and never pressed anything.
 *
 * A plain class, not a service: it belongs to the exam route and dies with it, and it needs
 * two `CallFacade`s that must tear down together.
 */
export class WhisperSession {
  /** The whisper call, for the panel's participant list and mic indicator. */
  readonly whisper: CallFacade;

  private readonly exam: CallFacade;
  private readonly notifier: Notifier;
  private readonly myUserId: string;

  /** Shared: set by any proctor's `whisper.start`, cleared by any proctor's `whisper.end`. */
  private readonly mode = signal(false);
  /** Per-user: am I currently unmuted to the other proctors? */
  private readonly engaged = signal(false);
  /**
   * What my exam microphone should be whenever the mode is not forcing it off. Ours rather
   * than the SDK's `prevStatus`/`resume()`, which is also written by the device-disconnect
   * path and by `applySettingsToStream` - so it is not a record of what the user wanted.
   */
  private readonly examMicIntent = signal(false);

  /** Ignores an out-of-order `whisper.start` that would resurrect a just-closed mode. */
  private lastAppliedAt = 0;

  /**
   * Remote proctors currently publishing audio in the whisper call.
   *
   * This is the safety net a one-shot event cannot provide. A custom event reaches only
   * clients that are already watching the call, so a proctor who joins mid-whisper - or
   * whose client reconnects - receives no `whisper.start` at all. Participant state, by
   * contrast, is *replayed*: it is hydrated from the SFU join response, so it is already
   * correct on that client's very first emission.
   *
   * **It is a way *into* the mode, never a way out of it.** Hearing the channel latches
   * `mode` (see the constructor) and only a `whisper.end` clears it. Treating it as a live
   * condition instead - `mode() || someoneAudible()` - is wrong in a way that reintroduces
   * the very leak this design removes: a proctor who joined mid-whisper would drop out of
   * the mode the moment every colleague happened to mute, with their exam microphone coming
   * back while those colleagues are still in the channel and free to unmute at any moment.
   * Audio going quiet says nothing about whether the mode is over.
   *
   * It still has a second, narrower job below: holding the exam microphone shut for the
   * moment *after* a `whisper.end`, until the whisper tracks have actually stopped.
   */
  private readonly someoneAudible: Signal<boolean>;

  /**
   * Is the channel open for me? Purely `mode`, which only a `whisper.end` clears.
   */
  readonly panelOpen: Signal<boolean>;

  /**
   * The exam microphone belongs to the reconciler, not the user, whenever the mode is on
   * *or* whisper audio is still arriving. The second half is the tail guard: `whisper.end`
   * closes the panel at once, but a colleague's track takes a moment to stop, and letting
   * this microphone open into that tail is how the last fragment of a whisper would reach
   * the students.
   */
  readonly examMicHeld: Signal<boolean>;

  /** Am I audible to the other proctors? Optimistic, so the indicator never lags a click. */
  readonly micLive: Signal<boolean>;

  /** The other proctors in the channel, for the panel. */
  readonly others: Signal<StreamVideoParticipant[]>;

  private readonly desired: Signal<MicIntent>;

  constructor(opts: {
    exam: CallFacade;
    whisper: CallFacade;
    notifier: Notifier;
    injector: Injector;
    myUserId: string;
    examMicOn: boolean;
  }) {
    this.exam = opts.exam;
    this.whisper = opts.whisper;
    this.notifier = opts.notifier;
    this.myUserId = opts.myUserId;
    this.examMicIntent.set(opts.examMicOn);

    const injector = opts.injector;
    const destroyRef = injector.get(DestroyRef);

    const audible$ = this.whisper.call.state.participants$.pipe(
      map((participants) => participants.some((p) => !p.isLocalParticipant && hasAudio(p))),
      distinctUntilChanged(),
    );
    this.someoneAudible = toSignal(audible$, { injector, initialValue: false });

    // Hearing the channel puts you in the mode. `distinctUntilChanged` above makes this a
    // rising edge, which is what stops it fighting the exit: after a `whisper.end` the remote
    // tracks are still stopping, so the value stays `true` for a moment and emits nothing
    // new - it cannot re-latch a mode that has just been closed.
    audible$
      .pipe(filter(Boolean), takeUntilDestroyed(destroyRef))
      .subscribe(() => this.mode.set(true));

    this.panelOpen = computed(() => this.mode());
    this.examMicHeld = computed(() => this.mode() || this.someoneAudible());
    this.micLive = computed(() => this.whisper.micOn());
    this.others = computed(() => this.whisper.participants().filter((p) => !p.isLocalParticipant));

    this.desired = computed(() => {
      const held = this.examMicHeld();
      return {
        whisperMic: this.mode() && this.engaged(),
        examMic: held ? false : this.examMicIntent(),
        // Ducked while the microphone is held, so the exam call cannot come back to full
        // volume while the last of a whisper is still playing.
        examVolume: held ? DUCKED_VOLUME : 1,
      };
    });

    // Custom events reach only clients watching the call, and the sender is not echoed its
    // own event - so the handler has to be idempotent and the sender applies the same
    // transition to itself once the event has been accepted.
    const off = this.whisper.call.on('custom', (event) => {
      const payload = event.custom as Partial<WhisperSignal> | undefined;
      if (payload?.type !== 'whisper.start' && payload?.type !== 'whisper.end') return;
      const at = typeof payload.at === 'number' ? payload.at : 0;
      if (at < this.lastAppliedAt) return;
      this.lastAppliedAt = at;
      this.apply(payload.type);
    });
    destroyRef.onDestroy(off);

    // State propagation, driven by an explicit single-flight queue rather than an effect:
    // an `async` effect silently stops tracking after its first `await`, breaks the
    // `onCleanup` contract, and effects are not meant to propagate state in the first place.
    toObservable(this.desired, { injector })
      .pipe(
        distinctUntilChanged(sameIntent),
        // concatMap, never switchMap: a half-finished microphone hand-off must never be
        // abandoned, or the proctor is left publishing in the wrong call.
        concatMap(() => this.reconcile()),
        takeUntilDestroyed(destroyRef),
      )
      .subscribe();
  }

  /**
   * *Whisper*: put every proctor into the mode, and unmute myself to them.
   *
   * The event goes first and the local state follows, which costs a round trip of button
   * latency and buys the absence of a whole class of bug. An optimistic version would
   * unmute the whisper microphone while the request was still in flight, so a request that
   * then failed would leave every *other* proctor latched into a mode by the audio they
   * briefly heard - with the proctor who started it showing no panel and no way to end it.
   * Failing before anything changes anywhere is worth 150ms.
   */
  async start(): Promise<void> {
    if (this.mode()) return;
    const at = Date.now();
    if (!(await this.send('whisper.start', at))) return;

    this.lastAppliedAt = at;
    this.mode.set(true);
    this.engaged.set(true);
  }

  /**
   * *Go back to students*: end the mode for everyone and mute every whisper microphone.
   *
   * Event first here too, and for a sharper reason: leaving the mode locally is what brings
   * this proctor's exam microphone back, so doing it before the event is accepted is exactly
   * the asymmetry the shared mode exists to prevent - out with the students while colleagues
   * are still in the channel. On failure we stay in, and the snackbar says so. This is the
   * one control that fails *closed*.
   */
  async end(): Promise<void> {
    const at = Date.now();
    if (!(await this.send('whisper.end', at))) return;

    this.lastAppliedAt = at;
    this.apply('whisper.end');
  }

  /** The panel's own mute button: only ever changes whether *I* am audible. */
  toggleMic(): void {
    if (!this.mode()) return;
    this.engaged.update((engaged) => !engaged);
  }

  /** The exam call's mic button, while the mode is off. */
  setExamMicIntent(on: boolean): void {
    this.examMicIntent.set(on);
  }

  /** "End exam" ends both calls: the whisper channel must never outlive the exam. */
  async endBothCalls(): Promise<void> {
    await this.notifier.attempt(
      async () => {
        const results = await Promise.allSettled([
          this.exam.call.endCall(),
          this.whisper.call.endCall(),
        ]);
        const failure = results.find((r) => r.status === 'rejected');
        if (failure?.status === 'rejected') throw failure.reason;
      },
      { what: 'Ending the exam' },
    );
  }

  private apply(type: WhisperSignal['type']): void {
    if (type === 'whisper.start') {
      // Only the initiator is unmuted; everyone else joins the mode as a listener.
      this.mode.set(true);
      return;
    }
    // The only way out, for everybody. Nothing else clears `mode` - in particular, the
    // channel going quiet does not.
    this.mode.set(false);
    this.engaged.set(false);
  }

  private async send(type: WhisperSignal['type'], at: number): Promise<boolean> {
    const payload: WhisperSignal = { type, by: this.myUserId, at };
    const result = await this.notifier.attempt(
      () => this.whisper.call.sendCustomEvent({ ...payload }),
      { what: type === 'whisper.start' ? 'Starting the whisper' : 'Leaving the whisper' },
    );
    return result.ok;
  }

  /**
   * Bring both microphones in line with `desired`.
   *
   * Invariants:
   * - **Release before acquire, in both directions**, so two publishing captures never
   *   coexist. The SDK cannot help here: `statusChangeSettled` is per-manager (its
   *   concurrency tag is an instance `Symbol`), so it gives no cross-call protection, and
   *   cancellation does not abort an in-flight `unmuteStream()` - it finishes
   *   `getUserMedia` and publishes. The queue in the constructor is what serialises them.
   * - **Converge in a loop**: the proctor may have clicked again mid-hand-off, so re-read
   *   the intent after the awaits rather than trusting the value we started with.
   * - **Fall back to safe on failure.** `enable()` genuinely fails in the field - a revoked
   *   permission, a `NotReadableError`, a refused publish - and without this a failed
   *   unmute leaves the proctor silently muted in *both* calls.
   */
  private async reconcile(): Promise<void> {
    const examMic = this.exam.call.microphone;
    const whisperMic = this.whisper.call.microphone;

    for (let pass = 0; pass < 5; pass++) {
      const want = untracked(this.desired);
      this.exam.call.speaker.setVolume(want.examVolume);

      const examOn = examMic.state.status === 'enabled';
      const whisperOn = whisperMic.state.status === 'enabled';
      if (examOn === want.examMic && whisperOn === want.whisperMic) return;

      const result = await this.notifier.attempt(
        async () => {
          if (examOn && !want.examMic) await examMic.disable();
          if (whisperOn && !want.whisperMic) await whisperMic.disable();
          if (!examOn && want.examMic) await examMic.enable();
          if (!whisperOn && want.whisperMic) await whisperMic.enable();
        },
        { what: 'Switching your microphone' },
      );

      if (!result.ok) {
        // Drop out of the whisper, but leave `mode` alone - it is shared state, and only a
        // `whisper.end` from a proctor clears it.
        this.engaged.set(false);
        await Promise.allSettled([examMic.disable(), whisperMic.disable()]);
        return;
      }
    }
  }
}

function sameIntent(a: MicIntent, b: MicIntent): boolean {
  return a.whisperMic === b.whisperMic && a.examMic === b.examMic && a.examVolume === b.examVolume;
}
