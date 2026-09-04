import type { OnInit } from '@angular/core';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Injector,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { CallingState, type Call } from '@stream-io/video-client';
import { CurrentUser } from '../../core/auth/current-user';
import { Notifier } from '../../core/errors/notifier';
import { CallFacade } from '../../core/stream/call-facade';
import { DevicePreferences } from '../../core/stream/device-preferences';
import { EXAM_CALL_TYPE, LobbyCall } from '../../core/stream/lobby-call';
import { VideoClient } from '../../core/stream/video-client';
import { WhisperCall } from '../../core/stream/whisper-call';
import { AudioSink } from '../../shared/components/audio-sink/audio-sink';
import { ChatPanel } from './chat-panel/chat-panel';
import { ControlBar } from './control-bar/control-bar';
import { ProctorGrid } from './proctor-grid/proctor-grid';
import { StudentStage } from './student-stage/student-stage';
import { WhisperPanel } from './whisper/whisper-panel';
import { WhisperSession } from './whisper/whisper-session';

/**
 * The exam call route. Joins the call, then renders the layout for your role.
 *
 * The `Call` object usually comes from the lobby via `reuseInstance`, so the camera is
 * already running and the background filter already registered - the transition shows no
 * flicker and re-acquires no devices. Arriving straight on a link (no lobby) works too;
 * the instance is simply created here instead.
 *
 * A proctor is joined to **two** calls from here: the exam call and the proctors-only
 * whisper call. Both facades are built on this route's `Injector`, so every subscription
 * behind them dies when the route does.
 */
