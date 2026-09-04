import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { CurrentUser } from '../../../core/auth/current-user';
import type { DemoUser } from '../../../core/models/demo-user.model';
import { AppHeader } from './app-header';

const PROCTOR: DemoUser = { id: 'proctor-john', name: 'John', role: 'proctor', token: 't' };

class FakeCurrentUser {
  readonly user = signal<DemoUser | null>(PROCTOR);
  signedOut = false;
  restore() {
    return this.user();
  }
  async signIn() {
    return true;
  }
  async signOut(): Promise<void> {
    this.signedOut = true;
    this.user.set(null);
  }
}

function setup(currentUser = new FakeCurrentUser()) {
  TestBed.configureTestingModule({
    imports: [AppHeader],
    providers: [provideRouter([]), { provide: CurrentUser, useValue: currentUser }],
  });
  const fixture = TestBed.createComponent(AppHeader);
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  fixture.componentRef.setInput('context', 'Lobby');
  fixture.detectChanges();
  return { fixture, currentUser, navigate };
}

describe('AppHeader', () => {
  it('shows who is signed in, with their role and initials', () => {
    const { fixture } = setup();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('Video demo');
    expect(text).toContain('Lobby');
    expect(text).toContain('proctor-john');
    expect(text).toContain('proctor');
    expect(text).toContain('JO');
  });

  it('signs out and returns to the picker', async () => {
    const { fixture, currentUser, navigate } = setup();

    fixture.nativeElement.querySelector('button[matIconButton]').click();
    await fixture.whenStable();

    expect(currentUser.signedOut).toBe(true);
    expect(navigate).toHaveBeenCalledWith(['/']);
  });

  it('offers no sign-out when nobody is signed in', () => {
    const currentUser = new FakeCurrentUser();
    currentUser.user.set(null);
    const { fixture } = setup(currentUser);

    expect(fixture.nativeElement.querySelector('button[matIconButton]')).toBeNull();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('nobody yet');
  });
});
