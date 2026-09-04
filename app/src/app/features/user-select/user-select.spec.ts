import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { provideRouter } from '@angular/router';
import { DemoConfig } from '../../core/config/demo-config';
import { CurrentUser } from '../../core/auth/current-user';
import type { DemoUser } from '../../core/models/demo-user.model';
import { UserSelect } from './user-select';

const CAST: DemoUser[] = [
  { id: 'proctor-john', name: 'John', role: 'proctor', token: 't1' },
  { id: 'proctor-maya', name: 'Maya', role: 'proctor', token: 't2' },
  { id: 'student-tom', name: 'Tom', role: 'student', token: 't3' },
  { id: 'student-ana', name: 'Ana', role: 'student', token: 't4' },
];

/** Stands in for the real service so no websocket is opened in a unit test. */
class FakeCurrentUser {
  signedInAs: DemoUser | null = null;
  result = true;
  /** The shared header renders from these, so the fake has to provide them too. */
  readonly user = signal<DemoUser | null>(null);
  readonly isProctor = computed(() => this.user()?.role === 'proctor');
  restore(): DemoUser | null {
    return null;
  }
  async signIn(user: DemoUser): Promise<boolean> {
    this.signedInAs = user;
    if (this.result) this.user.set(user);
    return this.result;
  }
  async signOut(): Promise<void> {
    this.user.set(null);
  }
}

async function setup(currentUser = new FakeCurrentUser()) {
  TestBed.configureTestingModule({
    imports: [UserSelect],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: CurrentUser, useValue: currentUser },
    ],
  });

  const loading = TestBed.inject(DemoConfig).load();
  TestBed.inject(HttpTestingController)
    .expectOne('demo-config.json')
    .flush({ apiKey: 'test-key', generatedAt: '2026-09-04T00:00:00.000Z', users: CAST });
  await loading;

  const fixture = TestBed.createComponent(UserSelect);
  const router = TestBed.inject(Router);
  const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
  fixture.detectChanges();
  return { fixture, currentUser, navigate };
}

const text = (fixture: { nativeElement: HTMLElement }) =>
  fixture.nativeElement.textContent ?? '';
const cards = (fixture: { nativeElement: HTMLElement }) =>
  Array.from(fixture.nativeElement.querySelectorAll<HTMLButtonElement>('.cast'));
const cta = (fixture: { nativeElement: HTMLElement }) =>
  fixture.nativeElement.querySelector<HTMLButtonElement>('.picker__cta')!;

describe('UserSelect', () => {
  it('renders the seeded cast split by role, with initials', async () => {
    const { fixture } = await setup();

    expect(cards(fixture)).toHaveLength(4);
    expect(text(fixture)).toContain('proctor-john');
    expect(text(fixture)).toContain('student-tom');
    expect(text(fixture)).toContain('JO');
    expect(text(fixture)).toContain('CREATE + JOIN');
    expect(text(fixture)).toContain('JOIN ONLY');
  });

  it('pre-selects the first proctor so the common path is one click', async () => {
    const { fixture } = await setup();

    expect(cards(fixture)[0].classList).toContain('cast--selected');
    expect(cta(fixture).textContent).toContain('Continue as proctor-john');
  });

  it('moves the selection and the call-to-action label when another user is picked', async () => {
    const { fixture } = await setup();

    cards(fixture)[2].click(); // student-tom
    fixture.detectChanges();

    expect(cards(fixture)[0].classList).not.toContain('cast--selected');
    expect(cards(fixture)[2].classList).toContain('cast--selected');
    expect(cta(fixture).textContent).toContain('Continue as student-tom');
  });

  it('signs in the picked user and goes to the lobby', async () => {
    const { fixture, currentUser, navigate } = await setup();

    cards(fixture)[2].click();
    fixture.detectChanges();
    cta(fixture).click();
    await fixture.whenStable();

    expect(currentUser.signedInAs?.id).toBe('student-tom');
    expect(navigate).toHaveBeenCalledWith(['/lobby'], { queryParams: {} });
  });

  it('carries a call link through the picker so a student lands on the call', async () => {
    const { fixture, navigate } = await setup();
    fixture.componentRef.setInput('call_id', 'abc-123-xyz');
    fixture.detectChanges();

    expect(text(fixture)).toContain('abc-123-xyz');

    cta(fixture).click();
    await fixture.whenStable();

    expect(navigate).toHaveBeenCalledWith(['/lobby'], {
      queryParams: { call_id: 'abc-123-xyz' },
    });
  });

  it('stays put when connecting fails, so the error stays on screen', async () => {
    const currentUser = new FakeCurrentUser();
    currentUser.result = false;
    const { fixture, navigate } = await setup(currentUser);

    cta(fixture).click();
    await fixture.whenStable();

    expect(navigate).not.toHaveBeenCalled();
  });
});
