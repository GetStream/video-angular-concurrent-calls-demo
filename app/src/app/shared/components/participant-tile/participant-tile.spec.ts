import { TestBed } from '@angular/core/testing';
import { SfuModels, type Call, type StreamVideoParticipant } from '@stream-io/video-client';
import { ParticipantTile } from './participant-tile';

const { TrackType } = SfuModels;

/** Only the bits the tile touches; the binding calls are no-ops in a unit test. */
const callStub = {
  bindVideoElement: () => () => undefined,
  trackElementVisibility: () => () => undefined,
} as unknown as Call;

function participant(overrides: Partial<StreamVideoParticipant> = {}): StreamVideoParticipant {
  return {
    sessionId: 'session-1',
    userId: 'student-tom',
    name: 'Tom',
    publishedTracks: [],
    roles: ['call_member_student'],
    ...overrides,
  } as StreamVideoParticipant;
}

function render(p: StreamVideoParticipant, trackType: 'videoTrack' | 'screenShareTrack' = 'videoTrack') {
  const fixture = TestBed.createComponent(ParticipantTile);
  fixture.componentRef.setInput('call', callStub);
  fixture.componentRef.setInput('participant', p);
  fixture.componentRef.setInput('trackType', trackType);
  fixture.detectChanges();
  const host = fixture.nativeElement as HTMLElement;
  return {
    fixture,
    mic: host.querySelector<HTMLElement>('.tile__mic'),
    icon: host.querySelector('.tile__mic mat-icon')?.textContent?.trim(),
  };
}

describe('ParticipantTile mic indicator', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [ParticipantTile] }));

  it('shows muted when the participant publishes no audio', () => {
    const { mic, icon } = render(participant({ publishedTracks: [] }));

    expect(icon).toBe('mic_off');
    expect(mic?.classList).toContain('tile__mic--off');
    expect(mic?.getAttribute('aria-label')).toBe('Microphone muted');
  });

  it('shows unmuted when an audio track is published', () => {
    const { mic, icon } = render(participant({ publishedTracks: [TrackType.AUDIO] }));

    expect(icon).toBe('mic');
    expect(mic?.classList).not.toContain('tile__mic--off');
    expect(mic?.getAttribute('aria-label')).toBe('Microphone on');
  });

  it('marks an unmuted participant who is currently speaking', () => {
    const { mic } = render(
      participant({ publishedTracks: [TrackType.AUDIO], isSpeaking: true }),
    );

    expect(mic?.classList).toContain('tile__mic--speaking');
  });

  it('never marks a muted participant as speaking, whatever the SFU says', () => {
    const { mic } = render(participant({ publishedTracks: [], isSpeaking: true }));

    expect(mic?.classList).not.toContain('tile__mic--speaking');
    expect(mic?.classList).toContain('tile__mic--off');
  });

  it('omits the indicator on a screen-share tile, which has no microphone', () => {
    const { mic } = render(
      participant({ publishedTracks: [TrackType.AUDIO] }),
      'screenShareTrack',
    );

    expect(mic).toBeNull();
  });
});
