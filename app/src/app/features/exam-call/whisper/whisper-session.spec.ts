import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, Subject } from 'rxjs';
import { CallingState, type Call } from '@stream-io/video-client';
import { Notifier } from '../../../core/errors/notifier';
import { CallFacade } from '../../../core/stream/call-facade';
import { WhisperSession } from './whisper-session';

/**
 * The stub is deliberately small: only the state `CallFacade` reads and the handful of
 * device methods the reconciler drives. `enable`/`disable` mutate `status` the way the SDK
 * does, which is what makes the release-before-acquire ordering observable.
 */
function fakeCall() {
  const mic = {
    state: {
      status: 'disabled' as string | undefined,
      optimisticStatus$: new BehaviorSubject<string | undefined>('disabled'),
    },
    order: [] as string[],
    fail: false,
    async enable() {
      if (this.fail) throw new Error('No permission to publish');
      this.order.push('enable');
      this.state.status = 'enabled';
      this.state.optimisticStatus$.next('enabled');
    },
    async disable() {
      this.order.push('disable');
      this.state.status = 'disabled';
      this.state.optimisticStatus$.next('disabled');
    },
  };

  const custom = new Subject<{ custom: unknown }>();
  const call = {
    state: {
      participants$: new BehaviorSubject<unknown[]>([]),
      localParticipant$: new BehaviorSubject(undefined),
      remoteParticipants$: new BehaviorSubject<unknown[]>([]),
      participantCount$: new BehaviorSubject(0),
      hasOngoingScreenShare$: new BehaviorSubject(false),
      callingState$: new BehaviorSubject(CallingState.JOINED),
      members$: new BehaviorSubject<unknown[]>([]),
      session$: new BehaviorSubject(undefined),
      backstage$: new BehaviorSubject(false),
      ownCapabilities$: new BehaviorSubject<unknown[]>([]),
      recording$: new BehaviorSubject(false),
      captioning$: new BehaviorSubject(false),
      closedCaptions$: new BehaviorSubject<unknown[]>([]),
      callStatsReport$: new BehaviorSubject(undefined),
    },
    microphone: mic,
    camera: { state: { optimisticStatus$: new BehaviorSubject<string | undefined>('disabled') } },
    screenShare: { state: { status$: new BehaviorSubject<string | undefined>('disabled') } },
    speaker: {
      volume: 1,
      setVolume(v: number) {
        this.volume = v;
      },
    },
    sent: [] as unknown[],
    sendFails: false,
    async sendCustomEvent(payload: unknown) {
      if (this.sendFails) throw new Error('not allowed to perform action SendEvent');
      this.sent.push(payload);
      return {} as never;
    },
    async endCall() {
      return {} as never;
    },
    on(_event: string, fn: (e: { custom: unknown }) => void) {
      const sub = custom.subscribe(fn);
      return () => sub.unsubscribe();
    },
    emitCustom(payload: unknown) {
      custom.next({ custom: payload });
    },
  };
  return call;
}

type FakeCall = ReturnType<typeof fakeCall>;

/** A participant publishing audio, as `hasAudio` reads it. */
const audible = (userId: string) => ({
  userId,
  sessionId: `${userId}-session`,
  name: userId,
  isLocalParticipant: false,
  publishedTracks: [1], // TrackType.AUDIO
  roles: ['call_member_proctor'],
});

