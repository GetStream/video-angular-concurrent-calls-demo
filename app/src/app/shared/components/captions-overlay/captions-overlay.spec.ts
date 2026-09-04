import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { CallingState, type Call, type CallClosedCaption } from '@stream-io/video-client';
import { CallFacade } from '../../../core/stream/call-facade';
import { CaptionsOverlay } from './captions-overlay';

function caption(over: Partial<CallClosedCaption>): CallClosedCaption {
  return {
    id: 'c1',
    language: 'en',
    speaker_id: 'student-tom',
    start_time: '2026-09-04T10:00:00Z',
    end_time: '2026-09-04T10:00:02Z',
    text: 'my screen keeps stopping',
    ...over,
  } as CallClosedCaption;
}

function fakeCall(captions: BehaviorSubject<CallClosedCaption[]>) {
  const participants = new BehaviorSubject<unknown[]>([
    { userId: 'student-tom', name: 'Tom', sessionId: 's1', publishedTracks: [] },
  ]);
  return {
    state: {
      participants$: participants,
      localParticipant$: new BehaviorSubject(undefined),
      remoteParticipants$: new BehaviorSubject<unknown[]>([]),
      participantCount$: new BehaviorSubject(1),
      hasOngoingScreenShare$: new BehaviorSubject(false),
      callingState$: new BehaviorSubject(CallingState.JOINED),
      members$: new BehaviorSubject<unknown[]>([]),
      session$: new BehaviorSubject(undefined),
      backstage$: new BehaviorSubject(false),
      ownCapabilities$: new BehaviorSubject<unknown[]>([]),
      recording$: new BehaviorSubject(false),
      captioning$: new BehaviorSubject(true),
      closedCaptions$: captions,
      callStatsReport$: new BehaviorSubject(undefined),
    },
    microphone: { state: { optimisticStatus$: new BehaviorSubject('disabled') } },
    camera: { state: { optimisticStatus$: new BehaviorSubject('disabled') } },
    screenShare: { state: { status$: new BehaviorSubject('disabled') } },
    blockedAudioTracker: { autoplayBlocked$: new BehaviorSubject(false) },
    settings: [] as unknown[],
    updateClosedCaptionSettings(config: unknown) {
      this.settings.push(config);
    },
  };
}

describe('CaptionsOverlay', () => {
  it('renders each caption in the rolling window, with the speaker resolved to a name', () => {
    const captions = new BehaviorSubject<CallClosedCaption[]>([]);
    const call = fakeCall(captions);
    const facade = new CallFacade(call as unknown as Call, TestBed.inject(Injector));

    const fixture = TestBed.createComponent(CaptionsOverlay);
    fixture.componentRef.setInput('call', facade);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;

    // Nothing to show yet: no empty box hanging over the video.
    expect(host.querySelector('.captions')).toBeNull();

    captions.next([caption({})]);
    fixture.detectChanges();
    expect(host.querySelectorAll('.captions__line').length).toBe(1);
    expect(host.textContent).toContain('my screen keeps stopping');
    expect(host.querySelector('.captions__who')?.textContent?.trim()).toBe('Tom');

    // The SDK hands us a *new* array each time and trims it itself.
    captions.next([
      caption({}),
      caption({ start_time: '2026-09-04T10:00:03Z', text: 'second line' }),
    ]);
    fixture.detectChanges();
    expect(host.querySelectorAll('.captions__line').length).toBe(2);

    captions.next([]);
    fixture.detectChanges();
    expect(host.querySelector('.captions')).toBeNull();
  });

  it('falls back to the speaker id for someone who has already left', () => {
    const captions = new BehaviorSubject<CallClosedCaption[]>([
      caption({ speaker_id: 'student-gone' }),
    ]);
    const facade = new CallFacade(fakeCall(captions) as unknown as Call, TestBed.inject(Injector));

    const fixture = TestBed.createComponent(CaptionsOverlay);
    fixture.componentRef.setInput('call', facade);
    fixture.detectChanges();

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.captions__who')?.textContent?.trim(),
    ).toBe('student-gone');
  });

  it('pushes the retention settings onto the call', () => {
    const call = fakeCall(new BehaviorSubject<CallClosedCaption[]>([]));
    const facade = new CallFacade(call as unknown as Call, TestBed.inject(Injector));

    const fixture = TestBed.createComponent(CaptionsOverlay);
    fixture.componentRef.setInput('call', facade);
    fixture.detectChanges();

    expect(call.settings).toEqual([{ visibilityDurationMs: 2700, maxVisibleCaptions: 2 }]);
  });
});
