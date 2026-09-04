import type { OnInit } from '@angular/core';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Injector,
  computed,
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
import { AudioSink } from '../../shared/components/audio-sink/audio-sink';
import { ChatPanel } from './chat-panel/chat-panel';
import { ControlBar } from './control-bar/control-bar';
import { ProctorGrid } from './proctor-grid/proctor-grid';
import { StudentStage } from './student-stage/student-stage';

/**
 * The exam call route. Joins the call, then renders the layout for your role.
 *
 * The `Call` object usually comes from the lobby via `reuseInstance`, so the camera is
 * already running and the background filter already registered - the transition shows no
 * flicker and re-acquires no devices. Arriving straight on a link (no lobby) works too;
 * the instance is simply created here instead.
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
  ],
  templateUrl: './exam-call.html',
  styleUrl: './exam-call.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExamCall implements OnInit {
  readonly callId = input.required<string>();

  private readonly video = inject(VideoClient);
  private readonly lobbyCall = inject(LobbyCall);
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

  /** Open by default: in an exam the room is the only way a student can ask anything. */
  protected readonly chatOpen = signal(true);

  protected toggleChat(): void {
    this.chatOpen.update((open) => !open);
  }

  private call?: Call;
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

    inject(DestroyRef).onDestroy(() => {
      removeEventListener('pagehide', this.onPageHide);
      void this.teardown();
    });
  }

  private async enter(): Promise<void> {
    const call = this.video.callFor(EXAM_CALL_TYPE, this.callId(), { reuse: true });
    this.call = call;
    this.exam.set(new CallFacade(call, this.injector));

    // This demo never surfaces a "you appear to be speaking while muted" hint, and the
    // detector behind it opens a *second* getUserMedia for every muted participant - with
    // `deviceId: { exact: undefined }` when no mic was explicitly selected, which is where
    // the `OverconstrainedError` warning came from. Turning it off removes both.
    await call.microphone.disableSpeakingWhileMutedNotification();
    call.microphone.setSilenceThreshold(0);

    // Replay the lobby's device choices. A student's camera stays on for the whole exam,
    // so it is forced on here regardless of what the lobby had.
    await this.devices.applyTo(call);
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
  }

  protected async leaveCall(): Promise<void> {
    await this.teardown();
    await this.router.navigate(['/lobby']);
  }

  protected async backToLobby(): Promise<void> {
    await this.router.navigate(['/lobby']);
  }

  private async teardown(): Promise<void> {
    const call = this.call;
    this.call = undefined;
    if (!call) return;
    // leave() throws if the call has already left - which happens routinely, because the
    // SDK leaves by itself when someone ends the call.
    if (call.state.callingState === CallingState.LEFT) return;
    await call.leave({ message: 'left the exam route' }).catch(() => undefined);
  }
}
