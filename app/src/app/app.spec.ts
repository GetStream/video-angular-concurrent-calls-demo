import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { Notifier } from './core/errors/notifier';

describe('App shell', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('renders the routed outlet when nothing has failed', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.fatal')).toBeNull();
  });

  it('replaces the outlet with the failure state when an SDK call fails fatally', async () => {
    const notifier = TestBed.inject(Notifier);
    await notifier.attempt(() => Promise.reject(new Error('Token signature is invalid')), {
      what: 'Connecting to Stream Video',
      fatal: true,
    });

    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.fatal__title')?.textContent).toContain(
      'Connecting to Stream Video',
    );
    expect(host.querySelector('.fatal__message')?.textContent).toContain(
      'Token signature is invalid',
    );
  });

  it('treats a cancelled picker or aborted request as not an error', async () => {
    const notifier = TestBed.inject(Notifier);
    const cancelled = Object.assign(new Error('cancelled'), { name: 'NotAllowedError' });

    const result = await notifier.attempt(() => Promise.reject(cancelled), {
      what: 'Sharing your screen',
      fatal: true,
    });

    expect(result.ok).toBe(false);
    expect(notifier.fatal()).toBeNull();
  });
});