describe('WhisperSession', () => {
  let exam: FakeCall;
  let whisper: FakeCall;
  let session: WhisperSession;

  /** Flush the signal graph, then the reconciler's awaits. */
  async function settle(): Promise<void> {
    for (let i = 0; i < 6; i++) {
      TestBed.tick();
      await Promise.resolve();
      await Promise.resolve();
    }
  }

  function build(opts: { examMicOn?: boolean } = {}): void {
    const injector = TestBed.inject(Injector);
    session = new WhisperSession({
      exam: new CallFacade(exam as unknown as Call, injector),
      whisper: new CallFacade(whisper as unknown as Call, injector),
      notifier: TestBed.inject(Notifier),
      injector,
      myUserId: 'proctor-john',
      examMicOn: opts.examMicOn ?? false,
    });
  }

  beforeEach(() => {
    exam = fakeCall();
    whisper = fakeCall();
  });

  it('starts closed, with both microphones off', async () => {
    build();
    await settle();
    expect(session.panelOpen()).toBe(false);
    expect(exam.microphone.state.status).toBe('disabled');
    expect(whisper.microphone.state.status).toBe('disabled');
  });

  it('restores the exam microphone the user actually had, not the SDK default', async () => {
    build({ examMicOn: true });
    await settle();
    expect(exam.microphone.state.status).toBe('enabled');
  });

  it('releases the exam microphone before acquiring the whisper one', async () => {
    build({ examMicOn: true });
    await settle();
    exam.microphone.order = [];
    whisper.microphone.order = [];

    await session.start();
    await settle();

    expect(session.panelOpen()).toBe(true);
    expect(exam.microphone.order).toEqual(['disable']);
    expect(whisper.microphone.order).toEqual(['enable']);
    expect(exam.speaker.volume).toBe(0.2);
    expect(whisper.sent).toEqual([
      { type: 'whisper.start', by: 'proctor-john', at: expect.any(Number) },
    ]);
  });

  it("mutes a listener's exam microphone on a remote whisper.start without unmuting them", async () => {
    build({ examMicOn: true });
    await settle();

    whisper.emitCustom({ type: 'whisper.start', by: 'proctor-maya', at: Date.now() });
    await settle();

    expect(session.panelOpen()).toBe(true);
    expect(exam.microphone.state.status).toBe('disabled');
    // Only the proctor who pressed the button is audible to the others.
    expect(whisper.microphone.state.status).toBe('disabled');
  });

  it('opens for a late joiner from participant state alone, with no event', async () => {
    build({ examMicOn: true });
    await settle();

    // What a client that missed every event sees: the whisper call's participants, replayed
    // from the SFU join response.
    whisper.state.participants$.next([audible('proctor-maya')]);
    await settle();

    expect(session.panelOpen()).toBe(true);
    expect(exam.microphone.state.status).toBe('disabled');
  });

  it('takes every proctor out on a remote whisper.end and restores their own intent', async () => {
    build({ examMicOn: true });
    await settle();
    await session.start();
    await settle();

    whisper.emitCustom({ type: 'whisper.end', by: 'proctor-maya', at: Date.now() });
    await settle();

    expect(session.panelOpen()).toBe(false);
    expect(whisper.microphone.state.status).toBe('disabled');
    expect(exam.microphone.state.status).toBe('enabled');
    expect(exam.speaker.volume).toBe(1);
  });

  it('is not re-latched by whisper audio that lingers past whisper.end', async () => {
    build({ examMicOn: true });
    await settle();
    whisper.state.participants$.next([audible('proctor-maya')]);
    await settle();

    whisper.emitCustom({ type: 'whisper.end', by: 'proctor-maya', at: Date.now() });
    await settle();
    // Still audible, but `distinctUntilChanged` means no new emission - so the latch, which
    // fires on the rising edge only, cannot re-open what was just closed.
    whisper.state.participants$.next([audible('proctor-maya')]);
    await settle();

    expect(session.panelOpen()).toBe(false);
  });

  it('ignores an out-of-order whisper.start that would resurrect a closed mode', async () => {
    build();
    await settle();

    const early = Date.now() - 5_000;
    whisper.emitCustom({ type: 'whisper.end', by: 'proctor-maya', at: Date.now() });
    await settle();
    whisper.emitCustom({ type: 'whisper.start', by: 'proctor-samir', at: early });
    await settle();

    expect(session.panelOpen()).toBe(false);
  });

  it('changes nothing anywhere when whisper.start cannot be sent', async () => {
    whisper.sendFails = true;
    build({ examMicOn: true });
    await settle();

    await session.start();
    await settle();

    // The event goes first, so there is no optimistic window in which this client publishes
    // audio that would latch every *other* proctor into a mode nobody can end.
    expect(session.panelOpen()).toBe(false);
    expect(whisper.microphone.order).toEqual([]);
    expect(exam.microphone.state.status).toBe('enabled');
  });

  it('stays in the mode when whisper.end cannot be sent, rather than leaving alone', async () => {
    build({ examMicOn: true });
    await settle();
    await session.start();
    await settle();

    whisper.sendFails = true;
    await session.end();
    await settle();

    // Leaving locally is what brings the exam microphone back - doing that while colleagues
    // are still in the channel is the asymmetry the shared mode exists to prevent.
    expect(session.panelOpen()).toBe(true);
    expect(exam.microphone.state.status).toBe('disabled');
  });

  it('does not close when the channel goes quiet - only whisper.end closes it', async () => {
    build({ examMicOn: true });
    await settle();

    // What a proctor who joined mid-whisper sees: audio, and no event.
    whisper.state.participants$.next([audible('proctor-maya')]);
    await settle();
    expect(session.panelOpen()).toBe(true);

    // Everyone in the channel mutes themselves. The mode is still on for all of them, so
    // this client must not drop out of it - and must not open its exam microphone into a
    // channel a colleague can start speaking in again at any moment.
    whisper.state.participants$.next([{ ...audible('proctor-maya'), publishedTracks: [] }]);
    await settle();

    expect(session.panelOpen()).toBe(true);
    expect(session.examMicHeld()).toBe(true);
    expect(exam.microphone.state.status).toBe('disabled');

    // ...and the one thing that does close it, does.
    whisper.emitCustom({ type: 'whisper.end', by: 'proctor-maya', at: Date.now() });
    await settle();
    expect(session.panelOpen()).toBe(false);
    expect(exam.microphone.state.status).toBe('enabled');
  });

  it('holds the exam microphone shut through the audio tail after whisper.end', async () => {
    build({ examMicOn: true });
    await settle();
    whisper.state.participants$.next([audible('proctor-maya')]);
    await settle();

    // The event arrives before the remote track has actually stopped.
    whisper.emitCustom({ type: 'whisper.end', by: 'proctor-maya', at: Date.now() });
    await settle();

    expect(session.panelOpen()).toBe(false);
    expect(session.examMicHeld()).toBe(true);
    expect(exam.microphone.state.status).toBe('disabled');

    whisper.state.participants$.next([]);
    await settle();
    expect(session.examMicHeld()).toBe(false);
    expect(exam.microphone.state.status).toBe('enabled');
  });

  it('falls back to muted in both calls when the whisper microphone will not open', async () => {
    build({ examMicOn: true });
    await settle();
    whisper.microphone.fail = true;

    await session.start();
    await settle();

    expect(whisper.microphone.state.status).toBe('disabled');
    expect(exam.microphone.state.status).toBe('disabled');
  });
});