@Component({
  selector: 'app-exam-call',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    AudioSink,
    ChatPanel,
    ControlBar,
    ProctorGrid,
    StudentStage,
    WhisperPanel,
  ],
  templateUrl: './exam-call.html',
  styleUrl: './exam-call.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExamCall implements OnInit {
  readonly callId = input.required<string>();

  private readonly video = inject(VideoClient);
  private readonly lobbyCall = inject(LobbyCall);
  private readonly whisperCall = inject(WhisperCall);
  private readonly devices = inject(DevicePreferences);
  private readonly currentUser = inject(CurrentUser);
  private readonly notifier = inject(Notifier);
  private readonly injector = inject(Injector);
  private readonly router = inject(Router);

  protected readonly isProctor = this.currentUser.isProctor;
  protected readonly exam = signal<CallFacade | null>(null);
  protected readonly joining = signal(true);
  /** Set when the API refuses the join - almost always "not a member of this call". */
  protected readonly notOnRoster = signal(false);

  protected readonly joined = computed(() => this.exam()?.joined() ?? false);
  /** A proctor ended the call for everyone, and the SDK left on our behalf. */
  protected readonly ended = signal(false);

  /** Present for proctors once the whisper call is joined; never for students. */
  protected readonly whisper = signal<WhisperSession | null>(null);
  /** The whisper call could not be joined - a blocking state, see `enterWhisper`. */
  protected readonly whisperBlocked = signal(false);
  protected readonly retryingWhisper = signal(false);

  protected readonly whisperOpen = computed(() => this.whisper()?.panelOpen() ?? false);
  /**
   * The exam mic is the reconciler's, not the user's, while the channel is open - and for
   * the moment after it closes, until the whisper audio has actually stopped.
   */
  protected readonly micLocked = computed(
    () => (this.whisper()?.examMicHeld() ?? false) || this.whisperBlocked(),
  );

  /** Open by default: in an exam the room is the only way a student can ask anything. */
  protected readonly chatOpen = signal(true);

  protected toggleChat(): void {
    this.chatOpen.update((open) => !open);
  }

  private call?: Call;
  private whisperRef?: Call;
  /** Distinguishes "we left" from "the call ended under us", which look identical. */
  private leavingDeliberately = false;
  private readonly onPageHide = () => void this.teardown();

  /**
   * Joining lives here rather than in the constructor: route params arrive through
   * `withComponentInputBinding()`, so a required input is not yet bound while the
   * constructor runs - reading `callId()` there throws NG0950.
   */
  ngOnInit(): void {
    void this.enter();
  }

  constructor() {
    // The SDK registers no unload handler of its own, so a refresh or tab close would
    // leave a ghost participant until the SFU's disconnect timeout. `pagehide` rather than
    // `beforeunload`: the latter is unreliable on mobile and blocks the back/forward cache.
    // leave() cannot finish during unload, but it still stops local tracks and gives the
    // SFU an explicit leave frame.
    addEventListener('pagehide', this.onPageHide);

    // Nothing cascades between the two calls: `endCall()` marks one cid ended, and the
    // SDK's auto-leave on `call.ended` is per-call. So a proctor whose exam call ends would
    // otherwise sit in the whisper call indefinitely, holding a microphone with the
    // automatic recording still running. The whisper call must never outlive the exam call.
    effect(() => {
      const state = this.exam()?.callingState();
      if (state !== CallingState.LEFT && state !== CallingState.RECONNECTING_FAILED) return;
      void this.leaveWhisper();
      // The SDK leaves by itself when a proctor ends the call, so this is also where
      // everyone else finds out the exam is over - there is no event to wait for.
      if (state === CallingState.LEFT && !this.leavingDeliberately) this.ended.set(true);
    });

    inject(DestroyRef).onDestroy(() => {
      removeEventListener('pagehide', this.onPageHide);
      void this.teardown();
    });
  }

  private async enter(): Promise<void> {
    const call = this.video.callFor(EXAM_CALL_TYPE, this.callId(), { reuse: true });
    this.call = call;
    const exam = new CallFacade(call, this.injector);
    this.exam.set(exam);

    // This demo never surfaces a "you appear to be speaking while muted" hint, and the
    // detector behind it opens a *second* getUserMedia for every muted participant - with
    // `deviceId: { exact: undefined }` when no mic was explicitly selected, which is where
    // the `OverconstrainedError` warning came from. Turning it off removes both.
    await call.microphone.disableSpeakingWhileMutedNotification();
    call.microphone.setSilenceThreshold(0);

    // Replay the lobby's device choices - except that **a proctor always joins muted**,
    // whatever the lobby said. A proctor arriving while colleagues are already whispering
    // would otherwise be publishing to the students for the fraction of a second between
    // joining the exam call and learning the whisper state, with the whisper audio already
    // arriving in their speakers. The reconciler unmutes them to their stored preference
    // once it knows, and never if the whisper call could not be joined.
    await this.devices.applyTo(call, { mic: !this.isProctor() });

    // A student's camera stays on for the whole exam, so it is forced on regardless.
    if (!this.isProctor()) {
      await this.notifier.attempt(() => call.camera.enable(), {
        what: 'Turning on your camera',
      });
    }

    const result = await this.notifier.attempt(
      () => (call.state.callingState === CallingState.JOINED ? Promise.resolve() : call.join()),
      { what: 'Joining the exam call' },
    );
    this.joining.set(false);

    if (!result.ok) {
      // No app-level role carries `join-call`, so a student who was never added to this
      // call is refused server-side. That is the intended behaviour, not a bug - say so
      // in those terms rather than showing a raw permission error.
      this.notOnRoster.set(true);
      return;
    }

    // The lobby no longer owns the preview; this route does.
    this.lobbyCall.handOff();

    // Sequential, not `Promise.all`: two concurrent joins race two `applyDeviceConfig`
    // passes over the same devices.
    if (this.isProctor()) await this.enterWhisper(exam);
  }

  /**
   * Join the proctors-only channel.
   *
   * **A failed join is blocking for a proctor, not best-effort**, and the reason is safety
   * rather than tidiness: the leak interlock reads the whisper call's participants, which
   * only carry data while we are joined. A proctor who is in the exam call but not the
   * whisper call therefore cannot tell that colleagues are whispering, has no reason to
   * mute, and their open exam microphone is exactly the path whisper audio would reach
   * students by. So the microphone is held shut and the route is blocked until a retry
   * succeeds - never silently continued with the Whisper button disabled.
   */
  private async enterWhisper(exam: CallFacade): Promise<void> {
    const call = await this.whisperCall.enter(this.callId());
    if (!call) {
      await exam.call.microphone.disable().catch(() => undefined);
      this.whisperBlocked.set(true);
      return;
    }

    this.whisperRef = call;
    this.whisperBlocked.set(false);
    this.whisper.set(
      new WhisperSession({
        exam,
        whisper: new CallFacade(call, this.injector),
        notifier: this.notifier,
        injector: this.injector,
        myUserId: this.currentUser.user()?.id ?? '',
        // The stored preference, not the live device: the exam microphone is deliberately
        // still muted at this point (see `enter`), and this is the state to return to.
        examMicOn: this.devices.micOn(),
      }),
    );
  }

  protected async retryWhisper(): Promise<void> {
    const exam = this.exam();
    if (!exam || this.retryingWhisper()) return;
    this.retryingWhisper.set(true);
    await this.enterWhisper(exam);
    this.retryingWhisper.set(false);
  }

  protected async leaveCall(): Promise<void> {
    this.leavingDeliberately = true;
    await this.teardown();
    await this.router.navigate(['/lobby']);
  }

  protected async backToLobby(): Promise<void> {
    await this.router.navigate(['/lobby']);
  }

  /** Drop the whisper call on its own, when the exam call has gone away under us. */
  private async leaveWhisper(): Promise<void> {
    const call = this.whisperRef;
    this.whisperRef = undefined;
    this.whisper.set(null);
    if (call) await stop(call);
  }

  private async teardown(): Promise<void> {
    this.leavingDeliberately = true;
    const calls = [this.call, this.whisperRef].filter((call): call is Call => !!call);
    this.call = undefined;
    this.whisperRef = undefined;
    await Promise.allSettled(calls.map((call) => stop(call)));
  }
}

/**
 * `leave()` throws if the call has already left - which happens routinely, because the SDK
 * leaves by itself when someone ends the call. Every teardown path goes through this.
 */
async function stop(call: Call): Promise<void> {
  if (call.state.callingState === CallingState.LEFT) return;
  await call.leave({ message: 'left the exam route' }).catch(() => undefined);
}
