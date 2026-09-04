import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import type { MemberRequest } from '@stream-io/video-client';
import { CurrentUser } from '../../core/auth/current-user';
import { Notifier } from '../../core/errors/notifier';
import { ExamChannel } from '../../core/stream/exam-channel';
import { EXAM_CALL_TYPE, LobbyCall } from '../../core/stream/lobby-call';
import { AppHeader } from '../../shared/components/app-header/app-header';
import { DeviceSetup } from './device-setup/device-setup';
import { MemberPicker } from './member-picker/member-picker';

/** Readable ids like `spry-otter-42` beat a UUID when you have to say one out loud. */
const WORDS_A = ['brave', 'calm', 'swift', 'quiet', 'clever', 'bright', 'spry', 'keen'];
const WORDS_B = ['otter', 'heron', 'lynx', 'falcon', 'marten', 'ibex', 'crane', 'shrike'];

function generateCallId(): string {
  const pick = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
  return `${pick(WORDS_A)}-${pick(WORDS_B)}-${Math.floor(10 + Math.random() * 89)}`;
}

@Component({
  selector: 'app-lobby',
  imports: [
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    AppHeader,
    DeviceSetup,
    MemberPicker,
  ],
  templateUrl: './lobby.html',
  styleUrl: './lobby.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Lobby {
  /** Present when arriving on a call link; puts the screen straight into Join mode. */
  readonly linkedCallId = input<string | undefined>(undefined, { alias: 'call_id' });

  private readonly currentUser = inject(CurrentUser);
  private readonly lobbyCall = inject(LobbyCall);
  private readonly examChannel = inject(ExamChannel);
  private readonly notifier = inject(Notifier);
  private readonly router = inject(Router);

  protected readonly user = this.currentUser.user;
  protected readonly isProctor = this.currentUser.isProctor;
  protected readonly call = this.lobbyCall.call;
  protected readonly callType = EXAM_CALL_TYPE;

  /** A student has no Create tab at all, so there is no tab bar to render for them. */
  protected readonly tab = signal<'create' | 'join'>('create');
  protected readonly activeTab = computed(() =>
    this.isProctor() ? this.tab() : ('join' as const),
  );

  /** Generated once for the Create tab, so the shareable link exists before you start. */
  protected readonly newCallId = signal(generateCallId());
  protected readonly joinCallId = signal('');

  protected readonly proctorIds = signal<string[]>([]);
  protected readonly studentIds = signal<string[]>([]);
  protected readonly starting = signal(false);
  /** Both pickers report their load state, so the CTA can wait for the rosters. */
  private readonly proctorsLoading = signal(true);
  private readonly studentsLoading = signal(true);
  protected readonly rostersLoading = computed(
    () => this.proctorsLoading() || this.studentsLoading(),
  );
  protected readonly joining = signal(false);

  protected readonly shareLink = computed(
    () => `${location.origin}/?call_id=${this.newCallId()}`,
  );
  protected readonly canJoin = computed(() => this.joinCallId().trim().length > 0);

  constructor() {
    // A call link means you already know which call you want: start on Join, prefilled.
    effect(() => {
      const linked = this.linkedCallId();
      if (linked) {
        this.joinCallId.set(linked);
        this.tab.set('join');
      }
    });

    // The preview follows whichever id is in play, so what you set up is what you join.
    effect(() => {
      const id = this.activeTab() === 'create' ? this.newCallId() : this.joinCallId().trim();
      if (id) void this.lobbyCall.previewFor(id);
    });

    // Keep the creator on their own roster, un-removably.
    effect(() => {
      const me = this.user();
      if (me?.role === 'proctor' && !this.proctorIds().includes(me.id)) {
        this.proctorIds.update((ids) => [me.id, ...ids]);
      }
    });
  }

  protected setProctorsLoading(loading: boolean): void {
    this.proctorsLoading.set(loading);
  }

  protected setStudentsLoading(loading: boolean): void {
    this.studentsLoading.set(loading);
  }

  protected selectTab(tab: 'create' | 'join'): void {
    this.tab.set(tab);
  }

  protected async copyLink(): Promise<void> {
    const result = await this.notifier.attempt(
      () => navigator.clipboard.writeText(this.shareLink()),
      { what: 'Copying the call link' },
    );
    if (result.ok) this.notifier.notify('Call link copied.');
  }

  protected async pasteCallId(): Promise<void> {
    const result = await this.notifier.attempt(() => navigator.clipboard.readText(), {
      what: 'Reading the clipboard',
    });
    if (!result.ok) return;
    // Accept either a bare id or a full call link.
    const value = result.value.trim();
    const fromLink = /[?&]call_id=([^&\s]+)/.exec(value);
    this.joinCallId.set(fromLink ? fromLink[1] : value);
  }

  /**
   * Create the call server-side, then navigate. Creating here rather than in the call
   * route keeps the roster in one place and means the link is valid the moment it appears.
   */
  protected async startExam(): Promise<void> {
    const me = this.user();
    // Guard as well as disable: an empty roster produces a call nobody can join.
    if (!me || this.starting() || this.rostersLoading()) return;

    this.starting.set(true);
    const callId = this.newCallId();
    const call = await this.lobbyCall.previewFor(callId);

    // The member `role` is the ONLY source of in-call capability, so these two lists are
    // load-bearing, not decoration: a student listed here can publish and screen-share,
    // and anyone absent cannot join the call at all.
    const members: MemberRequest[] = [
      ...this.proctorIds().map((id) => ({ user_id: id, role: 'call_member_proctor' })),
      ...this.studentIds()
        .filter((id) => !this.proctorIds().includes(id))
        .map((id) => ({ user_id: id, role: 'call_member_student' })),
    ];

    const result = await this.notifier.attempt(
      () => call.getOrCreate({ data: { members, custom: { mode: 'exam' } } }),
      { what: 'Creating the exam call', fatal: true, retry: () => void this.startExam() },
    );
    if (!result.ok) {
      this.starting.set(false);
      return;
    }

    // The room is created here, right after the call, with the same roster - one intent,
    // two get-or-creates. Nothing else creates it, so membership can never drift.
    await this.examChannel.createFor(
      callId,
      members.map((member) => member.user_id),
    );

    this.starting.set(false);
    await this.router.navigate(['/exam', callId]);
  }

  protected async joinExam(): Promise<void> {
    const callId = this.joinCallId().trim();
    if (!callId || this.joining()) return;
    this.joining.set(true);
    await this.lobbyCall.previewFor(callId);
    this.joining.set(false);
    await this.router.navigate(['/exam', callId]);
  }
}
