import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { Call, CallRecording } from '@stream-io/video-client';
import { CurrentUser } from '../../core/auth/current-user';
import type { DemoUser } from '../../core/models/demo-user.model';
import {
  CallRecordings,
  type CallSummary,
  type RecordingsResult,
} from '../../core/stream/call-recordings';
import { VideoClient } from '../../core/stream/video-client';
import { Recordings } from './recordings';

const PROCTOR: DemoUser = { id: 'proctor-john', name: 'John', role: 'proctor', token: 't' };

class FakeCurrentUser {
  readonly user = signal<DemoUser | null>(PROCTOR);
  readonly isProctor = signal(true);
  restore(): DemoUser | null {
    return this.user();
  }
  async signOut(): Promise<void> {
    this.user.set(null);
  }
}

function summary(overrides: Partial<CallSummary> & { id: string }): CallSummary {
  const type = overrides.type ?? 'default';
  return {
    call: {} as Call,
    createdAt: new Date('2026-09-04T12:00:00Z'),
    memberCount: 3,
    ...overrides,
    cid: `${type}:${overrides.id}`,
    type,
    label: type === 'audio_room' ? 'Whisper' : 'Exam',
  };
}

function recording(start: string, seconds: number, ext = 'mp4'): CallRecording {
  const from = Date.parse(start);
  return {
    start_time: new Date(from).toISOString(),
    end_time: new Date(from + seconds * 1000).toISOString(),
    filename: `rec.${ext}`,
    url: `https://cdn.example/rec-${start}.${ext}?Expires=1789743751`,
    recording_type: 'composite',
    session_id: 'session-1',
  };
}

async function setup(calls: CallSummary[], result?: RecordingsResult) {
  const api = {
    listCalls: vi.fn().mockResolvedValue(calls),
    recordingsFor: vi.fn().mockResolvedValue(result ?? { status: 'ok', recordings: [] }),
  };
  TestBed.configureTestingModule({
    imports: [Recordings],
    providers: [
      provideRouter([]),
      { provide: CurrentUser, useValue: new FakeCurrentUser() },
      { provide: CallRecordings, useValue: api },
      { provide: VideoClient, useValue: {} },
    ],
  });
  const fixture = TestBed.createComponent(Recordings);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, api };
}

const el = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;
const text = (fixture: { nativeElement: unknown }) =>
  (el(fixture).textContent ?? '').replace(/\s+/g, ' ');
const rows = (fixture: { nativeElement: unknown }) =>
  Array.from(el(fixture).querySelectorAll<HTMLElement>('app-call-row'));

async function press(fixture: Awaited<ReturnType<typeof setup>>['fixture'], row: number) {
  rows(fixture)[row].querySelector<HTMLButtonElement>('.call__fetch')!.click();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('Recordings screen', () => {
  it('lists the calls, labelled by which channel they are', async () => {
    const { fixture } = await setup([
      summary({ id: 'exam-1' }),
      summary({ id: 'exam-1', type: 'audio_room' }),
    ]);

    expect(rows(fixture)).toHaveLength(2);
    expect(rows(fixture)[0].textContent).toContain('Exam');
    expect(rows(fixture)[0].textContent).toContain('default:exam-1');
    expect(rows(fixture)[1].textContent).toContain('Whisper');
    expect(text(fixture)).toContain('3 members');
  });

  it('fetches nothing until a row is asked, because that is one request per call', async () => {
    const { fixture, api } = await setup([summary({ id: 'a' }), summary({ id: 'b' })], {
      status: 'ok',
      recordings: [recording('2026-09-04T12:00:00Z', 125)],
    });

    expect(api.listCalls).toHaveBeenCalledTimes(1);
    expect(api.recordingsFor).not.toHaveBeenCalled();

    await press(fixture, 0);

    expect(api.recordingsFor).toHaveBeenCalledTimes(1);
    expect(rows(fixture)[0].textContent).toContain('2m 5s');
    // Only the row that was asked - the other one is still untouched.
    expect(rows(fixture)[1].querySelector('.rec')).toBeNull();
  });

  it('opens a recording through its pre-signed URL in a new tab', async () => {
    const { fixture } = await setup([summary({ id: 'a' })], {
      status: 'ok',
      recordings: [recording('2026-09-04T12:00:00Z', 60)],
    });
    await press(fixture, 0);

    const link = el(fixture).querySelector<HTMLAnchorElement>('.rec__open')!;
    expect(link.getAttribute('href')).toContain('Expires=');
    // Cross-origin and pre-signed, so a `download` attribute would be ignored; handing the
    // URL to a new tab is the only thing that works from a browser.
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener');
  });

  it('re-fetches when a row is re-opened, because the links expire', async () => {
    const { fixture, api } = await setup([summary({ id: 'a' })], {
      status: 'ok',
      recordings: [recording('2026-09-04T12:00:00Z', 60)],
    });

    await press(fixture, 0); // open
    await press(fixture, 0); // hide
    await press(fixture, 0); // open again

    expect(api.recordingsFor).toHaveBeenCalledTimes(2);
  });

  it('says a refusal is permanent and names the call type', async () => {
    const { fixture } = await setup([summary({ id: 'a', type: 'audio_room' })], {
      status: 'refused',
    });
    await press(fixture, 0);

    expect(text(fixture)).toContain('Not allowed to list recordings');
    expect(text(fixture)).toContain('audio_room');
    expect(el(fixture).querySelector('.found__note button')).toBeNull();
  });

  it('offers a retry for a transient failure, which a refusal does not get', async () => {
    const { fixture, api } = await setup([summary({ id: 'a' })], { status: 'failed' });
    await press(fixture, 0);

    expect(text(fixture)).toContain("Couldn't load");
    const retry = el(fixture).querySelector<HTMLButtonElement>('.found__note button')!;
    retry.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(api.recordingsFor).toHaveBeenCalledTimes(2);
  });

  it('shows an empty row rather than nothing when a call has no recordings', async () => {
    const { fixture } = await setup([summary({ id: 'a' })], { status: 'ok', recordings: [] });
    await press(fixture, 0);

    expect(text(fixture)).toContain('No recordings.');
  });

  it('marks a call that has not ended as still live', async () => {
    const { fixture } = await setup([
      summary({ id: 'live' }),
      summary({ id: 'done', endedAt: new Date('2026-09-04T13:00:00Z') }),
    ]);

    expect(rows(fixture)[0].querySelector('.call__state')?.textContent?.trim()).toBe('live');
    expect(rows(fixture)[1].querySelector('.call__state')?.textContent?.trim()).toBe('ended');
  });

  it('reloads the call list on refresh', async () => {
    const { fixture, api } = await setup([summary({ id: 'a' })]);

    el(fixture).querySelector<HTMLButtonElement>('.page__head button')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(api.listCalls).toHaveBeenCalledTimes(2);
  });
});
