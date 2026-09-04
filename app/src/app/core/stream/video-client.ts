import { Injectable, inject, signal } from '@angular/core';
import { StreamVideoClient, type Call } from '@stream-io/video-client';
import { DemoConfig } from '../config/demo-config';
import { Notifier } from '../errors/notifier';
import type { DemoUser } from '../models/demo-user.model';

/**
 * Owns the single `StreamVideoClient`.
 *
 * One client holds every call: a proctor is joined to the exam call and the proctors-only
 * whisper call simultaneously, which the SDK supports - it tracks a *list* of calls with no
 * "active call" concept, and the join-once guard is per-`Call`-instance.
 */
@Injectable({ providedIn: 'root' })
export class VideoClient {
  private readonly config = inject(DemoConfig);
  private readonly notifier = inject(Notifier);
  private readonly instance = signal<StreamVideoClient | null>(null);

  readonly connected = signal(false);

  get client(): StreamVideoClient {
    const client = this.instance();
    if (!client) throw new Error('VideoClient used before connect().');
    return client;
  }

  async connect(user: DemoUser): Promise<boolean> {
    if (this.instance()) await this.disconnect();

    const result = await this.notifier.attempt(
      async () => {
        // Constructed WITHOUT `user` on purpose. Passing a user (as getOrCreateInstance
        // requires) makes the SDK fire-and-forget its own connectUser, so awaiting one
        // ourselves would be a second connect - the SDK warns "Consecutive calls to
        // connectUser is detected". Connecting explicitly instead is what lets a bad
        // token surface here as a fatal error rather than in an unrelated later call.
        const client = new StreamVideoClient({
          apiKey: this.config.apiKey,
          options: {
            // Timers move to a worker so a backgrounded tab isn't throttled mid-call.
            enableTimerWorker: true,
            // We own device state ourselves - see DevicePreferences for why.
            devicePersistence: { enabled: false },
            clientAppIdentifier: { sdkName: 'angular', app: 'proctored-exam-demo' },
            maxConnectUserRetries: 3,
            onConnectUserError: (error) => {
              console.error('[stream] connectUser retry failed:', error);
            },
          },
        });
        await client.connectUser({ id: user.id, name: user.name }, user.token);
        return client;
      },
      {
        what: 'Connecting to Stream Video',
        fatal: true,
        retry: () => void this.connect(user),
      },
    );

    if (!result.ok) return false;
    this.instance.set(result.value);
    this.connected.set(true);
    return true;
  }

  async disconnect(): Promise<void> {
    const client = this.instance();
    if (!client) return;
    this.instance.set(null);
    this.connected.set(false);
    // disconnectUser() leaves every call this client still holds, so it doubles as the
    // teardown for a proctor who is in both the exam and whisper calls.
    await this.notifier.attempt(() => client.disconnectUser(), {
      what: 'Disconnecting from Stream Video',
    });
  }

  /**
   * Get the `Call` for a type/id.
   *
   * `reuseInstance` is not optional in this app: without it, re-entering a call route
   * builds a *second* `Call` for the same cid, the client store swaps its entry, and the
   * first instance is orphaned while still joined - a live socket and a live microphone
   * with no UI attached to them. It is also what lets the lobby's call object flow into
   * the call route with its camera already running.
   */
  callFor(type: string, id: string, opts: { reuse?: boolean } = {}): Call {
    return this.client.call(type, id, { reuseInstance: opts.reuse ?? true });
  }
}
